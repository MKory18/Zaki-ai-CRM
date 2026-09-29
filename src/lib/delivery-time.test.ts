import { describe, expect, it } from 'vitest';
import { summariseDays, deliveryWindowAr, MIN_DELIVERIES } from './delivery-time';
import { repoFile, stripComments } from './guard-source';

/**
 * HOW LONG THIS GOVERNORATE ACTUALLY TAKES.
 *
 * The system already had a number for this and it was not measured:
 * `deliveryFee.lateThresholdDays`, typed by hand, defaulting to 3 for
 * everywhere. It answers «when should I worry», which is a different
 * question from «what do I tell the customer» — and one default tells
 * every customer the same thing whether they live in حلب or السويداء.
 *
 * Measured when this was written: 119 delivered orders, all with both
 * timestamps and a governorate; eight governorates carried 10–28
 * deliveries each and two carried one and two.
 */

const many = (day: number, n: number) => Array.from({ length: n }, () => day);

describe('the window a sample can support', () => {
  /**
   * THE RULE THAT MATTERS. A median of two deliveries is an anecdote, and
   * a date promised from an anecdote is worse than no date — السويداء had
   * exactly two, and they averaged seven days.
   */
  it('says nothing at all below the minimum', () => {
    expect(summariseDays(many(1, MIN_DELIVERIES - 1))).toBeNull();
    expect(summariseDays([])).toBeNull();
    expect(summariseDays([7, 7])).toBeNull();
  });

  it('and speaks once there are enough', () => {
    const w = summariseDays(many(1, MIN_DELIVERIES));
    expect(w).toEqual({ medianDays: 1, slowDays: 1, samples: MIN_DELIVERIES });
  });

  it('reports the usual case and the slow one separately', () => {
    // Eight at one day, two at five: the median is a day, and four in five
    // land inside a day — the slow tail is the fifth.
    const w = summariseDays([...many(1, 8), 5, 5]);
    expect(w?.medianDays).toBe(1);
    expect(w?.slowDays).toBeGreaterThanOrEqual(1);
    expect(w?.samples).toBe(10);
  });

  it('and whole days, because nobody says «1.6 days» to a customer', () => {
    const w = summariseDays([1, 1, 2, 2, 2, 3, 3, 4]);
    expect(Number.isInteger(w?.medianDays)).toBe(true);
    expect(Number.isInteger(w?.slowDays)).toBe(true);
  });

  it('and a negative span is a clock, not a delivery', () => {
    expect(summariseDays([-3, -2, 1, 1, 1])).toBeNull();
  });
});

describe('the sentence a person reads', () => {
  it('is nothing when there is nothing to say', () => {
    expect(deliveryWindowAr(null)).toBeNull();
    expect(deliveryWindowAr(undefined)).toBeNull();
  });

  it('is one number when the usual and the slow case agree', () => {
    const s = deliveryWindowAr({ medianDays: 1, slowDays: 1, samples: 12 });
    expect(s).toBe('يصل عادةً خلال يوم');
  });

  it('and a range when they do not', () => {
    const s = deliveryWindowAr({ medianDays: 1, slowDays: 3, samples: 12 }) ?? '';
    expect(s).toContain('يوم');
    expect(s).toContain('3 أيام');
  });

  it('and never a decimal, in any of them', () => {
    for (const w of [
      { medianDays: 1, slowDays: 2, samples: 9 },
      { medianDays: 2, slowDays: 4, samples: 20 },
      { medianDays: 0, slowDays: 1, samples: 7 },
    ]) {
      expect(deliveryWindowAr(w) ?? '').not.toMatch(/\d+\.\d/);
    }
  });
});

describe('where it comes from', () => {
  const lib = () => stripComments(repoFile('src/lib/delivery-time.ts'));

  it('reads the two timestamps, not a status', () => {
    // An order whose status was rolled back and forward still left on one
    // day and arrived on another.
    const src = lib();
    expect(src).toMatch(/shippedAt: \{ not: null, gte: since \}/);
    expect(src).toMatch(/deliveredAt: \{ not: null \}/);
  });

  it('and only this company’s, and this store’s', () => {
    expect(lib()).toMatch(/companyId: scope\.companyId/);
    expect(lib()).toMatch(/scope\.storeId \? \{ storeId: scope\.storeId \} : \{\}/);
  });

  it('and the order form says it only where it is measured', () => {
    const form = stripComments(repoFile('src/components/orders/CreateOrderModal.tsx'));
    // `deliveryAr` is null below the minimum, so this one condition is the
    // whole of «hide it when the sample cannot carry it».
    expect(form).toMatch(/selectedRegion\?\.deliveryAr &&/);
    expect(form).toMatch(/selectedRegion\.delivery\?\.samples/);
  });
});
