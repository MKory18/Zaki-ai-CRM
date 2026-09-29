import { describe, expect, it } from 'vitest';
import {
  ABOVE_INDEX,
  BELOW_INDEX,
  MAX_SINGLE_DAY_SHARE,
  MIN_COMPARABLE_DAYS,
  MIN_COUNTED_ORDERS,
  MIN_DAYS_OF_MONTH_COVERED,
  MIN_MONTHS_FOR_CALENDAR,
  byFairness,
  calendarReadiness,
  countsTowardCommission,
  fairnessFor,
  rankDisagreements,
  whereCountsTowardCommission,
  type DayWork,
  type FairAgent,
} from './commission-fairness';

/**
 * The numbers in these guards are the measured ones from the dev database on
 * 2026-09-29: 171 orders over 8 distinct calendar days spanning 2 months,
 * 149 of them (87%) on a single day; 3 confirming agents over 6 working days
 * with exactly ONE day on which two of them both worked; 7 cancelled or
 * rejected orders; 115 accrued commission entries all belonging to one
 * person; and both commission rules inactive.
 */

/** A day's work for one agent. */
const w = (day: string, userId: string, count: number): DayWork => ({ day, userId, count });

/**
 * Two agents side by side for `days` days, one doing `mine` and the other
 * `theirs` — enough to clear both floors so a rule can be tested at all.
 */
function pair(days: number, mine: number, theirs: number): DayWork[] {
  const rows: DayWork[] = [];
  for (let i = 1; i <= days; i++) {
    const day = `2026-09-${String(i).padStart(2, '0')}`;
    rows.push(w(day, 'a', mine), w(day, 'b', theirs));
  }
  return rows;
}

describe('a cancelled order never counts', () => {
  it('is excluded whether it was cancelled before confirmation or after', () => {
    // «قاعدة عمولة صحيح ما بظهر ولا طلب ملغي سواء قبل التأكيد او بعد التأكيد».
    // The two land in DIFFERENT columns, which is the whole reason both are
    // read: a predicate checking only the confirmation side lets a
    // shipping-side cancel through, and it is then counted by the very rule
    // written to exclude it.
    expect(countsTowardCommission({ confirmationStatus: 'CANCELLED', shippingStatus: 'NOT_READY' })).toBe(false);
    expect(countsTowardCommission({ confirmationStatus: 'REJECTED', shippingStatus: 'NOT_READY' })).toBe(false);
    expect(countsTowardCommission({ confirmationStatus: 'CONFIRMED', shippingStatus: 'CANCELLED' })).toBe(false);
  });

  it('and a live order still counts, including one that went out and came back', () => {
    // A RETURN is not a cancellation. It earns nothing because the accrual
    // reverses, not because it vanishes from the count — an agent who
    // confirmed an order the customer later refused did confirm it, and
    // hiding it would flatter their delivery rate.
    expect(countsTowardCommission({ confirmationStatus: 'CONFIRMED', shippingStatus: 'DELIVERED' })).toBe(true);
    expect(countsTowardCommission({ confirmationStatus: 'CONFIRMED', shippingStatus: 'RETURNED' })).toBe(true);
    expect(countsTowardCommission({ confirmationStatus: 'NEW', shippingStatus: 'NOT_READY' })).toBe(true);
  });

  it('says the same thing as a Prisma clause as it does in memory', () => {
    // Two spellings of one rule is how the screen and the payslip come to
    // disagree about the same month.
    const clause = whereCountsTowardCommission();
    expect(clause.confirmationStatus.notIn).toContain('CANCELLED');
    expect(clause.confirmationStatus.notIn).toContain('REJECTED');
    expect(clause.shippingStatus.not).toBe('CANCELLED');
    for (const status of clause.confirmationStatus.notIn) {
      expect(countsTowardCommission({ confirmationStatus: status, shippingStatus: 'NOT_READY' })).toBe(false);
    }
  });
});

