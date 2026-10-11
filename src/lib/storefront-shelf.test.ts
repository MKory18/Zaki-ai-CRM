import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { stripComments } from './guard-source';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * ONE SHELF RULE, AND EVERY SURFACE READING IT.
 *
 * Stage 1 shipped the rule — a store with a shown page offers the
 * products those pages sell, and nothing else — inside `storefrontCatalog`
 * alone. `storefrontCatalog` is read by the `catalog` BLOCK of a
 * PUBLISHED home page. Every other listing in the system went on reading
 * all active products: the default home grid, `/shop`, the public search
 * and cards doors, the sitemap, «يُشترى معه عادةً».
 *
 * So the rule was shipped, tested, green, and reached almost nobody. A
 * store without a published home page — the owner's own — showed exactly
 * what it had always shown, and no test said otherwise, because each test
 * asked its own surface about its own read.
 *
 * Two things are held down here, and they fail in different ways:
 *
 *   THE RULE ITSELF, behaviourally, through `storeShelf`.
 *
 *   THAT NOBODY KEEPS A COPY OF IT. A sweep of the source: outside the
 *   module that defines the shelf, nothing may read the raw product list.
 *   This is the half that catches the SEVENTH surface — the one somebody
 *   adds next month — which no list of six files ever could.
 * ═══════════════════════════════════════════════════════════════════════
 */

const { db } = vi.hoisted(() => ({
  db: { product: { findMany: vi.fn() }, landingPage: { findMany: vi.fn() } },
}));
vi.mock('@/lib/db', () => ({ db }));

import { storeShelf, shownPageProductIds } from './storefront';

const C = 'c1';
const S = 's1';

function productRow(id: string) {
  return {
    id, sku: id.toUpperCase(), name: `منتج ${id}`, description: null,
    image: null, basePrice: 1000, attributes: {}, slug: null, previousSlugs: '[]',
    category: null, offers: [], images: [],
  };
}

/**
 * A MOCK THAT BEHAVES LIKE THE DATABASE, INCLUDING `take`.
 *
 * `take` matters as much as the where clause here. The difference between
 * «narrow in the query» and «take sixty and filter afterwards» is visible
 * ONLY to a reader that honours the limit — a mock that returns everything
 * makes both implementations pass, and the one that loses a shown product
 * is the one that would have shipped.
 */
function database(rows: ReturnType<typeof productRow>[]) {
  return (args?: { where?: { id?: { in?: string[] } }; take?: number }) => {
    const only = args?.where?.id?.in;
    const matched = only ? rows.filter((r) => only.includes(r.id)) : rows;
    return Promise.resolve(typeof args?.take === 'number' ? matched.slice(0, args.take) : matched);
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  db.landingPage.findMany.mockResolvedValue([]);
  db.product.findMany.mockImplementation(database([]));
});

describe('the shelf before the press', () => {
  it('is every active product — unchanged, which is the promise', async () => {
    db.landingPage.findMany.mockResolvedValue([]);
    db.product.findMany.mockImplementation(database([productRow('p1'), productRow('p2'), productRow('p3')]));

    const shelf = await storeShelf(C, S);
    expect(shelf.map((p) => p.id)).toEqual(['p1', 'p2', 'p3']);
  });

  it('and it asks for no narrowing at all, so the query is the old query', async () => {
    db.product.findMany.mockImplementation(database([productRow('p1')]));
    await storeShelf(C, S);
    for (const call of db.product.findMany.mock.calls) {
      expect(call[0]?.where, 'ضُيِّق المتجرُ وما في صفحةٌ معروضة').not.toHaveProperty('id');
    }
  });

  it('a shown page selling nothing is not the switch — the store would go empty', async () => {
    /*
     * The owner's condition on approving the switch at all: «الكتالوج ما
     * بصير يفضى». A published shown page with no `productId` sells nothing
     * and so can put nothing on a shelf. Counting it as the switch would
     * leave a store with goods in it showing none of them.
     */
    db.landingPage.findMany.mockResolvedValue([{ productId: null }, { productId: null }]);
    db.product.findMany.mockImplementation(database([productRow('p1'), productRow('p2')]));

    const shelf = await storeShelf(C, S);
    expect(shelf.map((p) => p.id), 'المتجر فضي').toEqual(['p1', 'p2']);
  });
});

