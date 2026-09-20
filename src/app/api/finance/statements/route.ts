import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireContext } from '@/lib/geo-context';
import { requirePermission } from '@/lib/authorization';
import { apiErrorResponse } from '@/lib/api-error';
import { logAudit } from '@/lib/audit';
import { fileHash, parseStatementCsv, receiptGap } from '@/lib/settlement';
import { roundMinor } from '@/lib/money';

/**
 * Courier statements — step 1 of settlement.
 *
 *   GET  /api/finance/statements
 *   POST /api/finance/statements   { deliveryProviderId, fileName, content, ... }
 *
 * The file's SHA-256 is stored and unique per company: importing the same
 * statement twice is impossible, which is the whole point of the hash.
 */

const importSchema = z.object({
  deliveryProviderId: z.string().uuid(),
  reference: z.string().trim().min(2).max(80),
  fileName: z.string().trim().min(1).max(200),
  /** Raw CSV text of the courier file. */
  content: z.string().min(2).max(5_000_000),
  periodFrom: z.string().datetime().optional().nullable(),
  periodTo: z.string().datetime().optional().nullable(),
});

export async function GET() {
  try {
    const { companyId, storeId, country } = await requireContext();
    await requirePermission('settlement.view');

    const statements = await db.courierStatement.findMany({
      where: { companyId, storeId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        _count: { select: { lines: true, receipts: true, matches: true } },
        receipts: { select: { amount: true } },
      },
    });

    return NextResponse.json({
      statements: await Promise.all(
        statements.map(async (s) => ({
          id: s.id,
          reference: s.reference,
          fileName: s.fileName,
          status: s.status,
          currencyCode: s.currencyCode,
          totalAmount: Number(s.totalAmount),
          createdAt: s.createdAt,
          periodFrom: s.periodFrom,
          periodTo: s.periodTo,
          counts: s._count,
          gap: await receiptGap(db, s.id, country.minorUnit),
        }))
      ),
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(req: Request) {
  try {
    const { user, companyId, storeId, country } = await requireContext();
    await requirePermission('settlement.upload');

    const parsed = importSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message || 'بيانات غير صالحة' }, { status: 400 });
    }
    const input = parsed.data;

    const provider = await db.deliveryProvider.findFirst({
      where: { id: input.deliveryProviderId, companyId },
      select: { id: true, name: true },
    });
    if (!provider) return NextResponse.json({ error: 'شركة الشحن غير موجودة' }, { status: 404 });

    const hash = fileHash(input.content);
    const duplicate = await db.courierStatement.findFirst({
      where: { companyId, fileHash: hash },
      select: { id: true, reference: true, createdAt: true },
    });
    if (duplicate) {
      return NextResponse.json(
        {
          error: `هذا الكشف مستورد مسبقاً باسم ${duplicate.reference}`,
          code: 'DUPLICATE_STATEMENT',
          statementId: duplicate.id,
        },
        { status: 409 }
      );
    }

    const { rows, total, error } = parseStatementCsv(input.content);
    if (error) return NextResponse.json({ error, code: 'UNREADABLE_FILE' }, { status: 400 });

    const statement = await db.$transaction(async (tx) => {
      const created = await tx.courierStatement.create({
        data: {
          companyId,
          storeId,
          deliveryProviderId: provider.id,
          reference: input.reference,
          periodFrom: input.periodFrom ? new Date(input.periodFrom) : null,
          periodTo: input.periodTo ? new Date(input.periodTo) : null,
          totalAmount: roundMinor(total, country.minorUnit),
          currencyCode: country.currencyCode,
          fileName: input.fileName,
          fileHash: hash,
          uploadedById: user.id,
        },
      });
      await tx.statementLine.createMany({
        data: rows.map((r) => ({
          statementId: created.id,
          merchantRef: r.merchantRef,
          barcode: r.barcode,
          amount: r.amount,
          status: r.status,
          rawRow: r.rawRow,
        })),
      });
      return created;
    });

    await logAudit({
      companyId, userId: user.id, action: 'STATEMENT_IMPORTED',
      entity: 'CourierStatement', entityId: statement.id,
      newData: { reference: input.reference, courier: provider.name, rows: rows.length, total, fileHash: hash },
    });

    return NextResponse.json({ statement, rows: rows.length, total }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