describe('the calendar effect the owner asked for', () => {
  it('is refused on this record, with the three measured reasons said out loud', () => {
    // MEASURED: 171 orders, 2 months, 8 days-of-month covered, 149 on one
    // day. The owner is right that «فترة من الشهر» matters; fitting a curve
    // to it from this would be inventing a payday coefficient.
    const dates: Date[] = [];
    for (let i = 0; i < 149; i++) dates.push(new Date('2026-09-10T10:00:00Z'));
    for (const d of ['2026-09-20', '2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-28', '2026-08-31']) {
      dates.push(new Date(`${d}T10:00:00Z`));
    }
    const r = calendarReadiness(dates);
    expect(r.ready).toBe(false);
    expect(r.months).toBe(2);
    expect(r.daysOfMonthCovered).toBe(8);
    expect(r.busiestDayShare).toBeGreaterThan(MAX_SINGLE_DAY_SHARE);
    // Every failing precondition is named, not just the first one found.
    expect(r.why).toContain(String(MIN_MONTHS_FOR_CALENDAR));
    expect(r.why).toContain(String(MIN_DAYS_OF_MONTH_COVERED));
  });

  it('is allowed once the record actually spans months and spreads out', () => {
    const dates: Date[] = [];
    for (const month of ['01', '02', '03', '04'] as const) {
      for (let d = 1; d <= 25; d++) dates.push(new Date(`2026-${month}-${String(d).padStart(2, '0')}T10:00:00Z`));
    }
    const r = calendarReadiness(dates);
    expect(r.ready).toBe(true);
    expect(r.months).toBe(4);
    expect(r.daysOfMonthCovered).toBe(25);
  });

  it('and an empty record is not quietly called ready', () => {
    expect(calendarReadiness([]).ready).toBe(false);
  });
});

describe('a day worked alone', () => {
  it('is dropped, because there is nobody to compare against', () => {
    // MEASURED: 5 of 6 confirmation days on this database had ONE agent
    // working. Counting them would score an agent who always works alone at
    // exactly average, for ever, by arithmetic.
    const rows = [...pair(MIN_COMPARABLE_DAYS, 2, 2), w('2026-10-01', 'a', 500)];
    const a = fairnessFor(rows).find((x) => x.userId === 'a')!;
    expect(a.daysWorked).toBe(MIN_COMPARABLE_DAYS + 1);
    expect(a.comparableDays).toBe(MIN_COMPARABLE_DAYS);
    // The 500 solo orders are in the raw count and out of the fair one.
    expect(a.rawCount).toBe(510);
    expect(a.counted).toBe(10);
    expect(a.index).toBe(1);
  });

  it('so an agent who only ever worked alone gets no index at all', () => {
    const rows = Array.from({ length: 30 }, (_, i) => w(`2026-09-${String(i + 1).padStart(2, '0')}`, 'solo', 9));
    const solo = fairnessFor(rows)[0];
    expect(solo.daysWorked).toBe(30);
    expect(solo.comparableDays).toBe(0);
    expect(solo.index).toBeNull();
    expect(solo.score).toBeNull();
    expect(solo.tone).toBe('unknown');
  });
});

