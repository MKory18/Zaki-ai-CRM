import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireContext } from '@/lib/geo-context';
import { requirePermission } from '@/lib/authorization';
import { apiErrorResponse } from '@/lib/api-error';
import { logAudit } from '@/lib/audit';
import { receiptGap } from '@/lib/settlement';
import { zodMessage } from '@/lib/zod-message';

/**
 * POST /api/finance/statements/:id/receipts — step 2 of settlement.
 *
 * MANY receipts per statement, each with its own wallet, currency and
 * amount: a courier pays part in cash and part by transfer, and that has to
 * be recordable as it happened. No money moves yet — the wallet movement is
 * written when the statement is APPROVED.
 */
const createSchema = z.object({
  walletId: z.string().uuid(),
  amount: z.number().positive().max(100_000_000),
  receivedAt: z.string().datetime().optional(),
  /** Required when the wallet currency differs from the statement currency. */
  exchangeRate: z.number().positive().max(1_000_000).optional(),
  note: z.string().trim().max(300).optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { user, companyId, storeId, country } = await requireContext();
    await requirePermission('settlement.upload');

    const statement = await db.courierStatement.findFirst({
      where: { id, companyId, storeId },
      select: { id: true, status: true, currencyCode: true, reference: true },
    });
    if (!statement) return NextResponse.json({ error: 'الكشف غير موجود' }, { status: 404 });
    if (statement.status === 'APPROVED') {
      return NextResponse.json({ error: 'الكشف معتمد — أي تصحيح يكون بقيد عكسي', code: 'ALREADY_APPROVED' }, { status: 409 });
    }

    const parsed = createSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: zodMessage(parsed.error) }, { status: 400 });
    }

    const wallet = await db.wallet.findFirst({
      where: { id: parsed.data.walletId, companyId, isActive: true },
      select: { id: true, name: true, currencyCode: true },
    });
    if (!wallet) return NextResponse.json({ error: 'المحفظة غير موجودة' }, { status: 404 });

    // A different currency needs the rate the money actually changed at.
    if (wallet.currencyCode !== statement.currencyCode && !parsed.data.exchangeRate) {
      return NextResponse.json(
        {
          error: `عملة المحفظة (${wallet.currencyCode}) تختلف عن عملة الكشف (${statement.currencyCode}) — أدخل سعر الصرف`,
          code: 'EXCHANGE_RATE_REQUIRED',
        },
        { status: 400 }
      );
    }

    const receipt = await db.statementReceipt.create({
      data: {
        companyId,
        statementId: id,
        walletId: wallet.id,
        amount: parsed.data.amount,
        currencyCode: wallet.currencyCode,
        exchangeRate: parsed.data.exchangeRate ?? null,
        receivedAt: parsed.data.receivedAt ? new Date(parsed.data.receivedAt) : new Date(),
        note: parsed.data.note ?? null,
        createdById: user.id,
      },
    });

    await db.courierStatement.update({ where: { id }, data: { status: 'RECEIPTED' } });

    await logAudit({
      companyId, userId: user.id, action: 'STATEMENT_RECEIPT_ADDED',
      entity: 'CourierStatement', entityId: id,
      newData: { receiptId: receipt.id, wallet: wallet.name, amount: parsed.data.amount },
    });

    const gap = await receiptGap(db, id, country.minorUnit);
    return NextResponse.json({ receipt, gap }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
