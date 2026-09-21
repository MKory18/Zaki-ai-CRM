import type { Prisma } from '@prisma/client';
import { db } from './db';

type Tx = Prisma.TransactionClient | typeof db;

/**
 * CUSTOMER RISK — return rate over the last 6 months OR the last 10 orders,
 * whichever window holds more orders. The customer is company-wide: one
 * phone, one person, one risk history, never scoped per country.
 *
 * Tiers: under 15% safe, 15–40% watch, above 40% high risk. High risk also
 * when 3+ orders or two returns land within 60 days. A high-risk customer
 * requires prepayment or supervisor approval and is excluded from automated
 * confirmation — the API says so, the UI only renders it.
 */

export type RiskTier = 'SAFE' | 'WATCH' | 'HIGH';

export interface CustomerRisk {
  tier: RiskTier;
  returnRate: number;
  orders: number;
  returns: number;
  windowDays: number;
  recentReturns60d: number;
  /** High risk: cash on delivery is not offered without approval. */
  requiresPrepaymentOrApproval: boolean;
  /** High risk is never auto-confirmed by a job. */
  excludedFromAutomatedConfirmation: boolean;
}

const RETURNED_STATUSES = ['RETURNED', 'RETURN_REQUESTED', 'FAILED_DELIVERY'];
const SIX_MONTHS_MS = 182 * 24 * 60 * 60 * 1000;
const SIXTY_DAYS_MS = 60 * 24 * 60 * 60 * 1000;

export function tierFor(returnRate: number, orders: number, recentReturns60d: number): RiskTier {
  if (returnRate > 0.4 && orders >= 3) return 'HIGH';
  if (recentReturns60d >= 2) return 'HIGH';
  if (returnRate >= 0.15) return 'WATCH';
  return 'SAFE';
}

export async function customerRisk(tx: Tx, companyId: string, customerId: string, now = new Date()): Promise<CustomerRisk> {
  const since = new Date(now.getTime() - SIX_MONTHS_MS);

  const [sixMonths, lastTen] = await Promise.all([
    tx.order.findMany({
      where: { companyId, customerId, createdAt: { gte: since } },
      select: { shippingStatus: true, returnedAt: true, createdAt: true },
    }),
    tx.order.findMany({
      where: { companyId, customerId },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { shippingStatus: true, returnedAt: true, createdAt: true },
    }),
  ]);

  // Whichever window says more about this customer.
  const window = sixMonths.length >= lastTen.length ? sixMonths : lastTen;
  const windowDays = window === sixMonths ? 182 : 0;

  const returns = window.filter((o) => RETURNED_STATUSES.includes(o.shippingStatus)).length;
  const orders = window.length;
  const returnRate = orders > 0 ? returns / orders : 0;

  const recentReturns60d = window.filter(
    (o) => RETURNED_STATUSES.includes(o.shippingStatus) &&
      new Date(o.returnedAt ?? o.createdAt).getTime() >= now.getTime() - SIXTY_DAYS_MS
  ).length;

  const tier = tierFor(returnRate, orders, recentReturns60d);
  return {
    tier,
    returnRate: Number(returnRate.toFixed(4)),
    orders,
    returns,
    windowDays,
    recentReturns60d,
    requiresPrepaymentOrApproval: tier === 'HIGH',
    excludedFromAutomatedConfirmation: tier === 'HIGH',
  };
}
