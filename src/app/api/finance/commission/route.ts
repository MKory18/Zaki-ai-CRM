import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireContext } from '@/lib/geo-context';
import { requirePermission } from '@/lib/authorization';
import { apiErrorResponse } from '@/lib/api-error';
import { logAudit } from '@/lib/audit';
import { accrueForOrder, periodOf } from '@/lib/commission';
import {
  calendarReadiness,
  fairnessFor,
  rankDisagreements,
  whereCountsTowardCommission,
  type DayWork,
} from '@/lib/commission-fairness';

/**
 * The first moment of a YYYY-MM period and the first moment after it.
 *
 * UTC, to match `periodOf` — which is what decides a commission entry's
 * month. A day bucketed on local midnight while its period is bucketed on
 * UTC would occasionally land the two in different months, and then the
 * fairness table and the money table would be describing different windows
 * under one heading.
 */
function periodWindow(period: string): { start: Date; end: Date } {
  const [year, month] = period.split('-').map(Number);
  const start = new Date(Date.UTC(year, month - 1, 1));
  return { start, end: new Date(Date.UTC(year, month, 1)) };
}

/** The UTC calendar day an instant falls in — the fairness grid's bucket. */
const dayKey = (d: Date) => d.toISOString().slice(0, 10);

/**
 * IS THE VOLUME LEADERBOARD FAIR? — the owner's «البنات جابوا طلبات أكثر».
 *
 * Two populations, because his sentence covers both and they are counted off
 * different columns: a confirmation agent's day is dated by when they
 * confirmed, a moderator's by when the order arrived. Merging them would
 * compare a phone call with a lead.
 *
 * Cancelled orders are out of both, by the one predicate — counting an order
 * that was cancelled would be the very thing he said a correct rule never
 * does, and it would also distort the fairness ratio itself.
 */
async function fairnessBlocks(companyId: string, storeId: string | null, period: string) {
  const { start, end } = periodWindow(period);
  const scope = { companyId, ...(storeId ? { storeId } : {}) };

  const [confirmed, sourced] = await Promise.all([
    db.order.findMany({
      where: {
        AND: [whereCountsTowardCommission(), { ...scope, confirmedById: { not: null }, confirmedAt: { gte: start, lt: end } }],
      },
      select: { confirmedById: true, confirmedAt: true },
    }),
    db.order.findMany({
      where: {
        AND: [whereCountsTowardCommission(), { ...scope, moderatorId: { not: null }, createdAt: { gte: start, lt: end } }],
      },
      select: { moderatorId: true, createdAt: true },
    }),
  ]);

  const confirmRows: DayWork[] = confirmed.map((o) => ({
    day: dayKey(o.confirmedAt as Date),
    userId: o.confirmedById as string,
    count: 1,
  }));
  const sourceRows: DayWork[] = sourced.map((o) => ({
    day: dayKey(o.createdAt),
    userId: o.moderatorId as string,
    count: 1,
  }));

  return {
    confirmed: fairnessFor(confirmRows),
    sourced: fairnessFor(sourceRows),
    /**
     * Whether the month-phase adjustment he asked for can be attempted at
     * all. Measured over the WHOLE record rather than this period, because
     * that is the question: has this business seen enough months?
     */
    calendar: calendarReadiness(
      (
        await db.order.findMany({
          where: { AND: [whereCountsTowardCommission(), scope] },
          select: { createdAt: true },
        })
      ).map((o) => o.createdAt)
    ),
  };
}

/**
 * Commission entries.
 *
 *   GET  /api/finance/commission?period=YYYY-MM   what each person earned
 *   POST /api/finance/commission                  accrue for delivered orders
 *
 * Accrual happens on DELIVERED and is idempotent, so running it twice pays
 * nobody twice. Entries become PAYABLE only when the settlement that covers
 * their order is approved.
 */
const accrueSchema = z.object({
  orderIds: z.array(z.string().uuid()).max(500).optional(),
});

