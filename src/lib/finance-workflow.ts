/**
 * SALESFLOW — Phase D3: Settlement & Finance Workflow Engine
 *
 * Money is ALWAYS Decimal (never floats) — DB Decimal(12,2) + Prisma Decimal.
 * Settlement transitions are controlled server-side; server sets timestamps.
 */

import { Prisma } from '@prisma/client';

export const SETTLEMENT_STATUSES = [  'NOT_APPLICABLE', 'PENDING', 'PARTIALLY_SETTLED', 'SETTLED',
  'REFUNDED', 'PARTIALLY_REFUNDED', 'CANCELLED', 'PENDING_COLLECTION', 'COLLECTED', 'UNSETTLED',
] as const;
export type SettlementStatus = (typeof SETTLEMENT_STATUSES)[number];

/**
 * Controlled settlement transitions.
 * PENDING_COLLECTION/COLLECTED are legacy bridge states mapped onto the new model.
 */
export const SETTLEMENT_TRANSITIONS: Record<SettlementStatus, SettlementStatus[]> = {
  NOT_APPLICABLE: ['PENDING'],
  PENDING: ['PARTIALLY_SETTLED', 'SETTLED', 'REFUNDED', 'PARTIALLY_REFUNDED', 'CANCELLED'],
  PARTIALLY_SETTLED: ['SETTLED', 'REFUNDED', 'PARTIALLY_REFUNDED'],
  SETTLED: ['REFUNDED', 'PARTIALLY_REFUNDED'], // post-settlement refund possible
  REFUNDED: [],                                 // terminal
  PARTIALLY_REFUNDED: ['SETTLED', 'REFUNDED'],
  CANCELLED: [],                                // terminal
  // legacy bridge states (kept compatible with D2 writes)
  PENDING_COLLECTION: ['SETTLED', 'REFUNDED', 'PARTIALLY_REFUNDED'],
  COLLECTED: ['SETTLED', 'REFUNDED', 'PARTIALLY_REFUNDED'],
  UNSETTLED: ['SETTLED', 'REFUNDED', 'PARTIALLY_REFUNDED'],
};

export function isValidSettlementTransition(from: string, to: string): boolean {
  const list = SETTLEMENT_TRANSITIONS[from as SettlementStatus];
  if (!list) return false;
  return list.includes(to as SettlementStatus);
}

/** Transaction types for the append-only ledger */
export const TRANSACTION_TYPES = [
  'REVENUE', 'REFUND', 'EXPENSE', 'COMMISSION', 'SETTLEMENT', 'ADJUSTMENT',
] as const;

/**
 * Compute financial snapshot with Decimal-safe arithmetic (prisma Decimal).
 * All inputs/outputs are Decimal — floats never touch money math.
 */
export function computeFinancials(input: {
  sellingPrice: any; quantity?: any; discount?: any; shippingRevenue?: any;
  productCost?: any; packagingCost?: any; shippingCost?: any;
  advertisingCost?: any; otherCost?: any; moderatorCommission?: any;
}): {
  subtotal: any; totalRevenue: any; totalCost: any;
  grossProfit: any; netProfit: any;
} {
  const D = (v: any) => {
    return new Prisma.Decimal(v ?? 0);
  };
  const add = (a: any, b: any) => D(a).add(D(b));
  const sub = (a: any, b: any) => D(a).sub(D(b));
  const mul = (a: any, b: any) => D(a).mul(D(b));

  const subtotal = mul(D(input.sellingPrice), D(input.quantity ?? 1));
  const totalRevenue = add(subtotal, D(input.discount ?? 0).neg()).add(D(input.shippingRevenue ?? 0));
  const productCost = mul(D(input.productCost ?? 0), D(input.quantity ?? 1));
  const totalCost = add(productCost, D(input.packagingCost ?? 0))
    .add(D(input.shippingCost ?? 0))
    .add(D(input.advertisingCost ?? 0))
    .add(D(input.otherCost ?? 0))
    .add(D(input.moderatorCommission ?? 0));
  const grossProfit = sub(totalRevenue, productCost);
  const netProfit = sub(totalRevenue, totalCost);

  return { subtotal, totalRevenue, totalCost, grossProfit, netProfit };
}
