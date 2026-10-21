import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SORT,
  MAX_CITY_LENGTH,
  SEGMENTS,
  SEGMENT_AR,
  SORTS,
  SORT_AR,
  cleanCity,
  customerFilters,
  orderByOf,
  segmentCount,
  segmentMatches,
  segmentWhere,
} from './customer-filters';
import { customerFacts, type CustomerRow } from './customer-insights';
import { DORMANT_DAYS } from './customer-score';

/**
 * «رفضوا طرداً (3)» IS A PROMISE THAT THREE ROWS WILL APPEAR.
 *
 * The strip above the customers list counts the book (`customerFacts`),
 * the dropdown prints the same count beside each word, and the list is
 * filtered by the database (`segmentWhere`). Three readings of one word.
 * If any two drift — a `>` that should have been `>=`, a dormant boundary
 * a day out — the number says three and the list shows two, and nobody can
 * tell which is lying. These run all three over the same rows, edges
 * included, and fail on the first disagreement.
 */

const NOW = new Date('2026-10-21T12:00:00Z');
const DAY = 86_400_000;
const daysAgo = (d: number) => new Date(NOW.getTime() - d * DAY);

const row = (o: Partial<CustomerRow>): CustomerRow => ({
  totalOrders: 0,
  deliveredOrders: 0,
  cancelledOrders: 0,
  totalPurchaseValue: 0,
  lastOrderDate: null,
  city: 'عمّان',
  ...o,
});

/**
 * Every shape of customer the definitions have to place, and the edges of
 * each: the boundary of dormancy from both sides (a second either way, not
 * just a day), an order count with no date, and a customer whose only order
 * was cancelled.
 */
const BOOK: CustomerRow[] = [
  row({}), // never ordered
  row({ totalOrders: 1, lastOrderDate: daysAgo(2) }), // one order, still in flight
  row({ totalOrders: 1, deliveredOrders: 1, lastOrderDate: daysAgo(10) }), // received
  row({ totalOrders: 2, deliveredOrders: 2, lastOrderDate: daysAgo(30), city: 'إربد' }), // repeat
  row({ totalOrders: 3, deliveredOrders: 1, cancelledOrders: 2, lastOrderDate: daysAgo(40), city: 'إربد' }), // refused
  row({ totalOrders: 1, cancelledOrders: 1, lastOrderDate: daysAgo(5) }), // only order cancelled
  row({ totalOrders: 1, deliveredOrders: 1, lastOrderDate: daysAgo(DORMANT_DAYS) }), // exactly on the line
  row({ totalOrders: 1, lastOrderDate: daysAgo(DORMANT_DAYS - 0.01) }), // a quarter-hour short of it
  row({ totalOrders: 1, lastOrderDate: daysAgo(DORMANT_DAYS + 0.01) }), // a quarter-hour past it
  row({ totalOrders: 2, lastOrderDate: daysAgo(DORMANT_DAYS + 1) }), // past it
  row({ totalOrders: 1, lastOrderDate: null }), // orders, but no date to be quiet since
  row({ totalOrders: 0, lastOrderDate: daysAgo(400) }), // a date but no orders left standing: «quiet» is not a fact about them
];

/**
 * The few comparisons `segmentWhere` is built from, evaluated as the database
 * evaluates them — including the rule that a comparison with NULL is not true.
 */
function holds(cond: unknown, value: unknown): boolean {
  if (cond !== null && typeof cond === 'object' && !(cond instanceof Date)) {
    return Object.entries(cond as Record<string, unknown>).every(([op, arg]) => {
      if (value === null || value === undefined) return false;
      const v = value instanceof Date ? value.getTime() : (value as number);
      const a = arg instanceof Date ? arg.getTime() : (arg as number);
      switch (op) {
        case 'gt': return v > a;
        case 'gte': return v >= a;
        case 'lte': return v <= a;
        case 'lt': return v < a;
        default: throw new Error(`the evaluator does not know «${op}»`);
      }
    });
  }
  return value === cond;
}
const selects = (where: Record<string, unknown>, r: CustomerRow) =>
  Object.entries(where).every(([field, cond]) => holds(cond, (r as unknown as Record<string, unknown>)[field]));

