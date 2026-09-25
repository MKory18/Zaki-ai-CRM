import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * WHAT A RATE ON A SCREEN MEANS.
 *
 * Three things were wrong, and all three made a real number say something
 * it did not mean:
 *
 *  1. The delivery rate divided one column by another — the top counted a
 *     partial delivery (read from shippingStatus), the bottom did not (read
 *     from the legacy merged column). It could pass 100%.
 *  2. The confirmation rate divided by EVERY order, so the orders nobody had
 *     looked at yet counted as failures: the rate fell whenever intake sped
 *     up. It measured the queue, not the work.
 *  3. "Rejected" counted a parcel that came back as a confirmation refusal,
 *     blaming the person who confirmed it for the customer's decision at the
 *     door.
 */

const { db } = vi.hoisted(() => ({
  db: {
    order: { groupBy: vi.fn(), count: vi.fn(), aggregate: vi.fn(), findMany: vi.fn() },
    orderItem: { groupBy: vi.fn(async () => []) },
    expense: { aggregate: vi.fn(async () => ({ _sum: { amount: 0 } })) },
    user: { findMany: vi.fn(async () => []) },
    product: { findMany: vi.fn(async () => []) },
  },
}));
vi.mock('./db', () => ({ db }));
vi.mock('./commission', () => ({
  commissionCostForOrders: async () => 0,
  commissionByUserForOrders: async () => new Map(),
}));

import { getCompanyAnalytics } from './analytics';
import { CONFIRMATION_REFUSED, DELIVERED_SHIPPING, rateOf } from './order-state';

/** A window of orders, described by the two columns that are actually written. */
function window(confirmation: Record<string, number>, shipping: Record<string, number>) {
  db.order.groupBy.mockImplementation(async ({ by }: { by: string[] }) => {
    if (by.includes('confirmationStatus') && !by.includes('moderatorId')) {
      return Object.entries(confirmation).map(([confirmationStatus, n]) => ({ confirmationStatus, _count: { _all: n } }));
    }
    if (by.includes('shippingStatus')) {
      return Object.entries(shipping).map(([shippingStatus, n]) => ({ shippingStatus, _count: { _all: n } }));
    }
    return [];
  });
  db.order.count.mockResolvedValue(0);
  db.order.aggregate.mockResolvedValue({ _count: { _all: 0 }, _sum: {} });
  db.order.findMany.mockResolvedValue([]);
  return getCompanyAnalytics({ companyId: 'c1', storeId: 's1' });
}

beforeEach(() => vi.clearAllMocks());

describe('the delivery rate', () => {
  it('counts a partial delivery on BOTH sides, so it cannot pass 100%', async () => {
    // Ten confirmed; the courier delivered six in full and four in part.
    const a = await window({ CONFIRMED: 10 }, { DELIVERED: 6, PARTIALLY_DELIVERED: 4 });
    expect(a.ordersCount.delivered).toBe(10);
    expect(a.rates.deliveryRate).toBe(100);
  });

  it('is measured against orders that were EVER confirmed — shipping does not empty it', async () => {
    // All ten shipped, so none is "confirmed right now" — but all ten were
    // confirmed, and that is what the courier was given to deliver.
    const a = await window({ CONFIRMED: 10 }, { SHIPPED: 5, DELIVERED: 5 });
    expect(a.ordersCount.confirmed).toBe(10);
    expect(a.rates.deliveryRate).toBe(50);
  });
});

describe('the confirmation rate', () => {
  it('is out of what was decided, not out of everything', async () => {
    // 8 confirmed, 2 refused, and 90 still sitting in the queue.
    const a = await window({ CONFIRMED: 8, REJECTED: 2, NEW: 50, IN_PROGRESS: 40 }, {});
    expect(a.ordersCount.decided).toBe(10);
    expect(a.rates.confirmationRate).toBe(80);
  });

  it('does not fall when the queue grows — the negative case', async () => {
    const quiet = await window({ CONFIRMED: 8, REJECTED: 2 }, {});
    const busy = await window({ CONFIRMED: 8, REJECTED: 2, NEW: 500 }, {});
    expect(busy.rates.confirmationRate).toBe(quiet.rates.confirmationRate);
    // The old formula divided by everything: 8/510 would have read 2%.
    expect(busy.rates.confirmationRate).toBe(80);
  });

  it('counts a refusal to confirm — never a parcel that came back', async () => {
    // An order confirmed and then returned from the door carries BOTH:
    // confirmationStatus CONFIRMED, shippingStatus RETURNED. The old list
    // read RETURNED as a confirmation refusal, so the same order was counted
    // as confirmed and as rejected, and blamed the person who confirmed it
    // for what the customer decided at the door.
    const a = await window({ CONFIRMED: 9, REJECTED: 1 }, { RETURNED: 3, DELIVERED: 6 });
    expect(a.ordersCount.rejected).toBe(1);
    expect(a.ordersCount.confirmed).toBe(9);
    expect(a.ordersCount.decided).toBe(10);
    expect(a.rates.confirmationRate).toBe(90);
    // And the returned parcels are counted where they belong: not delivered.
    expect(a.ordersCount.delivered).toBe(6);
  });

  it('reads the refusal from the confirmation column only — the negative case', async () => {
    // Nothing was refused at confirmation; everything that failed, failed at
    // the door. The rate is 100%, because confirmation did its job.
    const a = await window({ CONFIRMED: 10 }, { RETURNED: 4, FAILED_DELIVERY: 2, DELIVERED: 4 });
    expect(a.ordersCount.rejected).toBe(0);
    expect(a.rates.confirmationRate).toBe(100);
  });
});

describe('the shared definitions', () => {
  it('delivered means the goods reached the customer, in part or in full', () => {
    expect([...DELIVERED_SHIPPING]).toEqual(['DELIVERED', 'PARTIALLY_DELIVERED']);
  });

  it('a refusal is a confirmation refusal, and nothing from the door', () => {
    expect([...CONFIRMATION_REFUSED]).toEqual(['REJECTED', 'CANCELLED']);
    expect(CONFIRMATION_REFUSED as readonly string[]).not.toContain('RETURNED');
    expect(CONFIRMATION_REFUSED as readonly string[]).not.toContain('FAILED_DELIVERY');
  });

  it('a rate with nothing decided is unknown, not zero', () => {
    // "Nobody decided anything" and "everything failed" are different facts.
    expect(rateOf(0, 0)).toBeNull();
    expect(rateOf(0, 5)).toBe(0);
    expect(rateOf(3, 4)).toBe(75);
  });
});
