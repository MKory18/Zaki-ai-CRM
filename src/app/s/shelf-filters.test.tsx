import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * NARROWING THE SHELF, AND THE TWO ROWS UNDER A PRODUCT.
 *
 * The filters are a page, not a form's state — every narrowing is a URL
 * the shopper can bookmark, send, and back out of. That is also what lets
 * the whole grid render on the server, which on a mid-range Android is
 * the difference between a shelf and a spinner.
 */

const { getStorefront, storefrontProducts, notFound, bestSellers, db } = vi.hoisted(() => ({
  getStorefront: vi.fn(),
  storefrontProducts: vi.fn(async (..._a: unknown[]) => [] as unknown[]),
  bestSellers: vi.fn(async (..._a: unknown[]) => new Map<string, number>()),
  notFound: vi.fn(() => {
    throw new Error('NOT_FOUND');
  }),
  db: {
    country: { findUnique: vi.fn(async () => ({ currencyCode: 'SYP', minorUnit: 0 })) },
    store: { findFirst: vi.fn(async () => ({ searchSynonyms: null })) },
    category: { findFirst: vi.fn(async () => ({ attributeSchema: null })) },
  } as Record<string, Record<string, ReturnType<typeof vi.fn>>>,
}));

vi.mock('next/navigation', () => ({ notFound: () => notFound() }));
vi.mock('@/lib/db', () => ({ db }));
vi.mock('@/lib/storefront', () => ({
  getStorefront: (...a: unknown[]) => getStorefront(...a),
  storefrontProducts: (...a: unknown[]) => storefrontProducts(...a),
}));
vi.mock('@/lib/store-facts', () => ({ bestSellers: (...a: unknown[]) => bestSellers(...a) }));
vi.mock('@/components/storefront/StorefrontShell', () => ({
  StorefrontShell: ({ children }: { children: React.ReactNode }) => children,
}));

import ShopPage from './[store]/shop/page';
import { repoFile, stripComments } from '@/lib/guard-source';
import { DEFAULT_STORE_THEME } from '@/lib/store-theme';

const SCHEMA = JSON.stringify([
  { key: 'size', label: 'المقاس', kind: 'select', options: ['صغير', 'كبير'], unit: '' },
]);

const P = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  sku: id.toUpperCase(),
  name: id,
  description: null,
  image: null,
  basePrice: 100,
  fromPrice: 100,
  category: { id: 'cat-1', name: 'العناية' },
  attributes: {},
  ...over,
});

/** Every string and href anywhere in the rendered tree. */
function textOf(node: unknown, out: string[] = []): string[] {
  if (node === null || node === undefined || typeof node === 'boolean') return out;
  if (typeof node === 'string' || typeof node === 'number') {
    out.push(String(node));
    return out;
  }
  if (Array.isArray(node)) {
    for (const n of node) textOf(n, out);
    return out;
  }
  const el = node as { props?: Record<string, unknown> };
  if (el.props) {
    if (typeof el.props.href === 'string') out.push(el.props.href);
    // Marked, because «امسح التصفية» is now one of several links that
    // legitimately carry no narrowing — and a test that found it by that
    // shape would find a category chip instead.
    if (typeof el.props.clearHref === 'string') out.push(`CLEAR:${el.props.clearHref}`);
    if (el.props.facets) out.push(`FACETS:${JSON.stringify(el.props.facets)}`);
    /**
     * The sheet is a browser component, so a server render never draws
     * its links — but it is HANDED them now, as data. A server component
     * cannot pass a function to a client one, which is what the first
     * version tried and why the page did not render at all.
     */
    if (Array.isArray(el.props.facets)) {
      for (const f of el.props.facets as { options?: { href?: string }[] }[]) {
        for (const o of f.options ?? []) if (o.href) out.push(o.href);
      }
    }
    // The category nav asks the same way, with one argument.
    if (typeof el.props.hrefFor === 'function' && Array.isArray(el.props.categories)) {
      const hrefFor = el.props.hrefFor as (id: string) => string;
      out.push(hrefFor(''));
      for (const c of el.props.categories as { id: string }[]) out.push(hrefFor(c.id));
    }
    textOf(el.props.children, out);
  }
  return out;
}

const shop = (sp: Record<string, string> = {}) =>
  ShopPage({ params: Promise.resolve({ store: 'sehha' }), searchParams: Promise.resolve(sp) });

