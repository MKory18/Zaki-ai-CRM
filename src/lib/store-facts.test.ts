import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MIN_PAIR, MIN_SALES, bestSellers, boughtTogether, factsFor } from './store-facts';
import { MAX_RECENT, noteViewed, parseRecent, recentKey, recentToShow } from './recently-viewed';
import { EVERYWHERE, windowFor } from './delivery-time';
import { repoFile, stripComments } from './guard-source';

/**
 * WHAT OTHER CUSTOMERS ACTUALLY DID.
 *
 * Every rule here is the same rule wearing a different hat: a shop either
 * knows something about its customers or says nothing about them. Below
 * the sample the section disappears — not a smaller number, not a greyed
 * box. «اشتراه ٢» is not social proof; it is an admission, and a shopper
 * reads it as one.
 */

const line = (orderId: string, productId: string) => ({ orderId, productId, quantity: 1 });

type Line = { orderId: string; productId: string; quantity: number };
type Call = { where: { companyId: string; order: { companyId: string; storeId: string; deliveredAt: { not: null; gte: Date } } } };

const tx = (lines: Line[]) => ({
  orderItem: { findMany: vi.fn(async (_args?: Call) => lines) },
});

/** The `where` the code asked with, typed so a test can read it. */
const asked = (t: ReturnType<typeof tx>): Call['where'] =>
  (t.orderItem.findMany.mock.calls[0]![0] as Call).where;

const scope = { companyId: 'c1', storeId: 's1' };

/**
 * N delivered orders, each carrying these products.
 *
 * The prefix matters: two batches built with the same one would share
 * order ids, and a pair that never sat in one basket would look like one
 * that always did.
 */
const orders = (n: number, products: string[], prefix = 'o') =>
  Array.from({ length: n }, (_, i) => products.map((p) => line(`${prefix}${i}`, p))).flat();

beforeEach(() => vi.clearAllMocks());

describe('the door, not the placing', () => {
  it('counts only orders that were delivered', async () => {
    const t = tx([]);
    await bestSellers(t as never, scope);
    const where = asked(t);
    // An order cancelled at the door is not a sale, and «الأكثر مبيعاً»
    // counted from placed orders ranks what customers change their mind
    // about most.
    expect(where.order.deliveredAt.not).toBeNull();
    expect(where.order).toMatchObject({ companyId: 'c1', storeId: 's1' });
  });

  it('and only this shop’s', async () => {
    const t = tx([]);
    await bestSellers(t as never, scope);
    expect(asked(t).companyId).toBe('c1');
  });

  it('stops looking at sales too old to describe the shop now', async () => {
    const t = tx([]);
    await bestSellers(t as never, { ...scope, lookbackDays: 30 });
    const gte = asked(t).order.deliveredAt.gte;
    const days = (Date.now() - gte.getTime()) / 86_400_000;
    expect(days).toBeGreaterThan(29);
    expect(days).toBeLessThan(31);
  });
});

describe('«الأكثر مبيعاً»', () => {
  it('is silent about a product below the floor', async () => {
    const got = await bestSellers(tx(orders(MIN_SALES - 1, ['p1'])) as never, scope);
    expect(got.get('p1')).toBeUndefined();
  });

  /** The negative control: one more delivery and it counts. */
  it('and speaks at the floor', async () => {
    const got = await bestSellers(tx(orders(MIN_SALES, ['p1'])) as never, scope);
    expect(got.get('p1')).toBe(MIN_SALES);
  });

  it('is five, and five is a decision', () => {
    expect(MIN_SALES).toBe(5);
  });

  /**
   * ORDERS, NOT PIECES. Somebody who bought six of one thing in one order
   * is one customer who wanted it; counting pieces lets a single bulk
   * order crown a product.
   */
  it('counts customers, not pieces', async () => {
    const bulk = Array.from({ length: 9 }, () => line('one-order', 'p1'));
    expect((await bestSellers(tx(bulk) as never, scope)).get('p1')).toBeUndefined();
  });

  it('leaves a shop with no sales an empty map, which is the honest answer', async () => {
    expect((await bestSellers(tx([]) as never, scope)).size).toBe(0);
  });
});

