import { beforeEach, describe, expect, it, vi } from 'vitest';

/** Reservation is per line and is released in the same transaction as the state change. */

const { db } = vi.hoisted(() => ({
  db: {
    orderItem: { findMany: vi.fn(), update: vi.fn(), updateMany: vi.fn(), aggregate: vi.fn() },
    productionBatch: { aggregate: vi.fn() },
  },
}));
vi.mock('./db', () => ({ db }));

import { onHand, releaseOrderLines, reservedElsewhere, reserveOrderLines } from './reservation';

const line = (over: Partial<Record<string, unknown>> = {}) => ({
  id: 'i1', companyId: 'c1', productId: 'p1', productName: 'X', quantity: 2, freeQuantity: 0, reservedQty: 0, ...over,
});

function stock(onHand: number, reservedElsewhere: number) {
  db.productionBatch.aggregate.mockResolvedValue({ _sum: { quantityRemaining: onHand } });
  db.orderItem.aggregate.mockResolvedValue({ _sum: { reservedQty: reservedElsewhere } });
}

beforeEach(() => {
  vi.clearAllMocks();
  db.orderItem.update.mockResolvedValue({});
  db.orderItem.updateMany.mockResolvedValue({ count: 1 });
});

describe('reserveOrderLines', () => {
  it('reserves quantity plus gift units', async () => {
    db.orderItem.findMany.mockResolvedValue([line({ quantity: 2, freeQuantity: 1 })]);
    stock(10, 0);
    const out = await reserveOrderLines(db as never, 'o1', { allowNegativeStock: false });
    expect(out.shortages).toEqual([]);
    expect(db.orderItem.update).toHaveBeenCalledWith(expect.objectContaining({ data: { reservedQty: 3 } }));
  });

  it('subtracts what other open orders already hold', async () => {
    db.orderItem.findMany.mockResolvedValue([line({ quantity: 5 })]);
    stock(10, 8); // only 2 left
    const out = await reserveOrderLines(db as never, 'o1', { allowNegativeStock: false });
    expect(out.shortages[0]).toMatchObject({ productId: 'p1', missing: 3 });
  });

  it('leaves a short line unreserved when negative stock is disallowed', async () => {
    db.orderItem.findMany.mockResolvedValue([line({ quantity: 5 })]);
    stock(1, 0);
    const out = await reserveOrderLines(db as never, 'o1', { allowNegativeStock: false });
    expect(db.orderItem.update).not.toHaveBeenCalled();
    expect(out.reserved).toBe(0);
    expect(out.shortages).toHaveLength(1);
  });

  it('reserves and flags the shortage when negative stock is allowed', async () => {
    db.orderItem.findMany.mockResolvedValue([line({ quantity: 5 })]);
    stock(1, 0);
    const out = await reserveOrderLines(db as never, 'o1', { allowNegativeStock: true });
    expect(db.orderItem.update).toHaveBeenCalledWith(expect.objectContaining({ data: { reservedQty: 5 } }));
    expect(out.shortages).toHaveLength(1);
  });

  it('does not re-reserve a line that is already covered', async () => {
    db.orderItem.findMany.mockResolvedValue([line({ quantity: 2, reservedQty: 2 })]);
    stock(0, 0);
    const out = await reserveOrderLines(db as never, 'o1', { allowNegativeStock: false });
    expect(db.orderItem.update).not.toHaveBeenCalled();
    expect(out.reserved).toBe(1);
  });
});

describe('releaseOrderLines', () => {
  it('zeroes every reservation of the order', async () => {
    await releaseOrderLines(db as never, 'o1');
    expect(db.orderItem.updateMany).toHaveBeenCalledWith({
      where: { orderId: 'o1', reservedQty: { gt: 0 } },
      data: { reservedQty: 0 },
    });
  });
});

/**
 * Stock is a store's, not a company's.
 *
 * Two stores drawing on one pile can each promise a customer what the other
 * has already taken, and neither screen is wrong on its own. These check
 * that a store is asked about, and — just as important — that leaving the
 * store out keeps the old behaviour exactly, so nothing changes meaning
 * half way through placing the existing rows.
 */
describe('stock asked of one store', () => {
  it("counts only that store's batches", async () => {
    await onHand(db as never, 'c1', 'p1', 's1');
    expect(db.productionBatch.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { companyId: 'c1', productId: 'p1', storeId: 's1' } })
    );
  });

  it('counts every batch when no store is given — unchanged behaviour', async () => {
    await onHand(db as never, 'c1', 'p1');
    expect(db.productionBatch.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { companyId: 'c1', productId: 'p1' } })
    );
  });

  it("counts only that store's reservations", async () => {
    await reservedElsewhere(db as never, 'c1', 'p1', undefined, 's1');
    const where = db.orderItem.aggregate.mock.calls.at(-1)![0].where;
    expect(where.order.storeId).toBe('s1');
  });

  it('counts every reservation when no store is given', async () => {
    await reservedElsewhere(db as never, 'c1', 'p1');
    const where = db.orderItem.aggregate.mock.calls.at(-1)![0].where;
    expect(where.order.storeId).toBeUndefined();
  });
});