export async function GET(req: Request) {
  try {
    const { companyId, storeId, country } = await requireContext();
    await requirePermission('finance.view');

    const period = new URL(req.url).searchParams.get('period') ?? periodOf(new Date());

    const entries = await db.commissionEntry.findMany({
      where: { companyId, periodMonth: period },
      orderBy: { createdAt: 'desc' },
      take: 1000,
      include: { order: { select: { orderNumber: true, merchantRef: true, deliveredAt: true } } },
    });

    const fairness = await fairnessBlocks(companyId, storeId, period);

    // Names for everybody either table mentions — the fairness rows come from
    // the ORDERS, so they include people who earned nothing this month and
    // therefore have no ledger entry to be named by.
    const userIds = [
      ...new Set([
        ...entries.map((e) => e.userId),
        ...fairness.confirmed.map((a) => a.userId),
        ...fairness.sourced.map((a) => a.userId),
      ]),
    ];
    const users = userIds.length
      ? await db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, role: true } })
      : [];
    const nameOf = new Map(users.map((u) => [u.id, u.name]));

    const byUser = new Map<string, { userId: string; name: string; accrued: number; payable: number; paid: number; reversed: number }>();
    for (const entry of entries) {
      const row = byUser.get(entry.userId) ?? {
        userId: entry.userId,
        name: nameOf.get(entry.userId) ?? '—',
        accrued: 0, payable: 0, paid: 0, reversed: 0,
      };
      const amount = Number(entry.amount);
      if (entry.status === 'ACCRUED') row.accrued += amount;
      else if (entry.status === 'PAYABLE') row.payable += amount;
      else if (entry.status === 'PAID') row.paid += amount;
      else row.reversed += amount;
      byUser.set(entry.userId, row);
    }

    const named = (rows: typeof fairness.confirmed) =>
      rows.map((a) => ({ ...a, userName: nameOf.get(a.userId) ?? '—' }));

    return NextResponse.json({
      period,
      currencyCode: country.currencyCode,
      totals: [...byUser.values()],
      entries: entries.map((e) => ({
        ...e,
        amount: Number(e.amount),
        userName: nameOf.get(e.userId) ?? null,
      })),
      /**
       * WHETHER THE VOLUME TABLE ABOVE IS FAIR.
       *
       * Every agent compared only against the colleagues who worked the same
       * days, which removes the payday effect without needing to model it.
       * `calendar` says whether the month-phase curve the owner asked for can
       * be fitted yet, and `swaps` names the pairs whose ranking flips once
       * the calendar is controlled for — the evidence for changing how a rule
       * is banded, rather than another opinion about it.
       */
      fairness: {
        confirmed: named(fairness.confirmed),
        sourced: named(fairness.sourced),
        calendar: fairness.calendar,
        swaps: {
          confirmed: rankDisagreements(fairness.confirmed),
          sourced: rankDisagreements(fairness.sourced),
        },
      },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(req: Request) {
  try {
    const { user, companyId, storeId, country } = await requireContext();
    await requirePermission('finance.create');

    const parsed = accrueSchema.safeParse(await req.json().catch(() => ({})));
    const explicitIds = parsed.success ? parsed.data.orderIds : undefined;

    // Default: every delivered order of this store that has no entry yet.
    const orders = await db.order.findMany({
      where: {
        companyId,
        storeId,
        shippingStatus: 'DELIVERED',
        ...(explicitIds && explicitIds.length > 0 ? { id: { in: explicitIds } } : { commissions: { none: {} } }),
      },
      select: { id: true },
      take: 500,
    });

    let created = 0;
    const skipped: Record<string, number> = {};
    for (const order of orders) {
      const result = await db.$transaction((tx) =>
        accrueForOrder(tx, { companyId, orderId: order.id, minorUnit: country.minorUnit })
      );
      created += result.created;
      if (result.skipped) skipped[result.skipped] = (skipped[result.skipped] ?? 0) + 1;
    }

    await logAudit({
      companyId, userId: user.id, action: 'COMMISSION_ACCRUED',
      entity: 'CommissionEntry', entityId: 'batch',
      newData: { orders: orders.length, created, skipped },
    });

    return NextResponse.json({ orders: orders.length, created, skipped });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
