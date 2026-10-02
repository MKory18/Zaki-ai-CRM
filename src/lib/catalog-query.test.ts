import { describe, expect, it } from 'vitest';
import {
  CURATED_LABEL_AR,
  DEFAULT_PER_PAGE,
  MAX_PER_PAGE,
  SORTS,
  SORT_LABEL_AR,
  catalogPage,
  priceBounds,
  type Listable,
} from './catalog-query';

/**
 * NARROWING A GRID, AND PUTTING IT IN AN ORDER.
 *
 * Two of these rules are about honesty rather than about sorting: the price
 * a filter compares must be the price the card shows, and «الأكثر مبيعاً»
 * must never be a label over an order nothing proved.
 */

const P = (over: Partial<Listable> & { id: string }): Listable => ({
  name: over.id,
  fromPrice: 100,
  createdAt: new Date('2026-01-01'),
  ...over,
});

const ids = (r: { items: Listable[] }) => r.items.map((i) => i.id);

describe('the price filtered on is the price shown', () => {
  /**
   * The card shows `fromPrice` — the cheapest per-unit bundle. Filtering on
   * anything else makes a product vanish at a figure it never displayed,
   * and there is no message that explains that to a shopper.
   */
  const shelf = [P({ id: 'cheap', fromPrice: 10 }), P({ id: 'dear', fromPrice: 900 })];

  it('keeps what is inside the range', () => {
    expect(ids(catalogPage(shelf, { minPrice: 5, maxPrice: 100 }))).toEqual(['cheap']);
    expect(ids(catalogPage(shelf, { minPrice: 500 }))).toEqual(['dear']);
    expect(ids(catalogPage(shelf, { maxPrice: 5 }))).toEqual([]);
  });

  it('and an absent bound is not a bound', () => {
    expect(ids(catalogPage(shelf, {}))).toHaveLength(2);
    expect(ids(catalogPage(shelf, { minPrice: null, maxPrice: null }))).toHaveLength(2);
  });

  it('gives the slider ends the shelf actually spans', () => {
    expect(priceBounds(shelf)).toEqual({ min: 10, max: 900 });
  });

  /** A slider with both ends in the same place cannot be dragged. */
  it('offers no slider when everything costs the same', () => {
    expect(priceBounds([P({ id: 'a' }), P({ id: 'b' })])).toBeNull();
    expect(priceBounds([])).toBeNull();
  });
});

describe('«الأكثر مبيعاً» is a claim about delivered orders', () => {
  const shelf = [
    P({ id: 'old', createdAt: new Date('2025-01-01') }),
    P({ id: 'new', createdAt: new Date('2026-06-01') }),
  ];

  it('orders by real sales when there are real sales', () => {
    const sales = new Map([['old', 40], ['new', 2]]);
    const page = catalogPage(shelf, { sort: 'bestSelling' }, sales);
    expect(ids(page)).toEqual(['old', 'new']);
    expect(page.sort).toBe('bestSelling');
    expect(page.sortLabel).toBe(SORT_LABEL_AR.bestSelling);
  });

  /**
   * THE RULE THAT MATTERS. «أي اختيار يدوي من التاجر بينعرض باسم
   * "مختارات"، مش "الأكثر مبيعاً"». A silent fallback would have made the
   * label the lie.
   */
  it('says «مختارات» when nothing proves it', () => {
    const page = catalogPage(shelf, { sort: 'bestSelling' });
    expect(page.sort).toBe('newest');
    expect(page.sortLabel).toBe(CURATED_LABEL_AR);
    expect(page.sortLabel).not.toBe(SORT_LABEL_AR.bestSelling);
  });

  /** An empty map proves nothing; it is not «everybody sold zero». */
  it('and an empty tally proves nothing either', () => {
    expect(catalogPage(shelf, { sort: 'bestSelling' }, new Map()).sortLabel).toBe(CURATED_LABEL_AR);
  });

  /** The negative control: an honest sort keeps its own name. */
  it('a sort that was honoured keeps its label', () => {
    for (const sort of SORTS.filter((s) => s !== 'bestSelling')) {
      expect(catalogPage(shelf, { sort }).sortLabel, sort).toBe(SORT_LABEL_AR[sort]);
    }
  });
});

