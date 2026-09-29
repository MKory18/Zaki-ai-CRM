import { NextResponse } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
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
 *
 * ── WHY A REPEAT IS THE DANGEROUS CASE, AND WHY IT CANNOT BE GUESSED ──
 *
 * Because many receipts per statement are legitimate, two identical ones —
 * same wallet, same amount, seconds apart — are indistinguishable from a
 * courier paying 50 twice. Nothing on the server can tell a genuine second
 * payment from a double-click or a retried request, so the CALLER says
 * which it is: it generates one id per attempt and reuses it on every
 * retry of that attempt. A replay lands on the row that is already there.
 *
 * The id is the receipt's own primary key, so the uniqueness is the one the
 * database already enforces — no second key to keep in step with it.
 */
const createSchema = z.object({
  /**
   * The caller's id for THIS attempt. Optional so an existing client keeps
   * working, and every retry that sends one is safe.
   */
  receiptId: z.string().uuid().optional(),
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

    /*
     * A REPLAY FINDS ITS OWN ROW AND CHANGES NOTHING.
     *
     * Checked before the write rather than only catching the conflict,
     * because the answer differs: this caller's earlier attempt is a
     * success to repeat, while somebody else's id is a refusal. Scoped to
     * the company and the statement so an id from another tenant is not
     * even looked at.
     */
    if (parsed.data.receiptId) {
      const already = await db.statementReceipt.findFirst({
        where: { id: parsed.data.receiptId, companyId, statementId: id },
      });
      if (already) {
        const gap = await receiptGap(db, id, country.minorUnit);
        return NextResponse.json({ receipt: already, gap, replay: true }, { status: 200 });
      }
    }

    /*
     * ONE TRANSACTION: the receipt and the status it puts the statement
     * into are one fact. Written apart, a failure between them leaves money
     * recorded against a statement that still says nobody has paid — and
     * the screen offers «record a receipt» again for a receipt that exists.
     */
    let receipt;
    try {
      receipt = await db.$transaction(async (tx) => {
        const created = await tx.statementReceipt.create({
          data: {
            ...(parsed.data.receiptId ? { id: parsed.data.receiptId } : {}),
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
        await tx.courierStatement.update({ where: { id }, data: { status: 'RECEIPTED' } });
        return created;
      });
    } catch (e) {
      /*
       * Two requests carrying the same id at the same moment: the check
       * above saw nothing, the database saw the second one. P2002 here can
       * only be that id, and the honest answer is that it is taken.
       */
      if (parsed.data.receiptId && e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        return NextResponse.json({ error: 'هذا الإيصال مسجَّلٌ سلفاً', code: 'RECEIPT_EXISTS' }, { status: 409 });
      }
      throw e;
    }

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
