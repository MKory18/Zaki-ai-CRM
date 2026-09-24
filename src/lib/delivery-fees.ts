import type { Prisma } from '@prisma/client';
import { db } from './db';
import { computeCod, roundMinor } from './money';

type Tx = Prisma.TransactionClient | typeof db;

/**
 * DELIVERY FEES — one row per courier per country per region.
 *
 * The fee that lands on an order is a SNAPSHOT: changing the table later
 * never rewrites a live order, the same way a commission rule change never
 * touches a closed period. A manual override always carries a reason and is
 * written to the audit log by the caller.
 */

export interface ResolvedFee {
  fee: number;
  lateThresholdDays: number;
  returnFee: number;
  source: 'TABLE' | 'NONE';
}

/** The table fee for a courier in a region, or an explicit "no row" answer. */
export async function resolveDeliveryFee(
  tx: Tx,
  params: { deliveryProviderId: string; regionId: string | null; minorUnit: number }
): Promise<ResolvedFee> {
  if (!params.regionId) return { fee: 0, lateThresholdDays: 0, returnFee: 0, source: 'NONE' };

  const row = await tx.deliveryFee.findFirst({
    where: { deliveryProviderId: params.deliveryProviderId, regionId: params.regionId, isActive: true },
    select: { fee: true, lateThresholdDays: true, returnFee: true },
  });
  if (!row) return { fee: 0, lateThresholdDays: 0, returnFee: 0, source: 'NONE' };

  return {
    fee: roundMinor(Number(row.fee), params.minorUnit),
    lateThresholdDays: row.lateThresholdDays,
    returnFee: roundMinor(Number(row.returnFee), params.minorUnit),
    source: 'TABLE',
  };
}

export interface OrderLineLike {
  quantity: number;
  unitPrice: number | Prisma.Decimal;
  freeQuantity?: number;
  discountShare?: number | Prisma.Decimal;
}

/**
 * COD for one order with the courier's fee applied — the same money
 * function every other screen uses, never a second formula.
 */
export function codForOrder(params: {
  lines: OrderLineLike[];
  /** The order's accepted add-ons (OrderAddOn). Omitting them drops their money from the COD. */
  addOns?: Array<{ quantity: number; price: number | { toString(): string } }>;
  deliveryFee: number;
  priceIncludesDelivery: boolean;
  minorUnit: number;
}) {
  const discount = params.lines.reduce((sum, l) => sum + Number(l.discountShare ?? 0), 0);
  return computeCod({
    lines: params.lines.map((l) => ({
      quantity: l.quantity,
      unitPrice: Number(l.unitPrice),
      freeQuantity: l.freeQuantity,
    })),
    discount,
    deliveryFee: params.deliveryFee,
    priceIncludesDelivery: params.priceIncludesDelivery,
    minorUnit: params.minorUnit,
    addOns: (params.addOns ?? []).map((a) => ({ quantity: a.quantity, unitPrice: Number(a.price) })),
  });
}

/**
 * Whether an order's price already contains delivery — ONE rule for every
 * door (direct, landing page, storefront, Telegram).
 *
 * It is the STORE's pricing policy; an offer may turn it on for its own
 * bundle. It used to be applied to direct orders only, so a store that
 * advertises delivery-inclusive prices had its landing-page and Telegram
 * orders collected as price + fee.
 */
export async function priceIncludesDeliveryFor(
  storeId: string,
  offerDeliveryIncluded?: boolean | null
): Promise<boolean> {
  if (offerDeliveryIncluded === true) return true;
  const store = await db.store.findFirst({ where: { id: storeId }, select: { priceIncludesDelivery: true } });
  return store?.priceIncludesDelivery === true;
}
