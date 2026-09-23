import { db } from './db';
import type { Prisma } from '@prisma/client';

/**
 * RESERVATION — per LINE, never per order (contract, inventory section).
 *
 * Available stock = what production batches still hold, minus what other
 * open orders already reserve. Reserving and releasing always happen inside
 * the caller's transaction, so a cancel/void/unconfirm can never leave stock
 * reserved: `release` runs in the SAME transaction as the state change.
 *
 * allow_negative_stock is a per-country setting, enforced at shipment
 * creation rather than order creation; here it decides whether a shortage
 * blocks the reservation or is recorded and flagged.
 */

type Tx = Prisma.TransactionClient | typeof db;

/**
 * STOCK IS A STORE'S, NOT A COMPANY'S.
 *
 * Two stores drawing on one pile can each promise a customer what the other
 * has already taken, and neither count is wrong on its own screen. So every
 * question about stock is asked of one store.
 *
 * `storeId` is optional only while the existing rows are being placed. Left
 * out, these behave exactly as they did before — nothing silently changes
 * meaning half way through a migration. Once every batch carries a store,
 * the callers pass it and the pool is separated for good.
 */

/** Reserved units of a product across every order of this store still open. */
export async function reservedElsewhere(
  tx: Tx,
  companyId: string,
  productId: string,
  exceptOrderId?: string,
  storeId?: string | null
) {
  const agg = await tx.orderItem.aggregate({
    where: {
      companyId,
      productId,
      ...(exceptOrderId ? { orderId: { not: exceptOrderId } } : {}),
      reservedQty: { gt: 0 },
      order: {
        // The order already knows its store — this side needs no migration.
        ...(storeId ? { storeId } : {}),
        confirmationStatus: { notIn: ['REJECTED', 'CANCELLED'] },
        shippingStatus: { notIn: ['DELIVERED', 'RETURNED', 'CANCELLED'] },
      },
    },
    _sum: { reservedQty: true },
  });
  return agg._sum.reservedQty ?? 0;
}

/** Units sitting in this store's production batches (what physically exists). */
export async function onHand(tx: Tx, companyId: string, productId: string, storeId?: string | null) {
  const agg = await tx.productionBatch.aggregate({
    where: { companyId, productId, ...(storeId ? { storeId } : {}) },
    _sum: { quantityRemaining: true },
  });
  return agg._sum.quantityRemaining ?? 0;
}

/** What a new reservation may still take. */
export async function availableStock(
  tx: Tx,
  companyId: string,
  productId: string,
  exceptOrderId?: string,
  storeId?: string | null
) {
  const [physical, reserved] = await Promise.all([
    onHand(tx, companyId, productId, storeId),
    reservedElsewhere(tx, companyId, productId, exceptOrderId, storeId),
  ]);
  return physical - reserved;
}

export interface ReservationOutcome {
  /** Lines whose full quantity (including gift units) is now reserved. */
  reserved: number;
  /** Lines left short because stock is missing. */
  shortages: { orderItemId: string; productId: string; productName: string; missing: number }[];
}

/**
 * Reserve every line of an order. With negative stock disallowed the short
 * lines stay unreserved (the order cannot become READY_TO_SHIP); with it
 * allowed they are reserved and reported as shortages for the daily alert.
 */
export async function reserveOrderLines(
  tx: Tx,
  orderId: string,
  opts: { allowNegativeStock: boolean }
): Promise<ReservationOutcome> {
  const items = await tx.orderItem.findMany({
    where: { orderId },
    select: { id: true, companyId: true, productId: true, productName: true, quantity: true, freeQuantity: true, reservedQty: true },
  });

  const outcome: ReservationOutcome = { reserved: 0, shortages: [] };
  for (const item of items) {
    const need = item.quantity + item.freeQuantity - item.reservedQty;
    if (need <= 0) {
      outcome.reserved++;
      continue;
    }
    const available = await availableStock(tx, item.companyId, item.productId, orderId);
    const missing = Math.max(0, need - available);

    if (missing > 0) {
      outcome.shortages.push({
        orderItemId: item.id,
        productId: item.productId,
        productName: item.productName,
        missing,
      });
      if (!opts.allowNegativeStock) continue; // line stays unreserved — blocks READY_TO_SHIP
    }

    await tx.orderItem.update({
      where: { id: item.id },
      data: { reservedQty: item.quantity + item.freeQuantity },
    });
    outcome.reserved++;
  }
  return outcome;
}

/**
 * Release every reservation of an order. MUST run in the same transaction as
 * CANCELLED / VOIDED / unconfirm / NEEDS_REVIEW-after-confirmation.
 */
export async function releaseOrderLines(tx: Tx, orderId: string): Promise<number> {
  const res = await tx.orderItem.updateMany({
    where: { orderId, reservedQty: { gt: 0 } },
    data: { reservedQty: 0 },
  });
  return res.count;
}

/** Lines of an order in the shape the READY_TO_SHIP guard expects. */
export async function orderLinesForGuard(tx: Tx, orderId: string) {
  return tx.orderItem.findMany({
    where: { orderId },
    select: { quantity: true, freeQuantity: true, reservedQty: true },
  });
}