describe('«يُشترى معه عادةً»', () => {
  const both = (n: number) => orders(n, ['p1', 'p2']);

  it('says nothing about a pair seen too few times', async () => {
    expect(await boughtTogether(tx(both(MIN_PAIR - 1)) as never, scope, 'p1')).toEqual([]);
  });

  it('and names it at the floor', async () => {
    expect(await boughtTogether(tx(both(MIN_PAIR)) as never, scope, 'p1')).toEqual([
      { productId: 'p2', orders: MIN_PAIR },
    ]);
  });

  /**
   * Higher than MIN_SALES on purpose: a pair is a coincidence far more
   * easily than a single product is popular, and the section that shows it
   * is asking the customer to add something to their order.
   */
  it('asks more of a pair than of a single product', () => {
    expect(MIN_PAIR).toBeGreaterThan(MIN_SALES);
  });

  it('never suggests the product somebody is already looking at', async () => {
    const got = await boughtTogether(tx(both(MIN_PAIR)) as never, scope, 'p1');
    expect(got.map((g) => g.productId)).not.toContain('p1');
  });

  it('puts the commonest first, and breaks a tie the same way every time', async () => {
    const lines = [...orders(MIN_PAIR, ['p1', 'p2']), ...orders(MIN_PAIR + 3, ['p1', 'p3'], 'x')];
    const got = await boughtTogether(tx(lines) as never, scope, 'p1');
    expect(got[0].productId).toBe('p3');
  });

  it('shows at most a handful', async () => {
    const many = ['p2', 'p3', 'p4', 'p5', 'p6'].flatMap((p, k) =>
      orders(MIN_PAIR, ['p1', p], `b${k}-`)
    );
    expect((await boughtTogether(tx(many) as never, scope, 'p1')).length).toBeLessThanOrEqual(4);
  });
});

describe('both facts in one read', () => {
  it('scans the delivered orders once, not twice', async () => {
    const t = tx(orders(MIN_SALES, ['p1']));
    const { sales, related } = await factsFor(t as never, scope, { relatedTo: 'p1' });
    expect(sales.get('p1')).toBe(MIN_SALES);
    expect(related).toEqual([]);
  });

  it('and asks nothing about a pair nobody wanted', async () => {
    const t = tx([]);
    await factsFor(t as never, scope);
    expect(t.orderItem.findMany).toHaveBeenCalledTimes(1);
  });
});

describe('how long it takes to arrive', () => {
  const w = (medianDays: number) => ({ medianDays, slowDays: medianDays, samples: 30 });

  it('quotes this governorate when this governorate is known', () => {
    const windows = new Map([['r1', w(2)], [EVERYWHERE, w(5)]]);
    expect(windowFor(windows, 'r1')?.medianDays).toBe(2);
  });

  /** «إذا المحافظة مش معروفة، نطاق البلد». */
  it('falls back to the country when it is not', () => {
    const windows = new Map([['r1', w(2)], [EVERYWHERE, w(5)]]);
    expect(windowFor(windows, 'r9')?.medianDays).toBe(5);
    expect(windowFor(windows, null)?.medianDays).toBe(5);
  });

  /**
   * And nothing is a real answer. A shop that has delivered four times has
   * not learned how long it takes, and a promise made out of an anecdote
   * is met as a broken one, at the door, four days later.
   */
  it('says nothing when neither is known', () => {
    expect(windowFor(new Map(), 'r1')).toBeNull();
  });
});

describe('«شوهد مؤخراً» never leaves the device', () => {
  it('holds ids, and nothing else', () => {
    const src = stripComments(repoFile('src/lib/recently-viewed.ts'));
    for (const word of ['price', 'name', 'phone', 'fetch', 'api']) {
      expect(src.toLowerCase(), word).not.toMatch(new RegExp(`\\b${word}\\b`));
    }
  });

  it('gives each shop its own memory', () => {
    expect(recentKey('a')).not.toBe(recentKey('b'));
  });

  it('puts what was just seen at the front, once', () => {
    expect(noteViewed(['p2', 'p1'], 'p1')).toEqual(['p1', 'p2']);
  });

  it('remembers a few, not a history', () => {
    const many = Array.from({ length: MAX_RECENT + 5 }, (_, i) => `p${i}`);
    expect(parseRecent(many)).toHaveLength(MAX_RECENT);
  });

  it.each([['junk', '{{'], ['nothing', null], ['an object', '{"a":1}']])(
    'answers nothing for %s, and does not throw',
    (_why, raw) => {
      expect(parseRecent(raw as string | null)).toEqual([]);
    }
  );

  /**
   * A row that leads with the product already on screen wastes its first
   * and largest thumbnail on a link to here.
   */
  it('never shows the page somebody is standing on', () => {
    expect(recentToShow(['p1', 'p2'], 'p1')).toEqual(['p2']);
  });
});
