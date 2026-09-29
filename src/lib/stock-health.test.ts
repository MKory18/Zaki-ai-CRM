import { describe, expect, it } from 'vitest';
import {
  CRITICAL_COVER_DAYS,
  IDLE_WINDOW_DAYS,
  LOW_COVER_DAYS,
  MAX_WINDOW_DAYS,
  MIN_DELIVERED_LINES,
  MIN_LEDGER_DAYS,
  SLOW_COVER_DAYS,
  STALE_SALE_DAYS,
  STOCK_STATE_AR,
  STOCK_STATE_TONE,
  byUrgency,
  needsRestock,
  stockHealth,
  stockVelocity,
  summariseStock,
  type StockFacts,
} from './stock-health';

/**
 * These guards exist because every one of them is a lie the screen could
 * tell. The numbers in them are the measured ones from the dev database on
 * 2026-09-29 wherever a real shape was available: a 13.4-day delivered
 * record, 114 products, 108 with batches, 7 with any delivered unit, and
 * per-product delivered lines of 54, 26, 22, 7, 6, 2, 2.
 */

/** A product that is fine, so each test can break exactly one thing. */
const OK: StockFacts = {
  onHand: 396,
  reserved: 4,
  batchCount: 2,
  deliveredUnits: 104,
  deliveredLines: 54,
  ledgerDays: 13.43,
  daysSinceLastSale: 1,
  daysStocked: 8.6,
};

const facts = (over: Partial<StockFacts> = {}): StockFacts => ({ ...OK, ...over });

describe('the window a rate is measured over', () => {
  it('is the record own depth, never the one the caller asked for', () => {
    // THE MEASUREMENT THAT DECIDED THIS FILE. The delivered record on this
    // database begins 13.43 days ago. Asked for 90 days it must answer 13.43
    // days, because 104 units over 90 days is 1.2 a day and over 13.43 days
    // is 7.7 a day — a six-fold error, all of it in the direction of never
    // raising an alarm.
    const v = stockVelocity(facts(), 90);
    expect(v).not.toBeNull();
    expect(v!.windowDays).toBeCloseTo(13.43, 2);
    expect(v!.perDay).toBeCloseTo(104 / 13.43, 2);
  });

  it('is never wider than the ceiling even when the record is older', () => {
    const v = stockVelocity(facts({ ledgerDays: 400 }), 400);
    expect(v!.windowDays).toBe(MAX_WINDOW_DAYS);
  });

  it('is narrowed when the caller asks for less than the record holds', () => {
    const v = stockVelocity(facts({ ledgerDays: 90 }), 30);
    expect(v!.windowDays).toBe(30);
  });

  it('refuses a rate entirely when the record is shallower than the floor', () => {
    expect(stockVelocity(facts({ ledgerDays: MIN_LEDGER_DAYS - 0.01 }))).toBeNull();
    expect(stockVelocity(facts({ ledgerDays: 0 }))).toBeNull();
  });
});

describe('a sample too small to divide', () => {
  it('is hidden, not softened — no rate under the line floor', () => {
    // MEASURED: two products on this database have 2 delivered lines each.
    // Both must show no number at all rather than a confident 0.15/day.
    const thin = facts({ deliveredUnits: 2, deliveredLines: 2 });
    expect(stockVelocity(thin)).toBeNull();

    const h = stockHealth(thin);
    expect(h.state).toBe('unknown');
    expect(h.perDay).toBeNull();
    expect(h.coverDays).toBeNull();
    expect(h.score).toBeNull();
    expect(h.why).toContain(String(MIN_DELIVERED_LINES));
  });

  it('is stated the moment the sample reaches the floor and not before', () => {
    const under = facts({ deliveredUnits: 20, deliveredLines: MIN_DELIVERED_LINES - 1 });
    const at = facts({ deliveredUnits: 20, deliveredLines: MIN_DELIVERED_LINES });
    expect(stockVelocity(under)).toBeNull();
    expect(stockVelocity(at)).not.toBeNull();
  });

  it('but a measured zero is not a missing number', () => {
    // Nothing is being estimated: the shelf was watched and nothing left it.
    // Holding this to the line floor would hide the single most common fact
    // on this database — 101 products with stock and no delivered unit.
    const v = stockVelocity(facts({ deliveredUnits: 0, deliveredLines: 0 }));
    expect(v).not.toBeNull();
    expect(v!.perDay).toBe(0);
  });
});

