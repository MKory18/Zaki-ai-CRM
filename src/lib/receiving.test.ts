import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Stock that is added must actually exist afterwards.
 *
 * The defect these cover: an adjustment used to write an InventoryMovement
 * and touch no batch, so the ledger said units arrived while on-hand — which
 * is the sum of batch remainders — stayed at zero, and the shipment screen
 * reported a shortage for stock someone had just entered.
 */

const { db } = vi.hoisted(() => ({
  db: {
    productionBatch: { create: vi.fn(), aggregate: vi.fn(), count: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    inventoryMovement: { create: vi.fn() },
  },
}));

vi.mock('./db', () => ({ db }));

import { drawDownStock, receiveStock } from './receiving';

beforeEach(() => {
  vi.clearAllMocks();
  db.productionBatch.create.mockImplementation(async ({ data }: any) => ({ id: 'b-new', ...data }));
  db.productionBatch.count.mockResolvedValue(0);
  db.productionBatch.aggregate.mockResolvedValue({ _sum: { quantityRemaining: 50 } });
  db.inventoryMovement.create.mockImplementation(async ({ data }: any) => ({ id: 'm1', ...data }));
  db.productionBatch.update.mockResolvedValue({});
});

describe('receiveStock', () => {
  const input = { companyId: 'c1', productId: 'p1', quantity: 50, unitCost: 3, createdById: 'u1' };

  it('creates a batch holding the units, not just a ledger line', async () => {
    const result = await receiveStock(db as never, input);

    expect(db.productionBatch.create).toHaveBeenCalledTimes(1);
    expect(db.productionBatch.create.mock.calls[0][0].data).toMatchObject({
      productId: 'p1', quantityProduced: 50, quantityRemaining: 50, costPerUnit: 3,
    });
    expect(result.balanceAfter).toBe(50);
  });

  it('records the movement against that batch', async () => {
    await receiveStock(db as never, input);
    expect(db.inventoryMovement.create.mock.calls[0][0].data).toMatchObject({
      batchId: 'b-new', quantity: 50, balanceAfter: 50, type: 'PRODUCTION',
    });
  });

  it('gives the batch a readable number when none is supplied', async () => {
    await receiveStock(db as never, input);
    expect(db.productionBatch.create.mock.calls[0][0].data.batchNumber).toMatch(/^RCV-\d{8}-001$/);
  });

  it('refuses a zero or negative quantity', async () => {
    await expect(receiveStock(db as never, { ...input, quantity: 0 })).rejects.toThrow();
    await expect(receiveStock(db as never, { ...input, quantity: -5 })).rejects.toThrow();
  });
});

describe('drawDownStock', () => {
  /*
    * Two batches at two prices, because that is the whole point of taking
    * the oldest first: the March run and the June delivery are different
    * money sitting on the same shelf.
    */
  const batches = [
    { id: 'old', quantityRemaining: 10, quantitySold: 0, costPerUnit: 3.2 },
    { id: 'new', quantityRemaining: 40, quantitySold: 0, costPerUnit: 4.1 },
  ];

  it('takes from the oldest batch first', async () => {
    db.productionBatch.findMany.mockResolvedValue(batches);
    const result = await drawDownStock(db as never, { companyId: 'c1', productId: 'p1', quantity: 25, allowNegative: false });

    // 10 from the old run at 3.20, 15 from the new one at 4.10 — the
    // money that actually left, not an average of the two.
    expect(result).toEqual({ taken: 25, short: 0, cost: 93.5 });
    expect(db.productionBatch.update.mock.calls[0][0]).toMatchObject({
      where: { id: 'old' }, data: { quantityRemaining: 0, quantitySold: 10 },
    });
    expect(db.productionBatch.update.mock.calls[1][0]).toMatchObject({
      where: { id: 'new' }, data: { quantityRemaining: 25, quantitySold: 15 },
    });
  });

  it('refuses to take more than exists', async () => {
    db.productionBatch.findMany.mockResolvedValue(batches);
    await expect(
      drawDownStock(db as never, { companyId: 'c1', productId: 'p1', quantity: 60, allowNegative: false })
    ).rejects.toThrow(/غير كافٍ/);
  });

  it('reports the shortfall instead of writing a negative remainder', async () => {
    db.productionBatch.findMany.mockResolvedValue(batches);
    const result = await drawDownStock(db as never, { companyId: 'c1', productId: 'p1', quantity: 60, allowNegative: true });

    // 10×3.20 + 40×4.10 = 196. The ten that were short cost nothing:
    // they never left a batch, and pricing them would invent money.
    expect(result).toEqual({ taken: 50, short: 10, cost: 196 });
    for (const call of db.productionBatch.update.mock.calls) {
      expect(call[0].data.quantityRemaining).toBeGreaterThanOrEqual(0);
    }
  });
});