beforeEach(() => {
  vi.clearAllMocks();
  getStorefront.mockResolvedValue({
    id: 's1',
    slug: 'sehha',
    companyId: 'c1',
    countryId: 'k1',
    type: 'MULTI_PRODUCT',
    landingPageId: null,
    currencyCode: 'SYP',
    countryCode: 'SY',
    name: 'صحة',
    theme: DEFAULT_STORE_THEME,
  });
  storefrontProducts.mockResolvedValue([
    P('a', { attributes: { size: 'صغير' } }),
    P('b', { attributes: { size: 'كبير' } }),
    /**
      * Another shelf entirely, answering «صغير» — an option cat-1 DOES
      * have. That is the whole point: a product whose answer is not in
      * this schema is dropped for a different reason, and would let a
      * shelf that counted every category look correct.
      */
    P('z', { category: { id: 'cat-2', name: 'أخرى' }, attributes: { size: 'صغير' } }),
  ]);
  bestSellers.mockResolvedValue(new Map());
  db.category.findFirst.mockResolvedValue({ attributeSchema: SCHEMA });
});

/** The products the grid handed to its cards, in order. */
const cardsIn = (tree: unknown): string[] => {
  const out: string[] = [];
  const walk = (node: unknown) => {
    if (Array.isArray(node)) return node.forEach(walk);
    const el = node as { props?: Record<string, unknown> } | null;
    if (!el?.props) return;
    const product = el.props.product as { id?: string } | undefined;
    if (product?.id) out.push(product.id);
    walk(el.props.children);
  };
  walk(tree);
  return out;
};

const facetsIn = (parts: string[]) => {
  const raw = parts.find((p) => p.startsWith('FACETS:'));
  return raw ? (JSON.parse(raw.slice(7)) as { key: string; options: { value: string; count: number }[] }[]) : [];
};

describe('narrowings are offered only inside a category', () => {
  /**
   * The questions belong to the category, so a shelf showing three of them
   * has no single set to ask. Merging them would offer «المقاس» over a row
   * of eye drops — a filter that empties the grid.
   */
  it('none on the whole shelf', async () => {
    expect(facetsIn(textOf(await shop()))).toEqual([]);
    expect(db.category.findFirst).not.toHaveBeenCalled();
  });

  it('and the category’s own once one is chosen', async () => {
    const facets = facetsIn(textOf(await shop({ cat: 'cat-1' })));
    expect(facets).toHaveLength(1);
    expect(facets[0].key).toBe('size');
    expect(facets[0].options.map((o) => o.value)).toEqual(['صغير', 'كبير']);
  });

  /**
   * And nothing from another shelf. «وسط» belongs to a product in cat-2;
   * offering it here is a filter that empties the grid.
   */
  it('counts only the products on this shelf', async () => {
    const facets = facetsIn(textOf(await shop({ cat: 'cat-1' })));
    // «صغير» is carried by one product HERE and by one on another shelf.
    // A count of two means the sheet is looking at the whole catalogue.
    const small = facets[0].options.find((o) => o.value === 'صغير');
    expect(small?.count, 'الورقة تعدّ رفوفاً أخرى').toBe(1);
  });

  it('asks for that category through the company, not by the id alone', async () => {
    await shop({ cat: 'cat-1' });
    expect(db.category.findFirst.mock.calls[0][0].where).toMatchObject({
      id: 'cat-1',
      companyId: 'c1',
    });
  });

  /**
   * Computed BEFORE the attribute narrowing, so ticking one option does
   * not delete the others from the sheet the shopper is standing in.
   */
  it('keeps every option in the sheet after one is ticked', async () => {
    const facets = facetsIn(textOf(await shop({ cat: 'cat-1', attr_size: 'صغير' })));
    expect(facets[0].options.map((o) => o.value)).toEqual(['صغير', 'كبير']);
  });
});

