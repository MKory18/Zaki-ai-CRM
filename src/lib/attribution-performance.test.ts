import { beforeEach, describe, expect, it, vi } from 'vitest';

const { db } = vi.hoisted(() => ({
  db: {
    order: { groupBy: vi.fn() },
    user: { findMany: vi.fn() },
    orderChannel: { findMany: vi.fn() },
  },
}));
vi.mock('./db', () => ({ db }));

import { channelPerformance, moderatorPerformance } from './attribution-performance';

/**
 * Who brought the business, and what became of it.
 *
 * The rates are the part that is easy to get quietly wrong: computed from
 * the top of the funnel they blame the wrong step, and a moderator whose
 * orders are still being worked looks like a moderator whose orders failed.
 */

const scope = { companyId: 'c1', storeId: 's1' };
const M = 'mod-1';

/** groupBy returns whichever slice was asked for, in call order. */
const slices = (counts: number[], revenue = [0, 0]) => {
  const [brought, confirmed, rejected, delivered, returned] = counts;
  db.order.groupBy
    .mockResolvedValueOnce([{ moderatorId: M, _count: { _all: brought } }])
    .mockResolvedValueOnce([{ moderatorId: M, _count: { _all: confirmed } }])
    .mockResolvedValueOnce([{ moderatorId: M, _count: { _all: rejected } }])
    .mockResolvedValueOnce([{ moderatorId: M, _count: { _all: delivered } }])
    .mockResolvedValueOnce([{ moderatorId: M, _count: { _all: returned } }])
    .mockResolvedValueOnce([{ moderatorId: M, _sum: { collectedAmount: revenue[0] } }])
    .mockResolvedValueOnce([{ moderatorId: M, _sum: { totalAmount: revenue[1] } }]);
};

beforeEach(() => {
  vi.clearAllMocks();
  db.user.findMany.mockResolvedValue([{ id: M, name: 'سارة', role: 'MODERATOR' }]);
  db.orderChannel.findMany.mockResolvedValue([{ id: 'ch1', name: 'الشيت', kind: 'SHEET' }]);
});

describe('the rates', () => {
  it('divides confirmation by what was decided, not by what was brought', async () => {
    // 10 brought, 6 confirmed, 2 rejected, 2 still being worked. Dividing
    // by 10 would call this 60% and punish her for orders nobody has
    // finished yet.
    slices([10, 6, 2, 0, 0]);
    const [row] = await moderatorPerformance(scope);
    expect(row.decided).toBe(8);
    expect(row.confirmationRate).toBe(75);
  });

  it('divides delivery by what was confirmed, not by what was brought', async () => {
    // An order never confirmed was never the courier's to deliver.
    slices([10, 5, 5, 4, 0]);
    const [row] = await moderatorPerformance(scope);
    expect(row.deliveryRate).toBe(80);
  });

  it('says nothing rather than zero when there is nothing to divide', async () => {
    slices([3, 0, 0, 0, 0]);
    const [row] = await moderatorPerformance(scope);
    expect(row.confirmationRate).toBeNull();
    expect(row.deliveryRate).toBeNull();
  });
});

describe('the money', () => {
  it('uses what was collected where we know it, and the total where we do not', async () => {
    // The same two-part definition the profit screen uses; a second formula
    // is how two screens end up disagreeing about one week.
    slices([10, 8, 2, 8, 0], [900, 100]);
    const [row] = await moderatorPerformance(scope);
    expect(row.revenue).toBe(1000);
  });

  it('spreads it over everything brought, not only what was delivered', async () => {
    // That is the column that tells a big noisy source from a good one.
    slices([10, 8, 2, 8, 0], [1000, 0]);
    const [row] = await moderatorPerformance(scope);
    expect(row.revenuePerOrder).toBe(100);
  });
});

describe('the shape', () => {
  it('asks for nobody when nothing is attributed', async () => {
    db.order.groupBy.mockResolvedValue([]);
    expect(await moderatorPerformance(scope)).toEqual([]);
    expect(db.user.findMany).not.toHaveBeenCalled();
  });

  it('reads channels by name and kind, scoped to the company', async () => {
    db.order.groupBy
      .mockResolvedValueOnce([{ channelId: 'ch1', _count: { _all: 5 } }])
      .mockResolvedValue([]);
    const [row] = await channelPerformance(scope);
    expect(row.name).toBe('الشيت');
    expect(row.kind).toBe('SHEET');
    expect(db.orderChannel.findMany.mock.calls[0][0].where.companyId).toBe('c1');
  });
});
