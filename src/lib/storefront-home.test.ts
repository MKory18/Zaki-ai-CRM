import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A SHOPPER SEES THE PUBLISHED HOME PAGE, AND NEVER THE DRAFT.
 *
 * The draft is the seller's workbench. A storefront that could read it would
 * put half-finished work in front of a customer, and the seller would find
 * out from the customer.
 */

const { db } = vi.hoisted(() => ({
  db: { store: { findFirst: vi.fn() }, storeMenu: { findMany: vi.fn() } },
}));
vi.mock('./db', () => ({ db }));

import { getStorefront } from './storefront';

const HERO = JSON.stringify([
  { id: 'h1', type: 'hero', enabled: true, headline: 'منشور', subheadline: '', showPrice: false, ctaText: 'اطلب' },
]);
const DRAFT = JSON.stringify([
  { id: 'h1', type: 'hero', enabled: true, headline: 'مسوّدة', subheadline: '', showPrice: false, ctaText: 'اطلب' },
]);

const ROW = {
  id: 's1', name: 'صحة بلس', slug: 'seha', logo: null, favicon: null, tagline: null, about: null,
  supportPhone: null, domain: null, type: 'MULTI_PRODUCT', theme: null,
  homeLive: null as string | null, language: 'ar',
  companyId: 'c1', countryId: 'cy1', landingPageId: null,
  country: { code: 'SY', currencyCode: 'USD' },
};

beforeEach(() => {
  vi.resetAllMocks();
  db.storeMenu.findMany.mockResolvedValue([]);
});

describe('what the storefront reads', () => {
  it('asks the database for the published home page', async () => {
    db.store.findFirst.mockResolvedValue({ ...ROW, homeLive: HERO });
    const store = await getStorefront('seha');
    expect(store!.homeLive).toBe(HERO);
  });

  it('never asks for the draft at all', async () => {
    db.store.findFirst.mockResolvedValue({ ...ROW });
    await getStorefront('seha-2');
    const select = db.store.findFirst.mock.calls[0][0].select;
    expect(select.homeLive).toBe(true);
    // The guard: the draft is not even selected, so it cannot leak by
    // somebody later reading a field that happens to be there.
    expect(select.homeDraft).toBeUndefined();
    expect((await getStorefront('seha-2')) as unknown as Record<string, unknown>).not.toHaveProperty('homeDraft');
  });

  it('a shop that has published nothing carries no home page', async () => {
    db.store.findFirst.mockResolvedValue({ ...ROW, homeLive: null });
    expect((await getStorefront('seha-3'))!.homeLive).toBeNull();
  });

  it('serves only an open shop', async () => {
    db.store.findFirst.mockResolvedValue(null);
    expect(await getStorefront('closed')).toBeNull();
    expect(db.store.findFirst.mock.calls[0][0].where).toMatchObject({
      storefrontEnabled: true,
      status: 'ACTIVE',
    });
  });
});

describe('the shop reads the way its language reads', () => {
  it('a shop selling in English is not mirrored', async () => {
    // The public pages carried dir="rtl" in their markup, so an English
    // shop had its heading, price and arrows on the wrong side.
    db.store.findFirst.mockResolvedValue({ ...ROW, language: 'en' });
    const store = await getStorefront('en-shop');
    expect(store!.dir).toBe('ltr');
    expect(store!.language).toBe('en');
  });

  it('and an Arabic one still reads right to left, as every shop did', async () => {
    db.store.findFirst.mockResolvedValue({ ...ROW, language: 'ar' });
    expect((await getStorefront('ar-shop'))!.dir).toBe('rtl');
  });

  it('a language the build does not know does not mirror a working shop', async () => {
    db.store.findFirst.mockResolvedValue({ ...ROW, language: 'zz' });
    expect((await getStorefront('odd'))!.dir).toBe('rtl');
  });
});

describe('the draft and the published page are different things', () => {
  it('so publishing is what changes the shop, not saving', async () => {
    // Saved draft, nothing published: the shopper's side is still empty.
    db.store.findFirst.mockResolvedValue({ ...ROW, homeLive: null });
    expect((await getStorefront('a'))!.homeLive).toBeNull();

    // Published: now it is the published one, and the draft's words are
    // nowhere in what the shopper's side carries.
    db.store.findFirst.mockResolvedValue({ ...ROW, homeLive: HERO });
    const after = await getStorefront('b');
    expect(after!.homeLive).toContain('منشور');
    expect(JSON.stringify(after)).not.toContain('مسوّدة');
    expect(DRAFT).toContain('مسوّدة'); // the draft really does differ
  });
});