describe('a zero that has not been watched long enough', () => {
  it('states the fact and withholds the verdict', () => {
    // MEASURED: 101 of 114 products, on a 13.4-day record. Calling them all
    // «راكد» would be this screen's biggest lie — over thirteen days a quiet
    // fortnight and dead stock are the same picture.
    const h = stockHealth(facts({ deliveredUnits: 0, deliveredLines: 0, daysSinceLastSale: null }));
    expect(h.state).toBe('no_sales');
    expect(h.label).not.toBe(STOCK_STATE_AR.idle);
    expect(h.tone).toBe('unknown');
    expect(h.why).toContain(String(IDLE_WINDOW_DAYS));
  });

  it('becomes «راكد» once the shelf has been watched past the floor', () => {
    const h = stockHealth(
      facts({
        deliveredUnits: 0,
        deliveredLines: 0,
        daysSinceLastSale: null,
        ledgerDays: IDLE_WINDOW_DAYS + 5,
        daysStocked: IDLE_WINDOW_DAYS + 5,
      })
    );
    expect(h.state).toBe('idle');
    expect(h.tone).toBe('bad');
  });

  it('and never on stock younger than the floor, however deep the record', () => {
    // Goods received last week have not failed to sell. They have not been
    // offered, and charging them for it would send a purchaser to clear
    // stock that only just arrived.
    const h = stockHealth(
      facts({
        deliveredUnits: 0,
        deliveredLines: 0,
        daysSinceLastSale: null,
        ledgerDays: 365,
        daysStocked: 3,
      })
    );
    expect(h.state).toBe('no_sales');
  });

  it('scores idle stock at the bottom of the cover band, never the top', () => {
    // Infinite cover is the worst answer, not the best. A score that reads
    // the large number and rewards it congratulates the overstock.
    const h = stockHealth(
      facts({
        deliveredUnits: 0,
        deliveredLines: 0,
        daysSinceLastSale: null,
        ledgerDays: IDLE_WINDOW_DAYS + 5,
        daysStocked: IDLE_WINDOW_DAYS + 5,
      })
    );
    const cover = h.bands.find((b) => b.key === 'cover')!;
    expect(cover.earned).toBe(0);
    expect(h.score).toBeLessThan(40);
  });
});

describe('what has never been stocked', () => {
  it('has not «نفد» — it was never there', () => {
    // MEASURED: 6 products on this database have no batch of any kind.
    // Telling a purchaser they ran out sends them hunting a sale that never
    // happened; the actual gap is an opening count or a receipt.
    const h = stockHealth(facts({ batchCount: 0, onHand: 0, reserved: 0 }));
    expect(h.state).toBe('unstocked');
    expect(h.state).not.toBe('out');
    expect(h.needsRestock).toBe(false);
    expect(h.score).toBeNull();
  });
});

describe('cover is computed on what is still promisable', () => {
  it('subtracts the reservations, because a promised unit cannot be promised twice', () => {
    // 30 on hand, 20 already reserved to open orders, 2 a day leaving: ten
    // available is five days of cover, not fifteen. Reading on-hand here is
    // how an order gets confirmed against stock somebody else has taken.
    const h = stockHealth(
      facts({ onHand: 30, reserved: 20, deliveredUnits: 20, deliveredLines: 10, ledgerDays: 10 })
    );
    expect(h.available).toBe(10);
    expect(h.perDay).toBe(2);
    expect(h.coverDays).toBe(5);
    expect(h.state).toBe('critical');
  });

  it('reads «نفد» when every unit on the shelf is already spoken for', () => {
    const h = stockHealth(facts({ onHand: 17, reserved: 17 }));
    expect(h.state).toBe('out');
    expect(h.available).toBe(0);
    expect(h.coverDays).toBe(0);
    expect(h.needsRestock).toBe(true);
    // Said without consulting velocity: how fast it used to sell does not
    // change that there is none.
    expect(h.why).toContain('17');
  });
});

