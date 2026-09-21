import type { Prisma } from '@prisma/client';
import type { db as prismaDb } from './db';

type Tx = Prisma.TransactionClient | typeof prismaDb;

/**
 * Putting stock in and taking it out.
 *
 * On-hand is the sum of `ProductionBatch.quantityRemaining` — that is the
 * only place units actually live. An adjustment that writes an
 * InventoryMovement without touching a batch changes nothing: the ledger
 * says stock arrived and the shipment screen still reports a shortage. That
 * was the bug; every movement now moves real units.
 *
 * Cost per unit is carried by the batch, so receiving at a different cost
 * opens a new batch rather than diluting an old one. Draw-down is oldest
 * batch first, which keeps the cost of goods honest.
 */

export interface ReceiveInput {
  companyId: string;
  productId: string;
  quantity: number;
  /** Cost of one unit in this delivery; opens its own batch. */
  unitCost?: number;
  batchNumber?: string | null;
  note?: string | null;
  createdById: string;
}

export async function nextBatchNumber(tx: Tx, companyId: string): Promise<string> {
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const todays = await tx.productionBatch.count({
    where: { companyId, batchNumber: { startsWith: `RCV-${stamp}` } },
  });
  return `RCV-${stamp}-${String(todays + 1).padStart(3, '0')}`;
}

/** Receive units into stock. Always creates a batch — that is where units live. */
export async function receiveStock(tx: Tx, input: ReceiveInput) {
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
    throw new Error('الكمية المستلمة يجب أن تكون أكبر من صفر');
  }
  const unitCost = Math.max(0, input.unitCost ?? 0);

  const batch = await tx.productionBatch.create({
    data: {
      companyId: input.companyId,
      productId: input.productId,
      batchNumber: input.batchNumber?.trim() || (await nextBatchNumber(tx, input.companyId)),
      quantityProduced: input.quantity,
      quantityRemaining: input.quantity,
      quantitySold: 0,
      manufacturingCost: 0,
      totalProductionCost: unitCost * input.quantity,
      costPerUnit: unitCost,
      productionDate: new Date(),
      notes: input.note ?? null,
      status: 'COMPLETED',
    },
  });

  const balanceAfter = await onHandTotal(tx, input.companyId, input.productId);

  const movement = await tx.inventoryMovement.create({
    data: {
      companyId: input.companyId,
      productId: input.productId,
      batchId: batch.id,
      type: 'PRODUCTION',
      quantity: input.quantity,
      balanceAfter,
      reason: input.note?.trim() || 'استلام بضاعة',
      createdById: input.createdById,
    },
  });

  return { batch, movement, balanceAfter };
}

export async function onHandTotal(tx: Tx, companyId: string, productId: string): Promise<number> {
  const agg = await tx.productionBatch.aggregate({
    where: { companyId, productId },
    _sum: { quantityRemaining: true },
  });
  return agg._sum.quantityRemaining ?? 0;
}

/**
 * Take units out, oldest batch first.
 *
 * Refuses to take more than is there unless the country allows negative
 * stock; even then it never writes a negative `quantityRemaining`, it
 * reports the shortfall so the caller can record it.
 */
export async function drawDownStock(
  tx: Tx,
  input: { companyId: string; productId: string; quantity: number; allowNegative: boolean }
): Promise<{ taken: number; short: number }> {
  if (input.quantity <= 0) return { taken: 0, short: 0 };

  const batches = await tx.productionBatch.findMany({
    where: { companyId: input.companyId, productId: input.productId, quantityRemaining: { gt: 0 } },
    orderBy: [{ productionDate: 'asc' }, { createdAt: 'asc' }],
    select: { id: true, quantityRemaining: true, quantitySold: true },
  });

  const available = batches.reduce((sum, b) => sum + b.quantityRemaining, 0);
  if (available < input.quantity && !input.allowNegative) {
    throw new Error(`المخزون غير كافٍ: المتاح ${available} والمطلوب ${input.quantity}`);
  }

  let left = input.quantity;
  for (const batch of batches) {
    if (left <= 0) break;
    const take = Math.min(batch.quantityRemaining, left);
    await tx.productionBatch.update({
      where: { id: batch.id },
      data: { quantityRemaining: batch.quantityRemaining - take, quantitySold: batch.quantitySold + take },
    });
    left -= take;
  }

  return { taken: input.quantity - left, short: left };
}
