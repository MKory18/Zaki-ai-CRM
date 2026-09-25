import { describe, expect, it } from 'vitest';
import {
  BANDS,
  BANDS_FOR,
  DISCOUNT_TOLERANCE,
  FAST_MINUTES,
  SLOW_MINUTES,
  bandsForRole,
  scoreOf,
} from './performance-score';

/**
 * A SCORE SOMEBODY CAN ARGUE WITH.
 *
 * Two properties matter more than any single number here. The weights must
 * be fixed, because a score whose weights moved cannot be compared with
 * last month's and comparing with last month is the only thing anybody does
 * with a score. And the bands must add up to the headline, because a card
 * whose lines do not sum to its total is a card nobody believes.
 */

const AGENT = 'CONFIRMATION_AGENT';
const MOD = 'MODERATOR';
const BIG = { sample: 100, minSample: 10 };

describe('the weights', () => {
  it('add up to a hundred', () => {
    expect(BANDS.reduce((s, b) => s + b.weight, 0)).toBe(100);
  });

  it('are the six the document names, in its own order', () => {
    expect(BANDS.map((b) => [b.ar, b.weight])).toEqual([
      ['نسبة التسليم', 35],
      ['حجم المؤكَّد', 20],
      ['نسبة الإشكالات', 15],
      ['استخدام الخصم', 10],
      ['زمن الاستجابة', 10],
      ['قطع الكروس سيل', 10],
    ]);
  });

  it('every role reads bands this build knows', () => {
    const known = new Set(BANDS.map((b) => b.key));
    for (const [role, keys] of Object.entries(BANDS_FOR)) {
      for (const k of keys) expect(known.has(k), `${role}: ${k}`).toBe(true);
    }
  });
});

describe('the example from the document', () => {
  it('a 78% delivery rate is 27 of 35', () => {
    const r = scoreOf(AGENT, { delivery_rate: { value: 0.78 } }, BIG);
    const band = r.bands.find((b) => b.key === 'delivery_rate')!;
    expect(band.points).toBe(27);
    expect(band.weight).toBe(35);
  });
});

describe('what each band pays', () => {
  it('delivering everything is the whole band; delivering nothing is none of it', () => {
    expect(scoreOf(AGENT, { delivery_rate: { value: 1 } }, BIG).bands[0].points).toBe(35);
    expect(scoreOf(AGENT, { delivery_rate: { value: 0 } }, BIG).bands[0].points).toBe(0);
  });

  it('no entry problems is the whole issues band — it is a negative band', () => {
    const r = scoreOf(MOD, { issues_rate: { value: 0 } }, BIG);
    expect(r.bands.find((b) => b.key === 'issues_rate')!.points).toBe(15);
  });

  it('a volume is read against the best in the same role', () => {
    const r = scoreOf(AGENT, { confirmed_volume: { value: 40, reference: 50 } }, BIG);
    expect(r.bands.find((b) => b.key === 'confirmed_volume')!.points).toBe(16);
  });

  it('discounting at the team’s own habit costs nothing', () => {
    const r = scoreOf(AGENT, { discount_use: { value: 0.1, reference: 0.1 } }, BIG);
    expect(r.bands.find((b) => b.key === 'discount_use')!.points).toBe(10);
  });

  it('and discounting at twice the team’s habit spends the band', () => {
    const at = DISCOUNT_TOLERANCE * 0.1;
    const r = scoreOf(AGENT, { discount_use: { value: at, reference: 0.1 } }, BIG);
    expect(r.bands.find((b) => b.key === 'discount_use')!.points).toBe(0);
  });

  it('answering fast is the whole band, and slow is none of it', () => {
    const fast = scoreOf(AGENT, { response_time: { value: FAST_MINUTES - 1 } }, BIG);
    const slow = scoreOf(AGENT, { response_time: { value: SLOW_MINUTES + 1 } }, BIG);
    expect(fast.bands.find((b) => b.key === 'response_time')!.points).toBe(10);
    expect(slow.bands.find((b) => b.key === 'response_time')!.points).toBe(0);
  });
});

describe('a band that could not be measured', () => {
  it('is null, never zero — zero is a failure and this is an absence', () => {
    const r = scoreOf(AGENT, { delivery_rate: { value: null } }, BIG);
    expect(r.bands.find((b) => b.key === 'delivery_rate')!.points).toBeNull();
  });

  it('and its weight leaves the total it is measured out of', () => {
    // Everything but the delivery rate: 100 − 35 − 15 (issues, not an
    // agent's band) = 50.
    const r = scoreOf(
      AGENT,
      {
        confirmed_volume: { value: 10, reference: 10 },
        discount_use: { value: 0, reference: 0.1 },
        response_time: { value: 0 },
        cross_sell: { value: 5, reference: 5 },
      },
      BIG
    );
    expect(r.possible).toBe(50);
    expect(r.total).toBe(50);
  });
});

describe('the bands a role cannot earn', () => {
  it('an agent is never charged for entry problems — they raise them, not cause them', () => {
    expect(bandsForRole(AGENT)).not.toContain('issues_rate');
    expect(scoreOf(AGENT, { issues_rate: { value: 1 } }, BIG).bands.map((b) => b.key)).not.toContain('issues_rate');
  });

  it('a moderator is never charged for a response time they never had', () => {
    expect(bandsForRole(MOD)).not.toContain('response_time');
  });

  it('a role nobody scored earns nothing rather than earning by accident', () => {
    const r = scoreOf('ACCOUNTANT', { delivery_rate: { value: 1 } }, BIG);
    expect(r.bands).toEqual([]);
    expect(r.total).toBe(0);
    expect(r.possible).toBe(0);
  });
});

describe('too small a sample', () => {
  it('produces no score at all — a rate out of four orders is noise', () => {
    const r = scoreOf(AGENT, { delivery_rate: { value: 1 } }, { sample: 4, minSample: 10 });
    expect(r.total).toBeNull();
    expect(r.reason).toBe('BELOW_MINIMUM');
  });

  it('and still shows the bands, so it is visibly unmeasured and not broken', () => {
    const r = scoreOf(AGENT, { delivery_rate: { value: 1 } }, { sample: 4, minSample: 10 });
    expect(r.bands.length).toBeGreaterThan(0);
    expect(r.sample).toBe(4);
    expect(r.minSample).toBe(10);
  });

  it('exactly at the minimum is measured — the bar is a floor, not a gap', () => {
    expect(scoreOf(AGENT, { delivery_rate: { value: 1 } }, { sample: 10, minSample: 10 }).total).not.toBeNull();
  });
});

describe('the card adds up', () => {
  it('the total is the sum of the lines as they are printed', () => {
    const r = scoreOf(
      AGENT,
      {
        delivery_rate: { value: 0.78 },
        confirmed_volume: { value: 7, reference: 9 },
        discount_use: { value: 0.13, reference: 0.11 },
        response_time: { value: 41 },
        cross_sell: { value: 2, reference: 7 },
      },
      BIG
    );
    const printed = r.bands.reduce((s, b) => s + (b.points ?? 0), 0);
    expect(r.total).toBe(printed);
  });

  it('and never exceeds what it is measured out of', () => {
    const r = scoreOf(
      AGENT,
      {
        delivery_rate: { value: 5 },
        confirmed_volume: { value: 900, reference: 3 },
        discount_use: { value: -1, reference: 0.1 },
        response_time: { value: -50 },
        cross_sell: { value: 900, reference: 3 },
      },
      BIG
    );
    expect(r.total).toBeLessThanOrEqual(r.possible);
  });
});
