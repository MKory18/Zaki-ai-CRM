import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * EVERY STORE — ONE CARD EACH.
 *
 * The screen at /store lists all of the seller's shops whatever their
 * type. ACCESS bounds it — the same rows the store switcher obeys — and
 * a shop of another company never appears, even when its slug matches.
 */

const { db, requireContext, requirePermission, listAccessibleStores } = vi.hoisted(() => ({
  db: {
    store: { findMany: vi.fn() },
    landingPage: { findMany: vi.fn(), count: vi.fn() },
    storePage: { count: vi.fn() },
  },
  requireContext: vi.fn(),
  requirePermission: vi.fn(),
  listAccessibleStores: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ db }));
vi.mock('@/lib/geo-context', () => ({
  requireContext: (...a: unknown[]) => requireContext(...a),
  listAccessibleStores: (...a: unknown[]) => listAccessibleStores(...a),
}));
vi.mock('@/lib/authorization', () => ({ requirePermission: (...a: unknown[]) => requirePermission(...a) }));

import { GET } from './route';

const MINE = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';

function shop(over: Record<string, unknown> = {}) {
  return {
    id: MINE,
    name: 'متجري',
    slug: 'mine',
    logo: null,
    type: 'MULTI_PRODUCT',
    status: 'ACTIVE',
    companyId: 'c1',
    storefrontEnabled: true,
    tagline: null,
    about: null,
    domain: null,
    domainVerifiedAt: null,
    theme: null,
    countryId: 'k1',
    country: { currencyCode: 'SYP' },
    landingPageId: null,
    landingPages: [],
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  requireContext.mockResolvedValue({ user: { id: 'u1' }, companyId: 'c1', countryId: 'k1', storeId: MINE });
  // First permission wins, like the route's own fallback chain.
  requirePermission.mockImplementation(async (p: unknown) => {
    if (p === 'geo.manage') return undefined;
    throw new Error('denied');
  });
  listAccessibleStores.mockResolvedValue([{ id: MINE }]);
  db.store.findMany.mockResolvedValue([shop()]);
  db.landingPage.findMany.mockResolvedValue([]);
  db.landingPage.count.mockResolvedValue(0);
  db.storePage.count.mockResolvedValue(0);
});

describe('the all-stores list', () => {
  it('asks for every type this user may enter — no type filter', async () => {
    db.store.findMany.mockResolvedValue([shop(), shop({ id: OTHER, type: 'SINGLE_PRODUCT', slug: 'old' })]);
    listAccessibleStores.mockResolvedValue([{ id: MINE }, { id: OTHER }]);
    const body = await (await GET()).json();
    expect(body.stores.map((s: { slug: string }) => s.slug).sort()).toEqual(['mine', 'old']);
    const where = db.store.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ id: { in: [MINE, OTHER] }, companyId: 'c1' });
    expect(where).not.toHaveProperty('type');
  });

  it('never lists a shop of another company', async () => {
    listAccessibleStores.mockResolvedValue([{ id: MINE }]);
    await GET();
    expect(db.store.findMany.mock.calls[0][0].where).toMatchObject({ id: { in: [MINE] } });
  });

  it('counts shown products and hidden published pages', async () => {
    db.landingPage.findMany.mockResolvedValue([{ productId: 'p1' }, { productId: 'p1' }, { productId: null }]);
    db.landingPage.count.mockResolvedValue(5);
    const body = await (await GET()).json();
    expect(body.stores[0]).toMatchObject({ shownProducts: 1, hiddenPublishedPages: 2 });
  });

  it('reports the four health checks', async () => {
    db.storePage.count.mockResolvedValue(2);
    const body = await (await GET()).json();
    expect(body.stores[0].health).toMatchObject({
      hasLogo: false,
      policyPages: true,
      domainOk: true,
      hasShownProduct: false,
    });
  });

  it('marks the store the seller is standing in', async () => {
    const body = await (await GET()).json();
    expect(body.stores[0].current).toBe(true);
  });

  it('a single-product shop keeps its front-page picker data', async () => {
    db.store.findMany.mockResolvedValue([
      shop({
        type: 'SINGLE_PRODUCT',
        landingPageId: 'pg1',
        landingPages: [{ id: 'pg1', name: 'صفحة', slug: 'p', isPublished: true, domain: null, productId: 'p1', product: { name: 'كريم' } }],
      }),
    ]);
    const body = await (await GET()).json();
    expect(body.stores[0].frontPage).toMatchObject({ id: 'pg1' });
    expect(body.stores[0].pages).toHaveLength(1);
  });

  it('a multi-product shop carries no front-page fields', async () => {
    const body = await (await GET()).json();
    expect(body.stores[0].frontPage).toBeNull();
    expect(body.stores[0].pages).toEqual([]);
  });
});
