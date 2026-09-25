import { describe, expect, it } from 'vitest';
import { earnedBy, isTarget, parseTiers, targetGoal, tierFor, tiersProblem, type Tier } from './commission-rules';

/**
 * THE SIX ARRANGEMENTS THE OWNER ACTUALLY USES.
 *
 * The rule used to be one number — a percent, or a fixed amount, on every
 * delivered order. The other five could not be written down at all, so they
 * were paid by hand from somebody's memory. Each one below is expressed
 * here with DATA only: no commission figure is written in any source file.
 */

const tiers = (...rows: [number, number | null, number, string?][]): Tier[] =>
  rows.map(([from, to, value, label]) => ({ from, to, value, label }));

describe('the six arrangements', () => {
  it('daily confirmed: 100–149 pays one rate, 150–199 another, 200+ a third', () => {
    const t = tiers([100, 149, 0.5], [150, 199, 0.75], [200, null, 1]);
    const pay = (count: number) => earnedBy({ type: 'PER_ORDER', value: 0, tiers: t, count, minorUnit: 2 });
    expect(pay(120).amount).toBe(60); // 120 × 0.5
    expect(pay(160).amount).toBe(120); // 160 × 0.75
    expect(pay(250).amount).toBe(250); // 250 × 1
  });

  it('daily confirmed: 100+ pays ONE fixed bonus, however many above it', () => {
    const t = tiers([100, null, 25, 'مكافأة المئة']);
    const pay = (count: number) => earnedBy({ type: 'FIXED', value: 0, tiers: t, count, minorUnit: 2 });
    expect(pay(100).amount).toBe(25);
    expect(pay(400).amount).toBe(25); // one bonus, not four
    expect(pay(400).tierLabel).toBe('مكافأة المئة');
  });

  it('monthly tiers on what a moderator brought', () => {
    const t = tiers([0, 499, 0.25], [500, null, 0.4]);
    expect(earnedBy({ type: 'PER_ORDER', value: 0, tiers: t, count: 600, minorUnit: 2 }).amount).toBe(240);
  });

  it('delivery rate: 70% and up pays per delivered order, below 60% pays nothing', () => {
    const t = tiers([70, 100, 1.5], [0, 59, 0]);
    const at = (rate: number) => earnedBy({ type: 'PER_ORDER', value: 0, tiers: t, count: rate, minorUnit: 2 });
    expect(at(80).amount).toBe(120); // 80 × 1.5
    expect(at(50).amount).toBe(0);
    // Between the two bands the rule says nothing, and nothing is paid —
    // rather than silently falling into the nearest band.
    expect(at(65).reason).toBe('NO_TIER');
  });

  it('a rule for one product carries its own bands', () => {
    // The productId lives on the rule; the bands are read the same way.
    const t = tiers([10, null, 5]);
    expect(earnedBy({ type: 'FIXED', value: 0, tiers: t, count: 12, minorUnit: 2 }).amount).toBe(5);
  });

  it('a rule with no tiers keeps its single value — every rule written before today', () => {
    expect(earnedBy({ type: 'PERCENT', value: 10, tiers: null, count: 1, amount: 200, minorUnit: 2 }).amount).toBe(20);
    expect(earnedBy({ type: 'FIXED', value: 3, tiers: null, count: 1, minorUnit: 2 }).amount).toBe(3);
  });
});

describe('a minimum sample', () => {
  it('is measured on the ORDERS, not on the rate — 100% out of two is not performance', () => {
    const t = tiers([70, 100, 2]);
    // count is the RATE (100); the figure rests on two orders.
    const r = earnedBy({ type: 'FIXED', value: 0, tiers: t, count: 100, sample: 2, minorUnit: 2, minOrders: 30 });
    expect(r.amount).toBe(0);
    expect(r.reason).toBe('BELOW_MINIMUM');
  });

  it('pays once the sample is big enough', () => {
    const t = tiers([70, 100, 2]);
    expect(earnedBy({ type: 'FIXED', value: 0, tiers: t, count: 80, sample: 50, minorUnit: 2, minOrders: 30 }).amount).toBe(2);
  });

  it('for every other metric the sample IS the count', () => {
    const t = tiers([100, null, 1]);
    // 120 confirmed orders: the count and the sample are the same number.
    expect(earnedBy({ type: 'PER_ORDER', value: 0, tiers: t, count: 120, minorUnit: 2, minOrders: 30 }).amount).toBe(120);
    expect(earnedBy({ type: 'PER_ORDER', value: 0, tiers: t, count: 120, minorUnit: 2, minOrders: 200 }).reason).toBe('BELOW_MINIMUM');
  });
});

