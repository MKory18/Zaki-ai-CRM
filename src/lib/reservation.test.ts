import { beforeEach, describe, expect, it, vi } from 'vitest';

/** Reservation is per line and is released in the same transaction as the state change. */

const { db } = vi.hoisted(() => ({
  db: {
    orderItem: { findMany: vi.fn(), update: vi.fn(), updateMany: vi.fn(), aggregate: vi.fn() },
    productionBatch: { aggregate: vi.fn() },
    /*
     * The double now models a TRANSACTION client, not the root one: it has
     * `$executeRaw` and no `$transaction`. That is not decoration — the
     * function refuses to run on a client that can open transactions,
     * because the lock it takes would be released the instant it is taken.
     */
    $executeRaw: vi.fn(),
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
  db.$executeRaw.mockResolvedValue(1);
});

/** The SQL a `$executeRaw` tagged template was called with, joined back up. */
const rawCalls = () =>
  db.$executeRaw.mock.calls.map((c: unknown[]) => ({
    sql: (c[0] as string[]).join('?').replace(/\s+/g, ' ').trim(),
    args: c.slice(1),
  }));

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

  /**
   * THE RACE THIS CLOSES, AND WHY A UNIT TEST CANNOT SHOW IT.
   *
   * Two workers reserving 400 each out of a batch of 500 both used to
   * succeed, both reported no shortage, and the shelf ended 800 reserved of
   * 500 — reproduced against the real database, which is the only place two
   * transactions can actually overlap. What a unit test CAN hold is the
   * shape of the fix, and the shape is where every regression would land:
   * the lock taken, on the right pool, before the first read, for every
   * product, in a fixed order, and never outside a transaction.
   */
  describe('the lock that makes the answer safe to act on', () => {
    it('is taken before availability is read', async () => {
      db.orderItem.findMany.mockResolvedValue([line()]);
      stock(10, 0);
      await reserveOrderLines(db as never, 'o1', { allowNegativeStock: false });
      const lockedAt = db.$executeRaw.mock.invocationCallOrder[0];
      const readAt = db.productionBatch.aggregate.mock.invocationCallOrder[0];
      expect(lockedAt, 'قُرئ المخزونُ قبل قفله').toBeLessThan(readAt);
    });

    it('names the same pool availability is computed for', async () => {
      db.orderItem.findMany.mockResolvedValue([line()]);
      stock(10, 0);
      await reserveOrderLines(db as never, 'o1', { allowNegativeStock: false });
      const [call] = rawCalls();
      expect(call.sql).toContain('pg_advisory_xact_lock');
      expect(call.args).toEqual([4711, 'stock:c1:*:p1']);
    });

    it('locks every product of the order, once each, in a fixed order', async () => {
      db.orderItem.findMany.mockResolvedValue([
        line({ id: 'i1', productId: 'p9' }),
        line({ id: 'i2', productId: 'p3' }),
        // The same product twice is one pool, so one lock.
        line({ id: 'i3', productId: 'p9' }),
      ]);
      stock(100, 0);
      await reserveOrderLines(db as never, 'o1', { allowNegativeStock: false });
      // Sorted, and that is the whole deadlock story: two orders holding
      // p3 and p9 in opposite order would otherwise wait on each other.
      expect(rawCalls().map((c) => c.args[1])).toEqual(['stock:c1:*:p3', 'stock:c1:*:p9']);
    });

    it('refuses a client that can open transactions, since the lock would not hold', async () => {
      const root = { ...db, $transaction: vi.fn() };
      await expect(reserveOrderLines(root as never, 'o1', { allowNegativeStock: false })).rejects.toThrow(
        /داخل معاملة/
      );
      expect(db.orderItem.findMany, 'قرأ الطلبَ قبل أن يرفض').not.toHaveBeenCalled();
    });
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
