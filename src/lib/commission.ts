import type { Prisma } from '@prisma/client';
import { db } from './db';
import { roundMinor } from './money';

type Tx = Prisma.TransactionClient | typeof db;

/**
 * COMMISSION — one source of truth.
 *
 * Rules are DATA with an effective_from date, so changing a rule today never
 * recalculates a closed period. Commission is ACCRUED when the order is
 * delivered and becomes PAYABLE only after the settlement that covers it is
 * approved. A returned order generates zero commission for every party, and
 * a correction is a reversing entry — an approved month is never rewritten.
 *
 * The legacy per-user `User.commissionRate` is NOT used here: two sources
 * would diverge the first time someone edited one of them.
 */

export const COMMISSION_STATUSES = ['ACCRUED', 'PAYABLE', 'PAID', 'REVERSED'] as const;

export function periodOf(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

export interface RuleLike {
  id: string;
  appliesToRole: string | null;
  appliesToUserId: string | null;
  type: string;
  value: number | Prisma.Decimal;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  isActive: boolean;
}

/**
 * The rule that governs an order: the most specific one (a rule for this
 * person beats a rule for their role) that was in force ON THE DAY the
 * order was delivered — not today.
 */
export function ruleFor(
  rules: RuleLike[],
  params: { userId: string; role: string; at: Date }
): RuleLike | null {
  const candidates = rules.filter(
    (r) =>
      r.isActive &&
      r.effectiveFrom <= params.at &&
      (!r.effectiveTo || r.effectiveTo >= params.at) &&
      (r.appliesToUserId === params.userId || (!r.appliesToUserId && r.appliesToRole === params.role))
  );
  if (candidates.length === 0) return null;

  return candidates.sort((a, b) => {
    const specific = Number(!!b.appliesToUserId) - Number(!!a.appliesToUserId);
    if (specific !== 0) return specific;
    return b.effectiveFrom.getTime() - a.effectiveFrom.getTime();
  })[0];
}

export function commissionAmount(rule: RuleLike, orderRevenue: number, minorUnit: number): number {
  const value = Number(rule.value);
  return roundMinor(rule.type === 'PERCENT' ? (orderRevenue * value) / 100 : value, minorUnit);
}

export interface AccrualResult {
  created: number;
  skipped: 'NOT_DELIVERED' | 'RETURNED' | 'NO_RULE' | 'ALREADY_ACCRUED' | null;
  amount?: number;
}

/**
 * Accrue commission for one delivered order. Idempotent: a second call for
 * the same order and person does nothing, so a retried job cannot double-pay.
 */
export async function accrueForOrder(
  tx: Tx,
  params: { companyId: string; orderId: string; minorUnit: number }
): Promise<AccrualResult> {
  const order = await tx.order.findFirst({
    where: { id: params.orderId, companyId: params.companyId },
    select: {
      id: true, storeId: true, shippingStatus: true, deliveredAt: true, currency: true,
      totalAmount: true, deliveryFee: true, priceIncludesDelivery: true,
      moderatorId: true, claimedById: true, confirmedById: true,
      moderator: { select: { id: true, role: true } },
      confirmer: { select: { id: true, role: true } },
    },
  });
  if (!order) throw new Error('Order not found');

  // A returned order earns nobody anything.
  if (['RETURNED', 'RETURN_REQUESTED', 'FAILED_DELIVERY'].includes(order.shippingStatus)) {
    return { created: 0, skipped: 'RETURNED' };
  }
  if (order.shippingStatus !== 'DELIVERED') return { created: 0, skipped: 'NOT_DELIVERED' };

  const at = order.deliveredAt ?? new Date();
  const period = periodOf(at);

  /**
   * This STORE's agreement, never the company's.
   *
   * The rules used to be company-wide, so one store's arrangement with its
   * agents paid out on another store's deliveries — money leaving the wrong
   * books, and nobody notices until the month closes. A rule with no store
   * has not been placed yet and pays nothing: allowing it everywhere is the
   * same leak in a different shape.
   */
  const rules = (await tx.commissionRule.findMany({
    where: { companyId: params.companyId, storeId: order.storeId, isActive: true },
  })) as unknown as RuleLike[];

  // Commission is earned on the sale, not on the courier's fee. `totalAmount`
  // holds the COD figure from computeCod, and COD minus the fee is the sale
  // revenue under BOTH pricing modes: with the fee included COD is the net and
  // revenue is net − fee; with it added on top COD is net + fee, so
  // COD − fee is the net again. One expression covers both on purpose.
  const revenue = Number(order.totalAmount) - Number(order.deliveryFee ?? 0);

  const parties = [
    order.moderator ? { userId: order.moderator.id, role: order.moderator.role } : null,
    order.confirmer && order.confirmer.id !== order.moderator?.id
      ? { userId: order.confirmer.id, role: order.confirmer.role }
      : null,
  ].filter(Boolean) as { userId: string; role: string }[];

  let created = 0;
  let total = 0;
  for (const party of parties) {
    const rule = ruleFor(rules, { userId: party.userId, role: party.role, at });
    if (!rule) continue;

    const existing = await tx.commissionEntry.findFirst({
      where: { orderId: order.id, userId: party.userId, status: { in: ['ACCRUED', 'PAYABLE', 'PAID'] } },
      select: { id: true },
    });
    if (existing) continue;

    const amount = commissionAmount(rule, revenue, params.minorUnit);
    if (amount <= 0) continue;

    await tx.commissionEntry.create({
      data: {
        companyId: params.companyId,
        orderId: order.id,
        userId: party.userId,
        role: party.role,
        ruleId: rule.id,
        amount,
        currencyCode: order.currency,
        status: 'ACCRUED',
        periodMonth: period,
      },
    });
    created++;
    total += amount;
  }

  if (created === 0) return { created: 0, skipped: 'NO_RULE' };
  return { created, skipped: null, amount: roundMinor(total, params.minorUnit) };
}

/**
 * Reverse every commission of an order — used when a delivered order comes
 * back. The original entries stay; a reversing entry cancels them out.
 */
export async function reverseForOrder(
  tx: Tx,
  params: { companyId: string; orderId: string; reason: string }
) {
  const entries = await tx.commissionEntry.findMany({
    where: { companyId: params.companyId, orderId: params.orderId, status: { in: ['ACCRUED', 'PAYABLE', 'PAID'] } },
  });

  let reversed = 0;
  for (const entry of entries) {
    const already = await tx.commissionEntry.findUnique({ where: { reversalOfId: entry.id } });
    if (already) continue;

    await tx.commissionEntry.create({
      data: {
        companyId: entry.companyId,
        orderId: entry.orderId,
        userId: entry.userId,
        role: entry.role,
        ruleId: entry.ruleId,
        amount: Number(entry.amount) * -1,
        currencyCode: entry.currencyCode,
        status: 'REVERSED',
        // The reversal lands in the CURRENT period: an approved month is closed.
        periodMonth: periodOf(new Date()),
        reversalOfId: entry.id,
        reversalReason: params.reason,
      },
    });
    reversed++;
  }
  return reversed;
}

/**
 * Settlement approval is what makes commission payable: before the money is
 * in, nobody is owed anything.
 */
export async function markPayableForOrders(tx: Tx, companyId: string, orderIds: string[]) {
  if (orderIds.length === 0) return 0;
  const res = await tx.commissionEntry.updateMany({
    where: { companyId, orderId: { in: orderIds }, status: 'ACCRUED' },
    data: { status: 'PAYABLE' },
  });
  return res.count;
}
