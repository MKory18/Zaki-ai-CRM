import type { Prisma } from '@prisma/client';
import type { db as prismaDb } from './db';
import { drawDownStock, onHandTotal } from './receiving';

type Tx = Prisma.TransactionClient | typeof prismaDb;

/**
 * WHERE A RESERVATION BECOMES A SALE.
 *
 * Confirming an order reserves units; delivering it was supposed to consume
 * them. It never did. The reservation was released the moment the order left
 * the open set, the batch kept its full remainder, and the unit quietly
 * returned to the sellable pool — so the same unit could be sold again, and
 * again. On this database: 115 delivered orders, 173 units handed to
 * customers, and every batch still reading 0 sold.
 *
 * Two rules hold everything together:
 *
 *   Units live in batches. A ledger line that does not move a batch moves
 *   nothing — it only makes the ledger disagree with the shelf.
 *
 *   Consuming twice is worse than not consuming. Couriers retry, webhooks
 *   redeliver, and a human presses the button again; so consumption is keyed
 *   to the order and asks the ledger before it touches anything.
 */

/** A movement of this type carrying this orderId means the order is settled. */
const SALE = 'SALE';
const RETURN = 'RETURN';

export interface ConsumptionResult {
  /** Units actually taken out of batches. */
  taken: number;
  /** Units the order needed that no batch could supply. */
  short: number;
  /** True when a previous call had already done the work. */
  alreadyDone: boolean;
}

/**
 * Has this order already moved stock in this direction?
 *
 * The check is the ledger itself rather than a flag on the order, because the
 * ledger is what the stock figures are reconciled against; a flag can drift
 * from it, and then nobody can tell which one is lying.
 */
async function alreadyMoved(tx: Tx, orderId: string, type: string): Promise<boolean> {
  const seen = await tx.inventoryMovement.findFirst({
    where: { referenceId: orderId, type },
    select: { id: true },
  });
  return seen !== null;
}

/**
 * Take an order's goods out of stock, oldest batch first.
 *
 * Runs inside the caller's transaction so the units leave stock in the same
 * commit that marks the order delivered — there is no window in which the
 * order is delivered and the goods are still for sale.
 */
export async function consumeOrderStock(
  tx: Tx,
  input: { orderId: string; companyId: string; allowNegativeStock: boolean; userId?: string | null }
): Promise<ConsumptionResult> {
  if (await alreadyMoved(tx, input.orderId, SALE)) {
    return { taken: 0, short: 0, alreadyDone: true };
  }

  const order = await tx.order.findFirst({
    where: { id: input.orderId, companyId: input.companyId },
    select: {
      orderNumber: true,
      items: {
        select: { productId: true, productName: true, quantity: true, freeQuantity: true },
      },
    },
  });
  if (!order) return { taken: 0, short: 0, alreadyDone: false };

  let taken = 0;
  let short = 0;

  for (const line of order.items) {
    // The gift units are goods too. Leaving them in stock is how a shelf
    // ends up holding inventory that was given away.
    const need = line.quantity + line.freeQuantity;
    if (need <= 0) continue;

    const result = await drawDownStock(tx, {
      companyId: input.companyId,
      productId: line.productId,
      quantity: need,
      allowNegative: input.allowNegativeStock,
    });
    taken += result.taken;
    short += result.short;

    if (result.taken > 0) {
      await tx.inventoryMovement.create({
        data: {
          companyId: input.companyId,
          productId: line.productId,
          type: SALE,
          quantity: -result.taken,
          balanceAfter: await onHandTotal(tx, input.companyId, line.productId),
          referenceId: input.orderId,
          reason: `تسليم الطلب ${order.orderNumber}`,
          createdById: input.userId ?? null,
        },
      });
    }
  }

  // The reservation has served its purpose: the units are gone, not held.
  await tx.orderItem.updateMany({
    where: { orderId: input.orderId, reservedQty: { gt: 0 } },
    data: { reservedQty: 0 },
  });

  return { taken, short, alreadyDone: false };
}

/**
 * Put returned goods back on the shelf.
 *
 * The returns screen already wrote a RETURN line to the ledger — and stopped
 * there, so the ledger said the goods were back while no batch had gained a
 * single unit and the shipment screen still reported a shortage. Units go
 * into a batch of their own, at the cost they left at, so a return cannot
 * quietly rewrite the cost of goods on stock that never moved.
 */
export async function restoreOrderStock(
  tx: Tx,
  input: {
    orderId: string;
    companyId: string;
    /** Units confirmed sound after counting — never the shipped quantity. */
    receivedQty: number;
    userId?: string | null;
  }
): Promise<{ restored: number; alreadyDone: boolean }> {
  if (input.receivedQty <= 0) return { restored: 0, alreadyDone: false };
  if (await alreadyMoved(tx, input.orderId, RETURN)) {
    return { restored: 0, alreadyDone: true };
  }

  const order = await tx.order.findFirst({
    where: { id: input.orderId, companyId: input.companyId },
    select: {
      orderNumber: true,
      items: { select: { productId: true, quantity: true, freeQuantity: true } },
    },
  });
  if (!order) return { restored: 0, alreadyDone: false };

  let remaining = input.receivedQty;
  let restored = 0;

  for (const line of order.items) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, line.quantity + line.freeQuantity);
    if (take <= 0) continue;
    remaining -= take;

    // What did this unit cost when it left? Its own batches are the honest
    // answer, and a return at an invented cost silently moves the profit.
    const lastCost = await tx.productionBatch.findFirst({
      where: { companyId: input.companyId, productId: line.productId },
      orderBy: { productionDate: 'desc' },
      select: { costPerUnit: true },
    });
    const costPerUnit = lastCost?.costPerUnit ?? 0;

    const batch = await tx.productionBatch.create({
      data: {
        companyId: input.companyId,
        productId: line.productId,
        batchNumber: `RET-${order.orderNumber}-${line.productId.slice(0, 6)}`,
        quantityProduced: take,
        quantityRemaining: take,
        quantitySold: 0,
        manufacturingCost: 0,
        totalProductionCost: costPerUnit * take,
        costPerUnit,
        productionDate: new Date(),
        notes: `مرتجع الطلب ${order.orderNumber} — بعد العد والفحص`,
        status: 'COMPLETED',
      },
    });

    await tx.inventoryMovement.create({
      data: {
        companyId: input.companyId,
        productId: line.productId,
        batchId: batch.id,
        type: RETURN,
        quantity: take,
        balanceAfter: await onHandTotal(tx, input.companyId, line.productId),
        referenceId: input.orderId,
        reason: `مرتجع ${order.orderNumber} — بعد العد والفحص`,
        createdById: input.userId ?? null,
      },
    });

    restored += take;
  }

  return { restored, alreadyDone: false };
}
