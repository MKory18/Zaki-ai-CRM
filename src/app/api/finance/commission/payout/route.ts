import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireCompanyTenant } from '@/lib/auth';
import { requirePermission } from '@/lib/authorization';
import { apiErrorResponse } from '@/lib/api-error';
import { logAudit } from '@/lib/audit';
import { zodMessage } from '@/lib/zod-message';
import { PayoutRefused, owedTo, payCommission } from '@/lib/commission-payout';

/**
 *   GET  /api/finance/commission/payout?userId=…  what they are owed
 *   POST /api/finance/commission/payout           pay it, from one wallet
 *
 * Paying commission is money leaving the business, so it needs the
 * permission that moves money — not the one that reads the report. And it
 * happens in ONE transaction with the wallet movement: an entry marked paid
 * while the cash never left, or cash out with nothing marked paid, are both
 * worse than the payment failing.
 */

const paySchema = z.object({
  userId: z.string().uuid(),
  walletId: z.string().uuid(),
  entryIds: z.array(z.string().uuid()).min(1).max(500),
  /** Wallet currency per person currency, as the owner writes it. */
  exchangeRate: z.number().positive().max(1_000_000),
  note: z.string().trim().max(200).optional().nullable(),
});

export async function GET(req: Request) {
  try {
    const { companyId } = await requireCompanyTenant();
    await requirePermission('finance.view');

    const userId = new URL(req.url).searchParams.get('userId');
    if (!userId) return NextResponse.json({ error: 'حدّد الموظف' }, { status: 400 });

    const [owed, person, wallets] = await Promise.all([
      owedTo(db, { companyId, userId }),
      db.user.findFirst({
        where: { id: userId, companyId },
        select: { id: true, name: true, commissionCurrency: true },
      }),
      // The wallets the money could come out of — any of them, whatever its
      // currency: the point is that the person's currency may have none.
      db.wallet.findMany({
        where: { companyId, isActive: true },
        select: { id: true, name: true, currencyCode: true },
        orderBy: { name: 'asc' },
      }),
    ]);
    if (!person) return NextResponse.json({ error: 'الموظف غير موجود' }, { status: 404 });

    return NextResponse.json({ person, owed, wallets });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(req: Request) {
  try {
    const { user, companyId } = await requireCompanyTenant();
    // Money leaving the business, not a report being read.
    await requirePermission('finance.create');

    const parsed = paySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: zodMessage(parsed.error) }, { status: 400 });
    }

    const result = await db.$transaction((tx) =>
      payCommission(tx, { ...parsed.data, companyId, createdById: user.id })
    );

    await logAudit({
      companyId,
      userId: user.id,
      action: 'COMMISSION_PAID',
      entity: 'CommissionPayout',
      entityId: result.payoutId,
      newData: {
        person: parsed.data.userId,
        amount: result.amount,
        currency: result.currencyCode,
        paidAmount: result.paidAmount,
        paidCurrency: result.paidCurrency,
        exchangeRate: parsed.data.exchangeRate,
        entries: result.entries,
      },
    });

    return NextResponse.json({ payout: result }, { status: 201 });
  } catch (error) {
    // A refusal is a sentence the owner can act on, not a 500.
    if (error instanceof PayoutRefused) {
      return NextResponse.json({ error: error.message, reason: error.reason }, { status: 400 });
    }
    return apiErrorResponse(error);
  }
}
