import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * WHICH PAGES ARE BEING COMPARED, AND WHO ANSWERS.
 *
 * `pageVerdict` shipped with its floors, its margin and its two honest
 * shapes — and nothing called it. This is the chain that makes it reachable:
 * the pages of one product are the test, their numbers come from
 * `pageNumbersFor`, and the deciding happens in a module with no database
 * in it at all.
 *
 * THE GROUPING RULE IS THE BRIEF'S OWN: «نفس المنتج، بنية أو مظهر أو عنوان
 * مختلف». No lineage column, so a page written by hand belongs to its own
 * test as much as one that was duplicated.
 */

const { db } = vi.hoisted(() => ({
  db: {
    landingPage: { findMany: vi.fn() },
    landingPageView: { groupBy: vi.fn() },
    order: { groupBy: vi.fn() },
  },
}));
vi.mock('@/lib/db', () => ({ db }));
vi.mock('./db', () => ({ db }));

import { pageNumbersFor, pageVerdicts } from './landing-analytics';
import { MIN_DELIVERED, MIN_VISITORS } from './page-verdict';

const WINDOW = { companyId: 'c1', storeId: 's1', start: new Date('2026-01-01'), end: new Date('2026-02-01') };

const page = (id: string, name: string, productId: string | null) => ({
  id,
  name,
  productId,
  product: productId ? { name: `منتج ${productId}` } : null,
});

/** Visitors per page, then orders / delivered / collected per page. */
const numbers = (per: Record<string, [number, number, number, number]>) => {
  db.landingPageView.groupBy.mockResolvedValue(
    Object.entries(per).map(([id, [v]]) => ({ landingPageId: id, _sum: { count: v } }))
  );
  let call = 0;
  db.order.groupBy.mockImplementation(async () => {
    const which = call++; // orders, delivered, collected — in that order
    return Object.entries(per).map(([id, tuple]) => ({
      landingPageId: id,
      _count: { _all: tuple[which + 1] },
    }));
  });
};

beforeEach(() => {
  vi.clearAllMocks();
  db.landingPageView.groupBy.mockResolvedValue([]);
  db.order.groupBy.mockResolvedValue([]);
});

describe('what counts as a test', () => {
  it('two pages for one product, whether or not either was duplicated', async () => {
    db.landingPage.findMany.mockResolvedValue([page('a', 'المشكلة', 'p1'), page('b', 'العرض', 'p1')]);
    numbers({ a: [500, 50, 30, 25], b: [500, 40, 35, 30] });

    const out = await pageVerdicts(WINDOW);
    expect(out).toHaveLength(1);
    expect(out[0].productId).toBe('p1');
    expect(out[0].pages).toBe(2);
  });

  it('and a product with one page is left out, not listed as undecidable', async () => {
    // A screen full of «صفحة واحدة لا حكم لها» is a screen nobody reads.
    db.landingPage.findMany.mockResolvedValue([page('a', 'وحيدة', 'p1')]);
    expect(await pageVerdicts(WINDOW)).toEqual([]);
    // And nothing was asked of the database for a comparison that cannot exist.
    expect(db.landingPageView.groupBy).not.toHaveBeenCalled();
  });

  it('pages of different products are different tests, never one ranking', async () => {
    db.landingPage.findMany.mockResolvedValue([
      page('a', 'أ', 'p1'), page('b', 'ب', 'p1'),
      page('c', 'ج', 'p2'), page('d', 'د', 'p2'),
    ]);
    numbers({ a: [400, 40, 20, 18], b: [400, 30, 25, 22], c: [400, 30, 15, 12], d: [400, 90, 60, 55] });

    const out = await pageVerdicts(WINDOW);
    expect(out.map((o) => o.productId).sort()).toEqual(['p1', 'p2']);
    for (const o of out) {
      expect(o.verdict.ok && o.verdict.ranked).toHaveLength(2);
    }
  });

  it('only pages that have a product — a page selling nothing is in no test', async () => {
    await pageVerdicts(WINDOW);
    expect(db.landingPage.findMany.mock.calls[0][0].where.productId).toEqual({ not: null });
  });

  it('and only this store’s, under this company', async () => {
    await pageVerdicts(WINDOW);
    const where = db.landingPage.findMany.mock.calls[0][0].where;
    expect(where.companyId).toBe('c1');
    expect(where.storeId).toBe('s1');
  });
});