describe('the calendar cancels out instead of being modelled', () => {
  it('gives the same index whether the shared days were rich or lean', () => {
    // THE CENTRAL CLAIM OF THE DESIGN. Payday triples everybody's numbers on
    // the same days, so the ratio between colleagues present for them is
    // untouched. If this ever fails, the measure has started rewarding the
    // roster again.
    const lean = fairnessFor(pair(MIN_COMPARABLE_DAYS, 4, 2)).find((a) => a.userId === 'a')!;
    const payday = fairnessFor(pair(MIN_COMPARABLE_DAYS, 12, 6)).find((a) => a.userId === 'a')!;
    expect(lean.index).toBe(payday.index);
    expect(lean.rawCount).toBeLessThan(payday.rawCount);
  });

  it('and does not reward simply working more days', () => {
    // Twenty shifts beat ten at any skill level, which is why the index is a
    // MEAN over the shared days and not a sum.
    const few = fairnessFor(pair(MIN_COMPARABLE_DAYS, 4, 2)).find((a) => a.userId === 'a')!;
    const many = fairnessFor(pair(MIN_COMPARABLE_DAYS * 4, 4, 2)).find((a) => a.userId === 'a')!;
    expect(few.index).toBe(many.index);
    expect(many.rawCount).toBeGreaterThan(few.rawCount);
  });

  it('measures against an even split of the day, not against the best agent', () => {
    // Three agents doing 6, 2 and 2: the day's total is 10 and the even
    // share is 10/3, so the leader is at 1.8 — not at 1.0 for being top, and
    // not at 3.0 against the weakest.
    const rows: DayWork[] = [];
    for (let i = 1; i <= MIN_COMPARABLE_DAYS; i++) {
      const day = `2026-09-${String(i).padStart(2, '0')}`;
      rows.push(w(day, 'a', 6), w(day, 'b', 2), w(day, 'c', 2));
    }
    const a = fairnessFor(rows).find((x) => x.userId === 'a')!;
    expect(a.evenShare).toBeCloseTo((10 / 3) * MIN_COMPARABLE_DAYS, 1);
    expect(a.index).toBeCloseTo(1.8, 2);
    expect(a.surplus).toBeCloseTo(6 * MIN_COMPARABLE_DAYS - (10 / 3) * MIN_COMPARABLE_DAYS, 1);
  });
});

describe('the floors', () => {
  it('refuse an index below the shared-days floor', () => {
    // MEASURED: the best-covered agent on this database has ONE comparable
    // day, at 4 orders against a colleague's 1. Declaring them 60% better
    // from that is the owner's own unfairness under a fairer name.
    const rows = pair(MIN_COMPARABLE_DAYS - 1, 20, 4);
    const a = fairnessFor(rows).find((x) => x.userId === 'a')!;
    expect(a.comparableDays).toBe(MIN_COMPARABLE_DAYS - 1);
    expect(a.index).toBeNull();
    expect(a.score).toBeNull();
    expect(a.why).toContain(String(MIN_COMPARABLE_DAYS));
  });

  it('refuse an index below the counted-orders floor', () => {
    const rows = pair(MIN_COMPARABLE_DAYS, 1, 1);
    const a = fairnessFor(rows).find((x) => x.userId === 'a')!;
    expect(a.comparableDays).toBe(MIN_COMPARABLE_DAYS);
    expect(a.counted).toBeLessThan(MIN_COUNTED_ORDERS);
    expect(a.index).toBeNull();
    expect(a.why).toContain(String(MIN_COUNTED_ORDERS));
  });

  it('and state it the moment both floors are met, not before', () => {
    const under = fairnessFor(pair(MIN_COMPARABLE_DAYS, 1, 1)).find((x) => x.userId === 'a')!;
    const at = fairnessFor(pair(MIN_COMPARABLE_DAYS, 2, 2)).find((x) => x.userId === 'a')!;
    expect(under.index).toBeNull();
    expect(at.index).not.toBeNull();
    expect(at.counted).toBe(MIN_COUNTED_ORDERS);
  });

  it('keep the raw count visible even when no index is given', () => {
    // The ungraded row still has to say what the old leaderboard said, or
    // the screen loses the number people already trust and offers nothing.
    const a = fairnessFor(pair(1, 18, 1)).find((x) => x.userId === 'a')!;
    expect(a.index).toBeNull();
    expect(a.rawCount).toBe(18);
  });
});

