import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * WHAT A COMMISSION RULE IS ALLOWED TO COUNT.
 *
 * This file exists because `sourcedCount` had NO status filter at all. Every
 * order a moderator entered inside the span was counted — cancelled ones
 * included — so a cancelled order sat both in the count a tiered rule bands
 * on and in the `amount` a PERCENT rule multiplies. The owner's rule is
 * explicit: «قاعدة عمولة صحيح ما بظهر ولا طلب ملغي سواء قبل التأكيد او بعد
 * التأكيد».
 *
 * Measured on the dev database, 2026-09-29: 1 of the 150 orders in that base,
 * carrying 20.00 of sale value. Small there only because the whole record
 * holds 7 refusals; the fix was worth making because a live COD shop refuses
 * nothing like 0.7% and every one would have been paid on.
 *
 * The leak was invisible to every unit test because there were none for this
 * file — the money was wrong and nothing in the suite had an opinion. These
 * guards inspect the WHERE clause each reader hands Prisma, which is the only
 * place the rule actually lives.
 */

const { db } = vi.hoisted(() => ({
  db: {
    order: { findMany: vi.fn(), count: vi.fn() },
    orderItem: { findMany: vi.fn() },
  },
}));
vi.mock('./db', () => ({ db }));

import { measure, sampleSize } from './commission-metrics';

const scope = {
  companyId: 'c1',
  storeId: 's1',
  userId: 'u1',
  start: new Date('2026-09-01T00:00:00Z'),
  end: new Date('2026-10-01T00:00:00Z'),
};

beforeEach(() => {
  vi.clearAllMocks();
  db.order.findMany.mockResolvedValue([]);
  db.order.count.mockResolvedValue(0);
  db.orderItem.findMany.mockResolvedValue([]);
});

/** The clause the reader handed Prisma, flattened out of its AND wrapper. */
function clauses(call: number = 0): Record<string, any>[] {
  const where = db.order.findMany.mock.calls[call]?.[0]?.where ?? db.order.count.mock.calls[call]?.[0]?.where;
  expect(where, 'no query was made').toBeTruthy();
  return Array.isArray(where.AND) ? where.AND : [where];
}

/** True when this reader's query excludes a cancelled order both ways round. */
function refusesCancelled(parts: Record<string, any>[]): boolean {
  const confirmation = parts.find((p) => p.confirmationStatus?.notIn);
  const shipping = parts.find((p) => p.shippingStatus?.not !== undefined);
  const deliveredOnly = parts.find(
    (p) => Array.isArray(p.shippingStatus?.in) && !p.shippingStatus.in.includes('CANCELLED')
  );
  const confirmedOnly = parts.find((p) => p.confirmationStatus === 'CONFIRMED');

  const blocksBefore =
    (confirmation?.confirmationStatus.notIn.includes('CANCELLED') &&
      confirmation?.confirmationStatus.notIn.includes('REJECTED')) ||
    Boolean(confirmedOnly);
  const blocksAfter = shipping?.shippingStatus.not === 'CANCELLED' || Boolean(deliveredOnly);
  return Boolean(blocksBefore && blocksAfter);
}

describe('every metric a commission rule can count', () => {
  // MULTI_UNIT_ORDERS and CROSS_SELL_UNITS read their orders through the same
  // `deliveredIn` clause, so they are covered by the same assertion.
  const METRICS = [
    'ORDER_DELIVERED',
    'CONFIRMED_COUNT',
    'SOURCED_COUNT',
    'DELIVERY_RATE',
    'CROSS_SELL_UNITS',
    'MULTI_UNIT_ORDERS',
  ] as const;

  it.each(METRICS)('refuses a cancelled order — %s', async (metric) => {
    await measure(db as never, metric, scope);
    expect(
      refusesCancelled(clauses()),
      `${metric}: قاعدةٌ تحتسب طلباً ملغياً`
    ).toBe(true);
  });

  it('still scopes every metric to the one store', async () => {
    // Stock, money and commission are a STORE's, never a company's: one
    // store's arrangement paying out on another's orders is money leaving the
    // wrong books. Asserted here because the fix above rewrote these clauses.
    for (const metric of METRICS) {
      vi.clearAllMocks();
      db.order.findMany.mockResolvedValue([]);
      await measure(db as never, metric, scope);
      const parts = clauses();
      expect(parts.some((p) => p.storeId === 's1'), `${metric}: بلا حصرٍ بالمستودع`).toBe(true);
      expect(parts.some((p) => p.companyId === 'c1'), `${metric}: بلا حصرٍ بالشركة`).toBe(true);
    }
  });
});

describe('SOURCED_COUNT in particular', () => {
  it('counts orders at arrival, and so needs the cancellation filter most', async () => {
    // The other readers count orders that were DELIVERED, which a cancelled
    // order cannot be. This one counts them the moment they arrive — before
    // anybody knows what becomes of them — which is exactly why it was the
    // only reader without the filter and the only one that leaked.
    await measure(db as never, 'SOURCED_COUNT', scope);
    const parts = clauses();
    expect(parts.some((p) => p.createdAt)).toBe(true);
    expect(parts.some((p) => p.moderatorId === 'u1')).toBe(true);
    expect(refusesCancelled(parts)).toBe(true);
  });

  it('does not silently narrow to delivered orders instead', async () => {
    // The wrong fix. A moderator's rule pays on the leads they brought, so
    // limiting this to delivered orders would not close a leak, it would
    // change what the rule means and cut their commission.
    await measure(db as never, 'SOURCED_COUNT', scope);
    for (const part of clauses()) {
      expect(part.shippingStatus?.in).toBeUndefined();
      expect(part.deliveredAt).toBeUndefined();
    }
  });
});

describe('the delivery rate and its sample', () => {
  it('measure the same population, so a floor cannot be checked against another', async () => {
    // These were two separate copies of one five-line filter. A rate could be
    // computed over one population while its minimum sample was counted over
    // another, and no screen would have looked wrong.
    await measure(db as never, 'DELIVERY_RATE', scope);
    const rate = JSON.stringify(db.order.findMany.mock.calls[0][0].where);

    vi.clearAllMocks();
    db.order.count.mockResolvedValue(0);
    await sampleSize(db as never, 'DELIVERY_RATE', scope);
    const sample = JSON.stringify(db.order.count.mock.calls[0][0].where);

    expect(sample).toBe(rate);
  });

  it('and the sample of any other metric is that metric own count', async () => {
    db.order.findMany.mockResolvedValue([
      { id: 'o1', totalAmount: 10, deliveryFee: 0 },
      { id: 'o2', totalAmount: 10, deliveryFee: 0 },
    ]);
    expect(await sampleSize(db as never, 'SOURCED_COUNT', scope)).toBe(2);
  });
});

describe('an unknown metric', () => {
  it('counts nothing rather than everything', async () => {
    // A rule naming a metric this build does not have must pay zero. The
    // alternative — falling through to an unfiltered query — pays on the
    // whole store.
    const result = await measure(db as never, 'NOT_A_METRIC', scope);
    expect(result).toEqual({ count: 0, amount: 0, orderIds: [] });
    expect(db.order.findMany).not.toHaveBeenCalled();
  });
});