describe('the verdict it hands back', () => {
  it('names the page whose money per visitor is ahead by more than the margin', async () => {
    db.landingPage.findMany.mockResolvedValue([page('a', 'أ', 'p1'), page('b', 'ب', 'p1')]);
    // b collects 30 per 1000 visitors, a collects 10 — far past the margin.
    numbers({ a: [1000, 90, 20, 10], b: [1000, 40, 35, 30] });

    const out = await pageVerdicts(WINDOW);
    expect(out[0].verdict.ok && out[0].verdict.winner).toBe('b');
  });

  it('and not the page that collected more FORMS', async () => {
    // «مش الي بتطلّع أكتر فورمات» — a is ahead on orders two to one and
    // loses, because its parcels come back.
    db.landingPage.findMany.mockResolvedValue([page('a', 'أ', 'p1'), page('b', 'ب', 'p1')]);
    numbers({ a: [1000, 90, 20, 10], b: [1000, 40, 35, 30] });

    const out = await pageVerdicts(WINDOW);
    const ranked = (out[0].verdict.ok && out[0].verdict.ranked) || [];
    expect(ranked[0].pageId).toBe('b');
    expect(ranked[0].conversionRate! < ranked[1].conversionRate!).toBe(true);
  });

  it('refuses while any page is still short, and says what of', async () => {
    db.landingPage.findMany.mockResolvedValue([page('a', 'أ', 'p1'), page('b', 'ب', 'p1')]);
    numbers({ a: [MIN_VISITORS, 50, MIN_DELIVERED, 20], b: [10, 1, 1, 1] });

    const out = await pageVerdicts(WINDOW);
    expect(out[0].verdict.ok).toBe(false);
    const waiting = (!out[0].verdict.ok && out[0].verdict.waiting) || [];
    // EVERY page is reported against the floors, not only the short one —
    // a seller reading «ب ينقصه» needs to know أ is already there.
    expect(waiting.map((w) => w.pageId)).toContain('b');
    expect(waiting.find((w) => w.pageId === 'b')!.needVisitors).toBe(MIN_VISITORS - 10);
  });

  it('carries the sample with every row, because it is not a significance test', async () => {
    db.landingPage.findMany.mockResolvedValue([page('a', 'أ', 'p1'), page('b', 'ب', 'p1')]);
    numbers({ a: [1000, 90, 20, 10], b: [1000, 40, 35, 30] });

    const ranked = (await pageVerdicts(WINDOW))[0];
    for (const r of (ranked.verdict.ok && ranked.verdict.ranked) || []) {
      expect(r.visitors).toBe(1000);
      expect(r.delivered).toBeGreaterThan(0);
    }
  });

  it('names each PAGE, because both rows describe the same product', async () => {
    // A ranking whose two rows read «حزام الظهر» twice names nothing.
    db.landingPage.findMany.mockResolvedValue([page('a', 'المشكلة ← الحل', 'p1'), page('b', 'العرض أولاً', 'p1')]);
    numbers({ a: [1000, 90, 20, 10], b: [1000, 40, 35, 30] });

    const ranked = (await pageVerdicts(WINDOW))[0];
    const labels = ((ranked.verdict.ok && ranked.verdict.ranked) || []).map((r) => r.label);
    expect(labels.sort()).toEqual(['العرض أولاً', 'المشكلة ← الحل']);
    expect(labels).not.toContain('منتج p1');
  });

  it('a page with no rows at all counts as zero, not as missing', async () => {
    // `pageNumbersFor` returns nothing for a page nobody visited; a verdict
    // that skipped it would compare one page against itself.
    db.landingPage.findMany.mockResolvedValue([page('a', 'أ', 'p1'), page('b', 'ب', 'p1')]);
    numbers({ a: [1000, 90, 20, 10] });

    const out = await pageVerdicts(WINDOW);
    expect(out[0].verdict.ok).toBe(false);
    const waiting = (!out[0].verdict.ok && out[0].verdict.waiting) || [];
    expect(waiting.find((w) => w.pageId === 'b')!.needVisitors).toBe(MIN_VISITORS);
  });
});

describe('the numbers it is fed', () => {
  it('answer for every page asked about, even one with no rows anywhere', async () => {
    // THE GUARANTEE `pageVerdicts` RELIES ON. Without it a page nobody
    // visited is absent from the map, the floors are read by subtraction,
    // `MIN_VISITORS - undefined` is NaN, `NaN > 0` is false — and the page
    // is reported as having CLEARED floors it never reached.
    const out = await pageNumbersFor({ ...WINDOW, pageIds: ['x', 'y'] });
    expect([...out.keys()].sort()).toEqual(['x', 'y']);
    expect(out.get('y')).toEqual({ visitors: 0, orders: 0, delivered: 0, collected: 0 });
  });
});

describe('and it still cannot switch anything off', () => {
  it('writes nothing — the whole chain is read-only', async () => {
    db.landingPage.findMany.mockResolvedValue([page('a', 'أ', 'p1'), page('b', 'ب', 'p1')]);
    numbers({ a: [1000, 90, 20, 10], b: [1000, 40, 35, 30] });
    await pageVerdicts(WINDOW);

    // «ما بيطفّي الخاسر لحاله». There is no `update` on the mock at all, so
    // a call to one would have thrown rather than passed quietly.
    expect(db.landingPage).not.toHaveProperty('update');
    expect(db.landingPage).not.toHaveProperty('updateMany');
  });
});