describe('the verdict', () => {
  const index = (mine: number, theirs: number) =>
    fairnessFor(pair(MIN_COMPARABLE_DAYS, mine, theirs)).find((a) => a.userId === 'a')!;

  it('is «فوق نصيبه» above the upper line', () => {
    const a = index(6, 2);
    expect(a.index).toBeGreaterThanOrEqual(ABOVE_INDEX);
    expect(a.tone).toBe('good');
    expect(a.label).toContain('فوق');
  });

  it('is «بقدر نصيبه» between the lines, and an even share is not a failure', () => {
    const a = index(4, 4);
    expect(a.index).toBe(1);
    expect(a.tone).toBe('ok');
  });

  it('is «تحت نصيبه» below the lower line', () => {
    const a = index(2, 8);
    expect(a.index).toBeLessThan(BELOW_INDEX);
    expect(a.tone).toBe('bad');
  });

  it('always prints the two numbers the ratio came from', () => {
    // «فوق نصيبه» alone is a claim. «30 طلباً مقابل نصيب 20» is a claim
    // somebody can check by hand, and an unauditable grade is one people
    // work around.
    const a = index(6, 2);
    expect(a.why).toMatch(/[0-9]/);
    expect(a.why).toContain(String(a.counted));
    expect(a.why).toContain(String(a.comparableDays));
  });
});