describe('the shelf after the press', () => {
  it('is the products of the shown pages, and nothing else', async () => {
    db.landingPage.findMany.mockResolvedValue([{ productId: 'p2' }]);
    db.product.findMany.mockImplementation(database([productRow('p1'), productRow('p2'), productRow('p3')]));

    const shelf = await storeShelf(C, S);
    expect(shelf.map((p) => p.id)).toEqual(['p2']);
  });

  it('two shown pages for one product are still one place on the shelf', async () => {
    db.landingPage.findMany.mockResolvedValue([{ productId: 'p1' }, { productId: 'p1' }]);
    db.product.findMany.mockImplementation(database([productRow('p1'), productRow('p2')]));

    expect((await storeShelf(C, S)).map((p) => p.id)).toEqual(['p1']);
  });

  it('and a shown product is never the one the limit cuts off', async () => {
    /*
     * SEVENTY PRODUCTS, THE SHOWN ONE SIXTY-FIFTH.
     *
     * The limit is 60 and the order is newest first. Taking sixty rows and
     * filtering afterwards returns an EMPTY shelf here — a shop that opens
     * blank, with nothing in the logs, because the rule and the limit were
     * applied in the wrong order. Narrowing in the query cannot do that.
     */
    const rows = Array.from({ length: 70 }, (_, i) => productRow(`p${i + 1}`));
    db.landingPage.findMany.mockResolvedValue([{ productId: 'p65' }]);
    db.product.findMany.mockImplementation(database(rows));

    const shelf = await storeShelf(C, S);
    expect(shelf.map((p) => p.id), 'الحدُّ الأقصى قصَّ منتجاً معروضاً').toEqual(['p65']);
  });

  it('and it reads through this company and this store, never one of them', async () => {
    db.landingPage.findMany.mockResolvedValue([{ productId: 'p1' }]);
    db.product.findMany.mockImplementation(database([productRow('p1')]));
    await storeShelf(C, S);

    for (const call of [...db.landingPage.findMany.mock.calls, ...db.product.findMany.mock.calls]) {
      expect(call[0]).toMatchObject({ where: expect.objectContaining({ companyId: C, storeId: S }) });
    }
  });
});

describe('what counts as a shown page', () => {
  it('published AND shown — two different things, both required', async () => {
    await shownPageProductIds(C, S);
    expect(db.landingPage.findMany.mock.calls[0]?.[0]).toMatchObject({
      where: { companyId: C, storeId: S, showInStore: true, isPublished: true },
    });
  });
});

/**
 * ───────────────────────────────────────────────────────────────────────
 * THE SWEEP: NO SURFACE KEEPS A SHELF READ OF ITS OWN.
 * ───────────────────────────────────────────────────────────────────────
 */

const SRC = join(process.cwd(), 'src');
/** The module that defines the shelf — the one place allowed to read raw. */
const HOME = 'lib/storefront.ts';

function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) sources(p, out);
    else if (/\.tsx?$/.test(name) && !/\.test\./.test(name)) out.push(p);
  }
  return out;
}

interface Hit { file: string; line: number }

function readsRaw(): Hit[] {
  const out: Hit[] = [];
  for (const file of sources(SRC)) {
    const rel = relative(SRC, file).split(/[\\/]/).join('/');
    if (rel === HOME) continue;
    const src = stripComments(readFileSync(file, 'utf8'));
    // The CALL, not the import: a name in an import list is not a read.
    for (const m of src.matchAll(/storefrontProducts\s*\(/g)) {
      out.push({ file: rel, line: src.slice(0, m.index!).split(/\r?\n/).length });
    }
  }
  return out;
}

describe('every surface that lists this store’s products', () => {
  it('reads the shelf, never the raw product list', () => {
    const raw = readsRaw();
    expect(
      raw,
      `قراءةٌ خارجَ قاعدة الرفّ — هذه السطوح تتجاهل قاعدةَ الكتالوج:\n${raw
        .map((h) => `  ${h.file}:${h.line}`)
        .join('\n')}`
    ).toEqual([]);
  });

  it('and the sweep is reading real files — it is not sweeping nothing', () => {
    // A sweep that matches nothing passes forever. This one must at least
    // be able to see the module it exempts.
    const all = sources(SRC);
    expect(all.length, 'المسحُ لا يقرأ ملفّات').toBeGreaterThan(200);
    const home = stripComments(readFileSync(join(SRC, 'lib', 'storefront.ts'), 'utf8'));
    expect(
      (home.match(/storefrontProducts\s*\(/g) ?? []).length,
      'التعبيرُ لا يلتقط النداءَ أصلاً'
    ).toBeGreaterThan(0);
  });

  it('and these six are among the ones that read it', () => {
    /*
     * A FLOOR, NOT THE LIST.
     *
     * The sweep above is what makes a seventh surface impossible to add
     * quietly. This is the opposite failure: a surface that stops listing
     * products at all, or loses its read in a refactor, and nothing
     * notices because an absent call breaks no sweep.
     */
    const must = [
      'app/s/[store]/page.tsx',
      'app/s/[store]/shop/page.tsx',
      'app/s/[store]/sitemap.xml/route.ts',
      'app/s/[store]/p/[sku]/page.tsx',
      'app/api/public/stores/[store]/search/route.ts',
      'app/api/public/stores/[store]/cards/route.ts',
    ];
    const missing = must.filter((rel) => {
      const src = stripComments(readFileSync(join(SRC, ...rel.split('/')), 'utf8'));
      return !/storeShelf\s*\(/.test(src);
    });
    expect(missing, `سطحٌ ما بقي يقرأ الرفّ:\n${missing.join('\n')}`).toEqual([]);
  });

  it('and the catalogue block reads the same rule, through the same two functions', () => {
    const home = stripComments(readFileSync(join(SRC, 'lib', 'storefront.ts'), 'utf8'));
    // `storefrontCatalog` used to compute the shown-id set itself. One
    // reader, so the block and the grid cannot drift apart.
    expect(home).toMatch(/const shownProductIds = await shownPageProductIds\(companyId, storeId\)/);
    expect(home).toMatch(/const products = await storeShelf\(companyId, storeId\)/);
  });
});