describe('bands that cannot be read two ways', () => {
  it('refuses an overlap — otherwise the answer depends on the order of the list', () => {
    expect(tiersProblem(tiers([100, 200, 1], [150, 250, 2]))).toContain('متداخلة');
  });

  it('refuses a band that ends before it starts, and a negative one', () => {
    expect(tiersProblem(tiers([200, 100, 1]))).toContain('قبل بدايتها');
    expect(tiersProblem(tiers([-5, 10, 1]))).toContain('سالبة');
    expect(tiersProblem(tiers([0, 10, -1]))).toContain('سالبة');
  });

  it('refuses "and upwards" anywhere but last', () => {
    expect(tiersProblem(tiers([100, null, 1], [200, 300, 2]))).toContain('الأخيرة');
  });

  it('refuses an empty list', () => {
    expect(tiersProblem([])).toContain('شريحة واحدة');
  });

  it('accepts bands that touch without overlapping', () => {
    expect(tiersProblem(tiers([0, 99, 1], [100, 199, 2], [200, null, 3]))).toBeNull();
  });
});

describe('reading a stored rule', () => {
  it('sorts the bands, whatever order they were saved in', () => {
    const parsed = parseTiers([{ from: 200, to: null, value: 3 }, { from: 0, to: 199, value: 1 }]);
    expect(parsed!.map((t) => t.from)).toEqual([0, 200]);
  });

  it('treats anything that is not a band list as no bands — the single value rules', () => {
    for (const bad of [null, [], 'x', [{ from: 'a', value: 1 }], [{ from: 1 }], [{ from: 1, value: 2, to: 'x' }]]) {
      expect(parseTiers(bad), JSON.stringify(bad)).toBeNull();
    }
  });

  it('labels a band by its own words, or by its numbers', () => {
    const t = tiers([100, 149, 1], [150, null, 2, 'الشريحة العليا']);
    expect(earnedBy({ type: 'FIXED', value: 0, tiers: t, count: 120, minorUnit: 2 }).tierLabel).toBe('100–149');
    expect(earnedBy({ type: 'FIXED', value: 0, tiers: t, count: 900, minorUnit: 2 }).tierLabel).toBe('الشريحة العليا');
  });

  it('finds the band a count falls in, and none below the first', () => {
    const t = tiers([100, 149, 1], [150, null, 2]);
    expect(tierFor(t, 100)?.value).toBe(1);
    expect(tierFor(t, 149)?.value).toBe(1);
    expect(tierFor(t, 150)?.value).toBe(2);
    expect(tierFor(t, 99)).toBeNull();
  });
});

describe('what is never paid', () => {
  it('a negative amount — a rule cannot take money back through a tier', () => {
    expect(earnedBy({ type: 'PERCENT', value: 10, tiers: null, count: 1, amount: -500, minorUnit: 2 }).amount).toBe(0);
  });

  it('rounded to the currency, not to two decimals by habit', () => {
    // A three-decimal currency (JOD) keeps its fils.
    expect(earnedBy({ type: 'PERCENT', value: 1.5, tiers: null, count: 1, amount: 33.333, minorUnit: 3 }).amount).toBe(0.5);
  });
});

describe('a target', () => {
  it('is a rule with one band opening at the goal — not a second engine', () => {
    const t = tiers([150, null, 50, 'هدف ١٥٠']);
    expect(isTarget({ type: 'FIXED', tiers: t })).toBe(true);
    expect(targetGoal(t)).toBe(150);
    // One bonus for reaching it, however far past it they go.
    expect(earnedBy({ type: 'FIXED', value: 0, tiers: t, count: 150, minorUnit: 2 }).amount).toBe(50);
    expect(earnedBy({ type: 'FIXED', value: 0, tiers: t, count: 900, minorUnit: 2 }).amount).toBe(50);
    expect(earnedBy({ type: 'FIXED', value: 0, tiers: t, count: 149, minorUnit: 2 }).amount).toBe(0);
  });

  it('is told apart from a tier rule, which is neither fixed nor single-banded', () => {
    expect(isTarget({ type: 'PER_ORDER', tiers: tiers([150, null, 1]) })).toBe(false);
    expect(isTarget({ type: 'FIXED', tiers: tiers([100, 149, 1], [150, null, 2]) })).toBe(false);
    expect(isTarget({ type: 'FIXED', tiers: tiers([100, 200, 1]) })).toBe(false); // has a ceiling
    expect(isTarget({ type: 'FIXED', tiers: null })).toBe(false);
    expect(targetGoal(null)).toBeNull();
  });
});