describe('the order things come in', () => {
  const shelf = [
    P({ id: 'b', name: 'باء', fromPrice: 50, createdAt: new Date('2026-02-01') }),
    P({ id: 'a', name: 'ألف', fromPrice: 50, createdAt: new Date('2026-03-01') }),
    P({ id: 'c', name: 'جيم', fromPrice: 10, createdAt: new Date('2026-01-01') }),
  ];

  it('newest first by default', () => {
    expect(ids(catalogPage(shelf))).toEqual(['a', 'b', 'c']);
    expect(catalogPage(shelf).sort).toBe('newest');
  });

  it('cheapest first, and dearest first', () => {
    expect(ids(catalogPage(shelf, { sort: 'priceAsc' }))).toEqual(['c', 'a', 'b']);
    expect(ids(catalogPage(shelf, { sort: 'priceDesc' }))).toEqual(['a', 'b', 'c']);
  });

  /**
   * A grid that reshuffles between two identical requests looks broken, and
   * on «عرض المزيد» it would show the same product twice.
   */
  it('breaks a tie the same way every time', () => {
    const once = ids(catalogPage(shelf, { sort: 'priceAsc' }));
    const twice = ids(catalogPage([...shelf].reverse(), { sort: 'priceAsc' }));
    expect(once).toEqual(twice);
  });

  it('ignores a sort nobody defined', () => {
    expect(catalogPage(shelf, { sort: 'byVibes' as never }).sort).toBe('newest');
  });
});

describe('«عرض المزيد» is a button', () => {
  const many = Array.from({ length: 30 }, (_, i) =>
    P({ id: `p${String(i).padStart(2, '0')}`, fromPrice: i + 1 })
  );

  it('hands back one page and says how many there were', () => {
    const page = catalogPage(many, { sort: 'priceAsc', perPage: 10 });
    expect(page.items).toHaveLength(10);
    expect(page.total).toBe(30);
    expect(page.hasMore).toBe(true);
  });

  it('and the next page carries on where it stopped', () => {
    const second = catalogPage(many, { sort: 'priceAsc', perPage: 10, page: 2 });
    expect(ids(second)[0]).toBe('p10');
  });

  /** The button must disappear at the end, or it lies about what is left. */
  it('stops offering more when there is none', () => {
    expect(catalogPage(many, { perPage: 10, page: 3 }).hasMore).toBe(false);
    expect(catalogPage(many, { perPage: 100 }).hasMore).toBe(false);
  });

  it('counts what matched, not what was on the shelf', () => {
    const page = catalogPage(many, { maxPrice: 5, perPage: 10 });
    expect(page.total).toBe(5);
    expect(page.hasMore).toBe(false);
  });

  it.each([
    ['nothing asked for', {}, DEFAULT_PER_PAGE],
    ['more than we serve', { perPage: 500 }, MAX_PER_PAGE],
    ['none at all', { perPage: 0 }, DEFAULT_PER_PAGE],
    ['a negative page size', { perPage: -3 }, 1],
  ])('sizes a page sensibly for %s', (_why, filters, expected) => {
    expect(catalogPage(many, filters).items.length).toBe(Math.min(expected as number, 30));
  });

  it('treats a page before the first as the first', () => {
    expect(ids(catalogPage(many, { sort: 'priceAsc', perPage: 5, page: 0 }))[0]).toBe('p00');
  });
});

describe('narrowing by category and by attribute', () => {
  const shelf = [
    P({ id: 'cream', category: { id: 'skin', name: 'عناية' }, attributes: { size: 'وسط' } }),
    P({ id: 'drops', category: { id: 'ear', name: 'أذن' }, attributes: { size: 'صغير' } }),
  ];

  it('keeps one category', () => {
    expect(ids(catalogPage(shelf, { categoryId: 'skin' }))).toEqual(['cream']);
  });

  it('keeps one answer', () => {
    expect(ids(catalogPage(shelf, { attributes: { size: ['صغير'] } }))).toEqual(['drops']);
  });

  it('and narrows on both at once', () => {
    expect(ids(catalogPage(shelf, { categoryId: 'skin', attributes: { size: ['صغير'] } }))).toEqual([]);
  });

  /** The negative control: an empty narrowing narrows nothing. */
  it('lets everything through when nothing was ticked', () => {
    expect(ids(catalogPage(shelf, { attributes: { size: [] } }))).toHaveLength(2);
  });
});