describe('the state each band of cover earns', () => {
  const at = (coverDays: number) =>
    stockHealth(
      facts({
        onHand: coverDays * 2,
        reserved: 0,
        deliveredUnits: 20,
        deliveredLines: 10,
        ledgerDays: 10,
        daysStocked: 30,
      })
    );

  it('is «خطير» below the emergency line', () => {
    expect(at(CRITICAL_COVER_DAYS - 1).state).toBe('critical');
    expect(at(CRITICAL_COVER_DAYS - 1).tone).toBe('bad');
  });

  it('is «قارب على الانتهاء» between the emergency and reassurance lines', () => {
    expect(at(CRITICAL_COVER_DAYS).state).toBe('low');
    expect(at(LOW_COVER_DAYS - 1).state).toBe('low');
  });

  it('is «ماشٍ» from the reassurance line to the slow line', () => {
    expect(at(LOW_COVER_DAYS).state).toBe('moving');
    expect(at(SLOW_COVER_DAYS).state).toBe('moving');
    expect(at(LOW_COVER_DAYS).tone).toBe('good');
  });

  it('is «ماشٍ ببطء» past the slow line', () => {
    expect(at(SLOW_COVER_DAYS + 1).state).toBe('slow');
    expect(at(SLOW_COVER_DAYS + 1).tone).toBe('ok');
  });

  it('and only the first three are a purchasing list', () => {
    expect(needsRestock('out')).toBe(true);
    expect(needsRestock('critical')).toBe(true);
    expect(needsRestock('low')).toBe(true);
    expect(needsRestock('moving')).toBe(false);
    expect(needsRestock('slow')).toBe(false);
    expect(needsRestock('idle')).toBe(false);
    expect(needsRestock('no_sales')).toBe(false);
    expect(needsRestock('unknown')).toBe(false);
    expect(needsRestock('unstocked')).toBe(false);
  });
});

describe('the score', () => {
  it('is withheld whenever cover cannot be computed', () => {
    // 55 of the 100 points would be missing, and a 45-point maximum printed
    // out of 100 scores a product badly for being unmeasured.
    expect(stockHealth(facts({ deliveredLines: 2, deliveredUnits: 2 })).score).toBeNull();
    expect(stockHealth(facts({ batchCount: 0 })).score).toBeNull();
    expect(stockHealth(facts({ deliveredUnits: 0, deliveredLines: 0 })).score).toBeNull();
  });

  it('never exceeds a hundred and never falls below zero', () => {
    const samples: StockFacts[] = [
      facts(),
      facts({ onHand: 1, reserved: 0 }),
      facts({ onHand: 100000, reserved: 0 }),
      facts({ reserved: OK.onHand - 1 }),
      facts({ daysSinceLastSale: 400 }),
      facts({ daysSinceLastSale: 0 }),
    ];
    for (const s of samples) {
      const h = stockHealth(s);
      if (h.score === null) continue;
      expect(h.score).toBeGreaterThanOrEqual(0);
      expect(h.score).toBeLessThanOrEqual(100);
      expect(h.score).toBe(Math.round(h.bands.reduce((sum, b) => sum + b.earned, 0)));
    }
  });

  it('gives every band a reason carrying its own measured number', () => {
    // A band that says «17 من 20» can be argued with. A band that says «good»
    // cannot, and an unarguable score is one people work around.
    const h = stockHealth(facts());
    expect(h.bands).toHaveLength(3);
    for (const b of h.bands) {
      expect(b.why.length).toBeGreaterThan(8);
      expect(b.why).toMatch(/[0-9]/);
      expect(b.earned).toBeLessThanOrEqual(b.weight);
    }
    expect(h.bands.reduce((s, b) => s + b.weight, 0)).toBe(100);
  });

  it('reads the last delivery date, not only the rate', () => {
    // A rate averaged over a window cannot say the product stopped selling
    // six weeks ago. Only a date can, which is why recency is its own band.
    const warm = stockHealth(facts({ daysSinceLastSale: 2 }));
    const cold = stockHealth(facts({ daysSinceLastSale: STALE_SALE_DAYS + 1 }));
    expect(warm.perDay).toBe(cold.perDay);
    const w = warm.bands.find((b) => b.key === 'recency')!;
    const c = cold.bands.find((b) => b.key === 'recency')!;
    expect(w.earned).toBeGreaterThan(c.earned);
    expect(c.earned).toBe(0);
    expect(warm.score!).toBeGreaterThan(cold.score!);
  });

  it('charges a shelf that is already promised away', () => {
    const free = stockHealth(facts({ onHand: 100, reserved: 0, deliveredUnits: 50, deliveredLines: 10, ledgerDays: 10 }));
    const spoken = stockHealth(facts({ onHand: 100, reserved: 90, deliveredUnits: 50, deliveredLines: 10, ledgerDays: 10 }));
    const f = free.bands.find((b) => b.key === 'committed')!;
    const s = spoken.bands.find((b) => b.key === 'committed')!;
    expect(f.earned).toBeGreaterThan(s.earned);
  });
});