describe('the score', () => {
  it('puts an even share in the middle of the band, not at the top', () => {
    // A scale that gave 1.0 full marks would have nothing left to say about
    // the person doing twice the work beside them.
    const fair = fairnessFor(pair(MIN_COMPARABLE_DAYS, 4, 4)).find((a) => a.userId === 'a')!;
    const double = fairnessFor(pair(MIN_COMPARABLE_DAYS, 8, 4)).find((a) => a.userId === 'a')!;
    expect(fair.score).toBeLessThan(double.score!);
    expect(fair.score).toBeGreaterThan(0);
    expect(fair.score).toBeLessThan(100);
  });

  it('separates a big margin on one day from a steady one across many', () => {
    // The owner's own complaint, one level down: a single enormous payday
    // shift and ten consistent days are the same ratio and not the same
    // worker. Both agents here end on the SAME index; only consistency
    // tells them apart.
    const spiky: DayWork[] = [];
    const steady: DayWork[] = [];
    for (let i = 1; i <= 10; i++) {
      const day = `2026-09-${String(i).padStart(2, '0')}`;
      // Spiky: beaten on nine days, one huge day carries the ratio.
      spiky.push(w(day, 'a', i === 1 ? 145 : 5), w(day, 'b', 10));
      // Steady: ahead on every single day, same total.
      steady.push(w(day, 'a', 19), w(day, 'b', 10));
    }
    const s = fairnessFor(spiky).find((a) => a.userId === 'a')!;
    const t = fairnessFor(steady).find((a) => a.userId === 'a')!;
    expect(s.counted).toBe(t.counted);
    expect(s.index).toBe(t.index);
    expect(s.winDays).toBe(1);
    expect(t.winDays).toBe(10);
    expect(t.score).toBeGreaterThan(s.score!);
  });

  it('never leaves the scale, and equals the sum of its bands', () => {
    const samples = [pair(MIN_COMPARABLE_DAYS, 2, 2), pair(MIN_COMPARABLE_DAYS, 500, 1), pair(MIN_COMPARABLE_DAYS, 10, 500)];
    for (const rows of samples) {
      const a = fairnessFor(rows).find((x) => x.userId === 'a')!;
      if (a.score === null) continue;
      expect(a.score).toBeGreaterThanOrEqual(0);
      expect(a.score).toBeLessThanOrEqual(100);
      expect(a.score).toBe(Math.round(a.bands.reduce((sum, b) => sum + b.earned, 0)));
    }
  });

  it('gives every band a reason with its own measured number', () => {
    const a = fairnessFor(pair(MIN_COMPARABLE_DAYS, 6, 2)).find((x) => x.userId === 'a')!;
    expect(a.bands).toHaveLength(2);
    expect(a.bands.reduce((sum, b) => sum + b.weight, 0)).toBe(100);
    for (const b of a.bands) {
      expect(b.why).toMatch(/[0-9]/);
      expect(b.earned).toBeLessThanOrEqual(b.weight);
      expect(b.earned).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('best first', () => {
  const agent = (userId: string, index: number | null, rawCount: number): FairAgent =>
    ({ userId, index, rawCount } as FairAgent);

  it('ranks on the index, and puts the ungraded after the measured', () => {
    // «We cannot tell yet» is not last place: an ungraded agent placed below
    // a measured under-performer reads as worse than them, which is a
    // verdict nobody computed.
    const rows = [agent('u', null, 900), agent('low', 0.5, 5), agent('high', 2, 10)];
    expect([...rows].sort(byFairness).map((a) => a.userId)).toEqual(['high', 'low', 'u']);
  });

  it('and says so both ways round rather than relying on a lucky sort', () => {
    const u = agent('u', null, 900);
    const graded = agent('g', 0.1, 1);
    expect(byFairness(u, graded)).toBeGreaterThan(0);
    expect(byFairness(graded, u)).toBeLessThan(0);
  });

  it('falls back to raw volume among the ungraded, so the list is not arbitrary', () => {
    const rows = [agent('small', null, 2), agent('big', null, 80)];
    expect([...rows].sort(byFairness).map((a) => a.userId)).toEqual(['big', 'small']);
  });
});

describe('where volume and fairness disagree', () => {
  const agent = (userId: string, index: number | null, rawCount: number): FairAgent =>
    ({ userId, index, rawCount } as FairAgent);

  it('names the pair that swapped — the evidence for changing how a rule bands', () => {
    // Ahead on raw volume, behind once the shared days are controlled for:
    // exactly «البنات جابوا طلبات أكثر» caught in the act.
    const r = rankDisagreements([agent('payday', 1.0, 100), agent('lean', 1.8, 40)]);
    expect(r.compared).toBe(2);
    expect(r.swaps).toEqual([{ aheadOnVolume: 'payday', aheadOnFairness: 'lean' }]);
  });

  it('reports nothing when the two rankings agree', () => {
    const r = rankDisagreements([agent('top', 2, 100), agent('next', 1, 40)]);
    expect(r.swaps).toEqual([]);
  });

  it('does not call a tie a disagreement', () => {
    // Crying wolf on an equal pair would make the real swaps unreadable.
    expect(rankDisagreements([agent('a', 1.5, 50), agent('b', 1.5, 20)]).swaps).toEqual([]);
    expect(rankDisagreements([agent('a', 2, 50), agent('b', 1, 50)]).swaps).toEqual([]);
  });

  it('leaves the ungraded out of the comparison entirely', () => {
    const r = rankDisagreements([agent('graded', 1, 10), agent('ungraded', null, 900)]);
    expect(r.compared).toBe(1);
    expect(r.swaps).toEqual([]);
  });
});

describe('the whole measure on the shape of the real record', () => {
  it('grades nobody today, and says why rather than softening it', () => {
    // MEASURED, 2026-09-29, CONFIRMED_COUNT: 3 agents, 6 working days, and
    // exactly ONE day on which two agents both confirmed — 4 orders against
    // 1. This is the honest output of this database, and it is the point:
    // the rule is in place and will speak when the record can carry it.
    const rows = [
      w('2026-09-01', 'quiet', 1),
      w('2026-09-20', 'busy', 5),
      w('2026-09-21', 'busy', 4),
      w('2026-09-21', 'other', 1),
      w('2026-09-22', 'busy', 1),
      w('2026-09-24', 'busy', 3),
      w('2026-09-26', 'busy', 1),
      w('2026-09-28', 'busy', 4),
    ];
    const agents = fairnessFor(rows);
    expect(agents).toHaveLength(3);
    expect(agents.every((a) => a.index === null)).toBe(true);
    expect(agents.every((a) => a.score === null)).toBe(true);
    // The raw leaderboard still works, and still says the misleading thing.
    expect(agents.find((a) => a.userId === 'busy')!.rawCount).toBe(18);
    expect(rankDisagreements(agents).compared).toBe(0);
  });
});
