import { describe, expect, it } from 'vitest';
import {
  COST_TRUST,
  DOOR_FAILED_SHIPPING,
  DOOR_RETURNED_SHIPPING,
  UNCOLLECTED_SETTLEMENT,
  UNRECORDED_SETTLEMENT,
  doorOutcome,
  rowCostStated,
  trustOf,
} from './cod-vitals';
import { SETTLEMENT_STATUSES } from './finance-workflow';
import { DELIVERED_SHIPPING } from './order-state';

/**
 * THE GUARDS, WRITTEN AGAINST THE MEASURED DATABASE.
 *
 * Every number quoted in a test name below was read off the live database
 * before the screens were touched, so a rule that stops matching the shop
 * it was built for fails here rather than on somebody's dashboard.
 */

describe('the door outcome', () => {
  it('divides returns by what the door decided, not by orders created', () => {
    // The measured store: 119 delivered, 0 failed, 34 returned-or-returning.
    const out = doorOutcome({ delivered: 119, failed: 0, returned: 34 });
    expect(out.decided).toBe(153);
    expect(out.returnRate).toBe(22);
    expect(out.failureRate).toBe(0);
  });

  it('is null rather than zero when the door has decided nothing', () => {
    const out = doorOutcome({ delivered: 0, failed: 0, returned: 0 });
    expect(out.decided).toBe(0);
    expect(out.returnRate).toBeNull();
    expect(out.failureRate).toBeNull();
  });

  it('counts a return still on its way back as a return', () => {
    expect([...DOOR_RETURNED_SHIPPING]).toContain('RETURN_REQUESTED');
    expect([...DOOR_RETURNED_SHIPPING]).toContain('RETURNED');
  });

  it('never lets a negative or broken count invent a rate', () => {
    const out = doorOutcome({ delivered: -5, failed: Number.NaN, returned: 10 });
    expect(out.decided).toBe(10);
    expect(out.returnRate).toBe(100);
  });

  it('keeps the three door sets apart from each other and from delivery', () => {
    const returned = new Set<string>(DOOR_RETURNED_SHIPPING);
    const failed = new Set<string>(DOOR_FAILED_SHIPPING);
    for (const s of failed) expect(returned.has(s)).toBe(false);
    for (const s of DELIVERED_SHIPPING) {
      expect(returned.has(s), `${s} counted as a return`).toBe(false);
      expect(failed.has(s), `${s} counted as a failure`).toBe(false);
    }
  });
});

describe('where the money is', () => {
  it('names only settlement states that really are money owed to us', () => {
    const known = new Set<string>(SETTLEMENT_STATUSES);
    for (const s of UNCOLLECTED_SETTLEMENT) expect(known.has(s), `${s} is not a settlement status`).toBe(true);
    // SETTLED and COLLECTED are cash in hand; a refund or a cancellation is
    // not an outstanding debt. Any of them here would inflate the figure.
    for (const s of ['SETTLED', 'COLLECTED', 'REFUNDED', 'PARTIALLY_REFUNDED', 'CANCELLED']) {
      expect([...UNCOLLECTED_SETTLEMENT]).not.toContain(s);
    }
  });

  it('keeps «nobody wrote it down» apart from «they owe us»', () => {
    for (const s of UNRECORDED_SETTLEMENT) {
      expect([...UNCOLLECTED_SETTLEMENT], `${s} folded into the debt`).not.toContain(s);
    }
    expect([...UNRECORDED_SETTLEMENT]).toEqual(['NOT_APPLICABLE']);
  });
});