describe('worst first', () => {
  it('leads with the bad, then the warnings, then the unknown, then the fine', () => {
    const rows = [
      { tone: 'good' as const, score: 90 },
      { tone: 'unknown' as const, score: null },
      { tone: 'bad' as const, score: 20 },
      { tone: 'ok' as const, score: 60 },
    ];
    expect([...rows].sort(byUrgency).map((r) => r.tone)).toEqual(['bad', 'ok', 'unknown', 'good']);
  });

  it('breaks a tie on the score, lowest first, and puts the unscored last', () => {
    const rows = [
      { tone: 'bad' as const, score: null },
      { tone: 'bad' as const, score: 30 },
      { tone: 'bad' as const, score: 5 },
    ];
    expect([...rows].sort(byUrgency).map((r) => r.score)).toEqual([5, 30, null]);
  });

  it('and says so both ways round, not only as a list that happened to come out right', () => {
    // A comparator that answers «a is smaller» AND «b is smaller» for the
    // same pair is broken, and a three-element sort can still land in the
    // right order by luck — which is a guard that passes over a bug. So the
    // comparator is asked directly, in both directions.
    const unscored = { tone: 'bad' as const, score: null };
    const scored = { tone: 'bad' as const, score: 5 };
    expect(byUrgency(unscored, scored)).toBeGreaterThan(0);
    expect(byUrgency(scored, unscored)).toBeLessThan(0);
    expect(byUrgency(unscored, unscored)).toBe(0);
  });
});

describe('the alerts row', () => {
  it('drops every zero — a count of none is a line that has to be read to say nothing', () => {
    const s = summariseStock([{ state: 'moving' }, { state: 'moving' }]);
    expect(s.alerts.map((a) => a.state)).toEqual(['moving']);
    expect(s.needsRestock).toBe(0);
  });

  it('counts the purchasing list across all three of its states', () => {
    const s = summariseStock([{ state: 'out' }, { state: 'critical' }, { state: 'low' }, { state: 'moving' }]);
    expect(s.needsRestock).toBe(3);
    expect(s.alerts[0].state).toBe('restock');
  });

  it('leads with what would hurt, not with what is fine', () => {
    const s = summariseStock([{ state: 'moving' }, { state: 'out' }, { state: 'unknown' }]);
    const order = s.alerts.map((a) => a.state);
    expect(order.indexOf('out')).toBeLessThan(order.indexOf('moving'));
    expect(order.indexOf('moving')).toBeLessThan(order.indexOf('unknown'));
  });

  it('keeps the ungraded count visible instead of hiding it', () => {
    // MEASURED: 107 of 114 products on this database cannot be graded. That
    // number IS the finding — the sales record is too young to plan
    // purchases from — and burying it would replace it with 107 guesses.
    const rows = [
      ...Array.from({ length: 107 }, () => ({ state: 'no_sales' as const })),
      ...Array.from({ length: 7 }, () => ({ state: 'moving' as const })),
    ];
    const s = summariseStock(rows);
    expect(s.total).toBe(114);
    expect(s.graded).toBe(7);
    expect(s.alerts.find((a) => a.state === 'no_sales')!.count).toBe(107);
  });
});

describe('the vocabulary', () => {
  it('uses the owner own words for the states he named', () => {
    // «قارب على الانتهاء» and «ماشي بطيء» are his, from the note. Rewriting
    // them into «رصيد منخفض» and «حركة ضعيفة» is how a screen stops being
    // the one he asked for.
    expect(STOCK_STATE_AR.low).toBe('قارب على الانتهاء');
    expect(STOCK_STATE_AR.slow).toBe('ماشٍ ببطء');
    expect(STOCK_STATE_AR.moving).toBe('ماشٍ');
  });

  it('paints an absence of knowledge grey, never amber', () => {
    // An amber chip on 107 products teaches the reader to ignore amber.
    expect(STOCK_STATE_TONE.no_sales).toBe('unknown');
    expect(STOCK_STATE_TONE.unstocked).toBe('unknown');
    expect(STOCK_STATE_TONE.unknown).toBe('unknown');
  });

  it('writes every reason in Western digits', () => {
    const rows = [
      stockHealth(facts()),
      stockHealth(facts({ onHand: 8, reserved: 0 })),
      stockHealth(facts({ deliveredLines: 1, deliveredUnits: 1 })),
      stockHealth(facts({ batchCount: 0 })),
      stockHealth(facts({ deliveredUnits: 0, deliveredLines: 0 })),
    ];
    // The range is tested by code point rather than written as a character
    // class, so this guard cannot itself become the one line in the repo
    // carrying the digits it forbids.
    const isIndic = (c: number) => (c >= 0x0660 && c <= 0x0669) || (c >= 0x06f0 && c <= 0x06f9);
    for (const h of rows) {
      const text = [h.why, ...h.bands.map((b) => b.why)].join(' ');
      const found = [...text].filter((ch) => isIndic(ch.codePointAt(0) ?? 0));
      expect(found, `أرقام هندية في نصٍّ يُعرض: ${h.state}`).toEqual([]);
    }
  });
});
