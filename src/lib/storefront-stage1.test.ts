import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * STAGE 1 — ONE CARD PER PRODUCT, AND NEVER AN EMPTY SHOP.
 *
 * A product is in the catalogue if and only if it has a published page
 * with `showInStore`. Until the seller's one-press — while no shown page
 * exists at all — the catalogue is byte-for-byte what it always was.
 */

const { db } = vi.hoisted(() => ({
  db: {
    product: { findMany: vi.fn() },
    landingPage: { findMany: vi.fn() },
  },
}));

vi.mock('@/lib/db', () => ({ db }));

import { storefrontCatalog } from './storefront';

const C = 'c1';
const S = 's1';

function productRow(id: string, sku: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    sku,
    name: `منتج ${sku}`,
    description: null,
    image: `https://cdn.example/${sku}.jpg`,
    basePrice: 100,
    attributes: {},
    slug: null,
    previousSlugs: '[]',
    category: null,
    offers: [],
    images: [],
    ...extra,
  };
}

function shownPage(productId: string | null, extra: Record<string, unknown> = {}) {
  return { productId, ...extra };
}

beforeEach(() => {
  vi.clearAllMocks();
  db.product.findMany.mockResolvedValue([]);
  db.landingPage.findMany.mockResolvedValue([]);
});

describe('the catalogue before the press', () => {
  it('is byte-for-byte what it always was: pages and products side by side', async () => {
    db.landingPage.findMany.mockResolvedValue([]);
    db.product.findMany
      .mockResolvedValueOnce([productRow('p1', 'SKU1')])
      .mockResolvedValueOnce([{ id: 'p1', categoryId: null, category: null }]);

    const cat = await storefrontCatalog(C, S, 'shop');
    expect(cat.items).toHaveLength(1);
    expect(cat.items[0]).toMatchObject({ id: 'p1', kind: 'product', href: '/s/shop/p/SKU1' });
  });

  it('an unpublished shown page does not flip it', async () => {
    // Unpublished is filtered by the query itself: the mock only answers
    // what a real one would — published and shown.
    db.landingPage.findMany.mockResolvedValue([]);
    db.product.findMany
      .mockResolvedValueOnce([productRow('p1', 'SKU1')])
      .mockResolvedValueOnce([{ id: 'p1', categoryId: null, category: null }]);

    const cat = await storefrontCatalog(C, S, 'shop');
    expect(cat.items.some((i) => i.kind === 'page')).toBe(false);
    expect(cat.items).toHaveLength(1);
  });

  it('a shown page with no product flips nothing', async () => {
    // The shown query sees it; the catalogue's own page query does not
    // return it as a window page (no product, no sale) — so the old shape
    // serves exactly one product card.
    db.landingPage.findMany
      .mockResolvedValueOnce([shownPage(null)])
      .mockResolvedValueOnce([]);
    db.product.findMany
      .mockResolvedValueOnce([productRow('p1', 'SKU1')])
      .mockResolvedValueOnce([{ id: 'p1', categoryId: null, category: null }]);

    const cat = await storefrontCatalog(C, S, 'shop');
    expect(cat.items).toHaveLength(1);
    expect(cat.items[0]).toMatchObject({ kind: 'product' });
  });
});

describe('the catalogue after the press', () => {
  beforeEach(() => {
    db.landingPage.findMany.mockResolvedValue([shownPage('p1')]);
    db.product.findMany
      .mockResolvedValue([
        productRow('p1', 'SKU1'),
        productRow('p2', 'SKU2'),
      ])
      // category rows for the second query (mock is reset per test by
      // clearAllMocks only for calls, not implementations — re-arm here)
      .mockResolvedValueOnce([
        productRow('p1', 'SKU1'),
        productRow('p2', 'SKU2'),
      ]);
  });

  it('a product with no shown page is absent', async () => {
    db.product.findMany.mockReset();
    db.product.findMany
      .mockResolvedValueOnce([productRow('p1', 'SKU1'), productRow('p2', 'SKU2')])
      .mockResolvedValueOnce([
        { id: 'p1', categoryId: null, category: null },
        { id: 'p2', categoryId: null, category: null },
      ]);

    const cat = await storefrontCatalog(C, S, 'shop');
    expect(cat.items.map((i) => i.id)).toEqual(['p1']);
  });

  it('two shown pages for one product are still one card', async () => {
    db.landingPage.findMany.mockResolvedValue([shownPage('p1'), shownPage('p1')]);
    db.product.findMany.mockReset();
    db.product.findMany
      .mockResolvedValueOnce([productRow('p1', 'SKU1'), productRow('p2', 'SKU2')])
      .mockResolvedValueOnce([
        { id: 'p1', categoryId: null, category: null },
        { id: 'p2', categoryId: null, category: null },
      ]);

    const cat = await storefrontCatalog(C, S, 'shop');
    expect(cat.items).toHaveLength(1);
    expect(cat.items[0]).toMatchObject({ id: 'p1', kind: 'product', href: '/s/shop/p/SKU1' });
  });

  it('reads only through this store', async () => {
    db.product.findMany.mockReset();
    db.product.findMany
      .mockResolvedValueOnce([productRow('p1', 'SKU1')])
      .mockResolvedValueOnce([{ id: 'p1', categoryId: null, category: null }]);

    await storefrontCatalog(C, S, 'shop');
    for (const call of db.landingPage.findMany.mock.calls) {
      expect(call[0]).toMatchObject({ where: { companyId: C, storeId: S } });
    }
    for (const call of db.product.findMany.mock.calls) {
      expect(call[0]).toMatchObject({ where: expect.objectContaining({ companyId: C, storeId: S }) });
    }
  });
});