describe('one word, three readings, the same rows', () => {
  const facts = customerFacts(BOOK, NOW);

  for (const segment of SEGMENTS) {
    it(`«${SEGMENT_AR[segment]}» — the number beside it, the filter in memory and the filter in the database agree`, () => {
      const inMemory = BOOK.filter((r) => segmentMatches(segment, r, NOW));
      const inDatabase = BOOK.filter((r) => selects(segmentWhere(segment, NOW) as Record<string, unknown>, r));

      expect(inMemory.length, 'الرقمُ المطبوع لا يساوي ما تعدّه الدالّة').toBe(segmentCount(segment, facts));
      expect(inDatabase, 'قاعدةُ البيانات تختار غير ما تختاره الدالّة').toEqual(inMemory);
      // Not every word may be empty on this book, or agreeing proves nothing.
      expect(inMemory.length, 'كتاب الاختبار لا يحتوي هذه الفئة').toBeGreaterThan(0);
    });
  }

  it('and the dormant line is exactly where the customer score puts it — on it is in, a moment short is out', () => {
    const dormant = BOOK.filter((r) => segmentMatches('dormant', r, NOW));
    expect(dormant.map((r) => r.lastOrderDate)).toEqual([
      daysAgo(DORMANT_DAYS),
      daysAgo(DORMANT_DAYS + 0.01),
      daysAgo(DORMANT_DAYS + 1),
    ]);
    // Orders but no date: quiet since when? Not dormant — in both readings.
    const undated = BOOK.find((r) => r.totalOrders > 0 && r.lastOrderDate === null)!;
    expect(segmentMatches('dormant', undated, NOW)).toBe(false);
    expect(selects(segmentWhere('dormant', NOW) as Record<string, unknown>, undated)).toBe(false);
  });

  it('«لم يطلبوا بعد» and «طلبوا» are the two halves of the book — nobody is in both, nobody in neither', () => {
    const ordered = BOOK.filter((r) => segmentMatches('ordered', r, NOW));
    const never = BOOK.filter((r) => segmentMatches('never', r, NOW));
    expect(ordered.length + never.length).toBe(BOOK.length);
    expect(ordered.filter((r) => never.includes(r))).toEqual([]);
  });

  it('every word has a name a person can read, in Western digits', () => {
    for (const s of SEGMENTS) {
      expect(SEGMENT_AR[s].length).toBeGreaterThan(2);
      expect(SEGMENT_AR[s]).not.toMatch(/[٠-٩]/);
    }
    expect(SEGMENT_AR.dormant).toContain(String(DORMANT_DAYS));
    for (const s of SORTS) expect(SORT_AR[s].length).toBeGreaterThan(2);
  });
});

describe('what the URL asks for', () => {
  const ask = (query: string, full = true) => customerFilters(new URLSearchParams(query), { full, now: NOW });

  it('nothing asked is nothing applied — and the order is the one the screen has always had', () => {
    const r = ask('');
    expect(r).toMatchObject({ ok: true, where: {}, applied: { segment: null, city: null, sort: DEFAULT_SORT } });
    if (r.ok) {
      // Byte for byte what the route spelled out before there were filters.
      expect(r.orderBy).toEqual([{ totalOrders: 'desc' }, { updatedAt: 'desc' }, { id: 'asc' }]);
    }
  });

  it('«all» is no filter, the same as saying nothing', () => {
    expect(ask('segment=all&city=all')).toMatchObject({ ok: true, where: {}, applied: { segment: null, city: null } });
  });

  it('a segment becomes its comparison; a city becomes an exact, case-blind match', () => {
    const r = ask(`segment=refused&city=${encodeURIComponent('  عمّان ')}`);
    expect(r).toMatchObject({
      ok: true,
      where: { cancelledOrders: { gt: 0 }, city: { equals: 'عمّان', mode: 'insensitive' } },
      applied: { segment: 'refused', city: 'عمّان' },
    });
  });

  it('a sort becomes its order, and every order ends in the id so a page is a place', () => {
    for (const sort of SORTS) {
      const order = orderByOf(sort);
      expect(order[order.length - 1], `${sort}: لا ينتهي بالمعرّف`).toEqual({ id: 'asc' });
    }
    expect(orderByOf('value')[0]).toEqual({ totalPurchaseValue: 'desc' });
    expect(orderByOf('newest')[0]).toEqual({ createdAt: 'desc' });
    // Never-ordered customers have no date: they go last, not first.
    expect(orderByOf('recent')[0]).toEqual({ lastOrderDate: { sort: 'desc', nulls: 'last' } });
  });

  it('an unknown segment or sort is REFUSED with a sentence, not guessed at', () => {
    expect(ask('segment=whales')).toMatchObject({ ok: false, errorAr: expect.stringContaining('whales') });
    expect(ask('sort=luck')).toMatchObject({ ok: false, errorAr: expect.stringContaining('luck') });
  });

  it('a city is trimmed and capped, so a URL cannot send the database a novel', () => {
    expect(cleanCity('   ')).toBeUndefined();
    expect(cleanCity(null)).toBeUndefined();
    expect(cleanCity('all')).toBeUndefined();
    expect(cleanCity('x'.repeat(500))).toHaveLength(MAX_CITY_LENGTH);
  });

  it('THE LIMITED VIEW GETS NONE OF IT — every parameter is ignored, even the ones that would be refused', () => {
    const query = `segment=refused&sort=value&city=${encodeURIComponent('عمّان')}`;
    for (const q of [query, 'segment=whales&sort=luck']) {
      const r = ask(q, false);
      expect(r).toMatchObject({ ok: true, where: {}, applied: { segment: null, city: null, sort: DEFAULT_SORT } });
      if (r.ok) expect(r.orderBy).toEqual(orderByOf(DEFAULT_SORT));
    }
  });

  it('the closed lists are the whole vocabulary — six words and four orders', () => {
    expect([...SEGMENTS]).toEqual(['ordered', 'never', 'repeat', 'received', 'refused', 'dormant']);
    expect([...SORTS]).toEqual(['orders', 'value', 'recent', 'newest']);
  });
});