describe('the coverage gate', () => {
  it('withholds the margin on the measured shop — cost on 4 of 119', () => {
    const t = trustOf({ present: 4, population: 119, subject: 'كلفة البضاعة' });
    expect(t.level).toBe('WITHHELD');
    expect(t.share).toBe(3);
    expect(t.ar).toContain('4 من 119');
    expect(t.ar).toContain('لا يُقال');
  });

  it('states it once the field is nearly always written', () => {
    const t = trustOf({ present: 110, population: 119, subject: 'كلفة البضاعة' });
    expect(t.level).toBe('STATED');
  });

  it('says «على نقص» in the band between the two bars', () => {
    const t = trustOf({ present: 80, population: 119, subject: 'كلفة البضاعة' });
    expect(t.level).toBe('PARTIAL');
    expect(t.ar).toContain('39 من 119');
  });

  it('compares the true ratio, not the rounded percentage', () => {
    // 89/100 rounds to 89 — under the bar either way. 895/1000 is 89.5%,
    // which rounds to 90 and must still fail a 90% bar.
    expect(trustOf({ present: 895, population: 1000, subject: 'س' }).share).toBe(90);
    expect(trustOf({ present: 895, population: 1000, subject: 'س' }).level).toBe('PARTIAL');
    expect(trustOf({ present: 900, population: 1000, subject: 'س' }).level).toBe('STATED');
  });

  it('refuses to judge coverage at all below the population floor', () => {
    // Four delivered orders, all of them costed: a perfect share that means
    // nothing, because one more order moves it 20 points.
    const t = trustOf({ present: 4, population: 4, subject: 'كلفة البضاعة' });
    expect(t.level).toBe('WITHHELD');
    expect(t.ar).toContain(String(COST_TRUST.minPopulation));
  });

  it('says there is nothing to measure rather than reporting 0%', () => {
    const t = trustOf({ present: 0, population: 0, subject: 'كلفة البضاعة' });
    expect(t.level).toBe('WITHHELD');
    expect(t.share).toBeNull();
    expect(t.ar).toContain('لا طلبات');
  });

  it('clamps a miscounted present instead of printing over 100%', () => {
    const t = trustOf({ present: 200, population: 119, subject: 'كلفة البضاعة' });
    expect(t.present).toBe(119);
    expect(t.share).toBe(100);
    expect(t.level).toBe('STATED');
  });

  it('names the missing field in every sentence it produces', () => {
    const cases = [
      { present: 0, population: 0 },
      { present: 4, population: 119 },
      { present: 80, population: 119 },
      { present: 119, population: 119 },
    ];
    for (const c of cases) {
      expect(trustOf({ ...c, subject: 'كلفة البضاعة' }).ar).toContain('كلفة البضاعة');
    }
  });

  it('writes every figure in Western digits', () => {
    for (const c of [
      { present: 0, population: 0 },
      { present: 4, population: 119 },
      { present: 3, population: 4 },
      { present: 80, population: 119 },
      { present: 119, population: 119 },
    ]) {
      expect(trustOf({ ...c, subject: 'كلفة البضاعة' }).ar).not.toMatch(/[٠-٩۰-۹]/);
    }
  });

  it('has a partial band that is genuinely narrower than «stated»', () => {
    expect(COST_TRUST.partial).toBeLessThan(COST_TRUST.state);
    expect(COST_TRUST.state).toBeGreaterThanOrEqual(0.9);
  });
});

describe('one row of the profit table', () => {
  it('states a margin only where both revenue and a cost exist', () => {
    expect(rowCostStated({ revenue: 825.98, cogs: 41.38 })).toBe(true);
  });

  it('refuses the 82% margin a product with no recorded cost prints', () => {
    expect(rowCostStated({ revenue: 825.98, cogs: 0 })).toBe(false);
  });

  it('says nothing either way about a product that sold nothing', () => {
    expect(rowCostStated({ revenue: 0, cogs: 0 })).toBe(false);
    expect(rowCostStated({ revenue: 0, cogs: 12 })).toBe(false);
  });

  it('refuses a broken number rather than treating it as a cost', () => {
    expect(rowCostStated({ revenue: Number.NaN, cogs: 5 })).toBe(false);
    expect(rowCostStated({ revenue: 100, cogs: Number.NaN })).toBe(false);
    expect(rowCostStated({ revenue: 100, cogs: -3 })).toBe(false);
  });
});