describe('a narrowing is a page', () => {
  /**
   * The card is a component now, so a server render does not draw its
   * text — what it IS handed is the product. Reading that is reading what
   * the shopper will see, and it survives the card being restyled.
   */
  it('narrows the grid', async () => {
    const shown = cardsIn(await shop({ cat: 'cat-1', attr_size: 'كبير' }));
    expect(shown).toEqual(['b']);
  });

  it('carries the category and the sort through every link', async () => {
    const parts = textOf(await shop({ cat: 'cat-1', sort: 'priceAsc', attr_size: 'صغير' }));
    // Two kinds of link SHOULD drop them: «امسح التصفية», which is the
    // point of it, and a link to another category — whose questions are
    // not this one's. Everything else must carry them.
    const links = parts.filter(
      (p) => p.startsWith('/s/sehha/shop?') && p.includes('attr_')
    );
    expect(links.length).toBeGreaterThan(2);
    // Changing one thing must not silently drop the others — which reads
    // to a shopper like the shelf forgot.
    for (const l of links) expect(l, l).toContain('cat=cat-1');

    // And a category link is one of the two that clear them.
    const toOther = parts.find((p) => p.includes('cat=cat-2'));
    expect(toOther, 'رابط فئة يحمل تضييقاً ليس لها').not.toContain('attr_');
  });

  /**
   * «عرض المزيد» is the ONLY link that carries a page. Every other one
   * starts again at the first, because a shelf narrowed on page three
   * would open on a page that may no longer exist.
   */
  it('gives a page to «عرض المزيد» and to nothing else', async () => {
    storefrontProducts.mockResolvedValue(
      Array.from({ length: 30 }, (_, i) => P(`p${i}`, { attributes: { size: 'صغير' } }))
    );
    const parts = textOf(await shop({ cat: 'cat-1' }));
    const links = parts.filter((p) => p.startsWith('/s/sehha/shop'));
    const paged = links.filter((l) => l.includes('page='));
    expect(paged, 'لا زرّ «عرض المزيد»').toHaveLength(1);
    expect(paged[0]).toContain('page=2');
  });

  it('and the narrowing links carry no page at all', async () => {
    const toggles = textOf(await shop({ cat: 'cat-1', page: '3' })).filter((p) =>
      p.includes('attr_size=')
    );
    expect(toggles.length).toBeGreaterThan(0);
    for (const t of toggles) expect(t).not.toContain('page=');
  });

  it('clears the narrowings and keeps the category and the search', async () => {
    const parts = textOf(await shop({ cat: 'cat-1', q: 'كريم', attr_size: 'صغير' }));
    const clear = parts.find((p) => p.startsWith('CLEAR:'));
    expect(clear).toBeTruthy();
    expect(clear).not.toContain('attr_');
    expect(clear).toContain('cat=cat-1');
    expect(clear).toContain('q=');
  });
});

describe('the sheet is a sheet', () => {
  const css = () => repoFile('src/components/storefront/styles.ts');

  /** «على الجوال الفلاتر بورقة سفلية، أبداً مش عمود جانبي». */
  it('sits at the bottom on a phone', () => {
    const rule = css().slice(css().indexOf('.sf-sheet {'), css().indexOf('.sf-sheet-body'));
    expect(rule).toMatch(/position:\s*fixed/);
    expect(rule).toMatch(/bottom:\s*0/);
    expect(rule, 'عمود جانبي على الجوال').not.toMatch(/inset-inline-start|float|width:\s*\d+px/);
  });

  it('and settles into the page only where there is room', () => {
    expect(css()).toMatch(/@media \(min-width: 768px\)[\s\S]*\.sf-sheet \{[\s\S]*position: static/);
  });

  /**
   * A sheet that unmounts loses the scroll position inside it, and on a
   * phone that is the difference between adjusting one filter and hunting
   * for it again.
   */
  it('stays in the document when closed', () => {
    const src = stripComments(repoFile('src/components/storefront/FilterSheet.tsx'));
    expect(src).toMatch(/hidden=\{!open\}/);
    expect(src, 'الورقة تُفكَّك عند الإغلاق').not.toMatch(/open &&\s*\(?\s*<div id="sf-filters"/);
  });

  it('says how many are on, and offers a way out', () => {
    const src = stripComments(repoFile('src/components/storefront/FilterSheet.tsx'));
    expect(src).toMatch(/active > 0/);
    expect(src).toContain('امسح التصفية');
  });
});

describe('«شوهد مؤخراً» reports nothing', () => {
  const src = () => stripComments(repoFile('src/components/storefront/RecentlyViewed.tsx'));

  it('sends ids and nothing else, and only to ask what they are', () => {
    expect(src()).toMatch(/JSON\.stringify\(\{ ids: show \}\)/);
    // No page view, no beacon, no event: the server learns a list of
    // product ids it already serves to everybody.
    for (const word of ['track', 'beacon', 'event', 'visitor']) {
      expect(src().toLowerCase(), word).not.toMatch(new RegExp(`\\b${word}\\b`));
    }
  });

  it('draws nothing at all when it has nothing', () => {
    expect(src()).toMatch(/if \(cards\.length === 0\) return null;/);
  });

  /** The row must never open with a link to the page you are on. */
  it('decides what to show before adding this page to the memory', () => {
    // Past the imports: both names appear there first, in whatever order
    // the formatter sorted them, which says nothing about what runs first.
    const body = src().slice(src().indexOf('export function RecentlyViewed'));
    expect(body.indexOf('recentToShow')).toBeGreaterThan(-1);
    expect(body.indexOf('recentToShow')).toBeLessThan(body.indexOf('noteViewed'));
  });

  it('keeps the order the device remembered', () => {
    expect(stripComments(repoFile('src/app/api/public/stores/[store]/cards/route.ts')))
      .toMatch(/asked\s*\n?\s*\.map\(\(id\) => byId\.get\(id\)\)/);
  });
});
