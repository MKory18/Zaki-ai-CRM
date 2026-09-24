import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * WHAT A STORE'S ADDRESS SHOWS.
 *
 * A Single Product store's address renders its front page IN PLACE — the
 * redirect it used to do dropped the ?c= campaign code, and with it the
 * credit for every sale an advert brought. It never shows a catalogue. A
 * many-products store lists its OWN products: the listing was read by
 * company, so one shop showed another shop's shelves.
 */

const { getStorefront, storefrontProducts, storefrontProduct, redirect, notFound } = vi.hoisted(() => ({
  getStorefront: vi.fn(),
  storefrontProducts: vi.fn(),
  storefrontProduct: vi.fn(),
  redirect: vi.fn((url: string) => { throw Object.assign(new Error('REDIRECT'), { url }); }),
  notFound: vi.fn(() => { throw new Error('NOT_FOUND'); }),
}));

vi.mock('next/navigation', () => ({ redirect: (u: string) => redirect(u), notFound: () => notFound() }));
vi.mock('@/lib/storefront', () => ({
  getStorefront: (...a: unknown[]) => getStorefront(...a),
  storefrontProducts: (...a: unknown[]) => storefrontProducts(...a),
  storefrontProduct: (...a: unknown[]) => storefrontProduct(...a),
}));
vi.mock('@/components/landing/LandingPageView', () => ({ LandingPageView: () => null }));
vi.mock('@/components/storefront/StorefrontShell', () => ({ StorefrontShell: () => null }));
vi.mock('@/components/tracking/LandingTrackingPixels', () => ({ LandingTrackingPixels: () => null }));
vi.mock('@/lib/tracking/tracking-config', () => ({ getTrackingPixelsForPage: async () => [] }));
vi.mock('@/lib/db', () => ({ db: {} }));

import Home from './[store]/page';
import ProductPage from './[store]/p/[sku]/page';
import { LandingPageView } from '@/components/landing/LandingPageView';

const store = (over: Record<string, unknown> = {}) => ({
  id: 's1', slug: 'sehha', companyId: 'c1', countryId: 'k1', type: 'SINGLE_PRODUCT', landingPageId: null,
  currencyCode: 'SYP', countryCode: 'SY', name: 'صحة', ...over,
});

const home = (search: Record<string, string> = {}) =>
  Home({ params: Promise.resolve({ store: 'sehha' }), searchParams: Promise.resolve(search) });
const product = (sku: string, search: Record<string, string> = {}) =>
  ProductPage({ params: Promise.resolve({ store: 'sehha', sku }), searchParams: Promise.resolve(search) });

beforeEach(() => vi.clearAllMocks());

describe('a Single Product store with a front page', () => {
  it('renders the page at the store\'s own address — no redirect', async () => {
    getStorefront.mockResolvedValue(store({ landingPageId: 'lp1' }));
    const el = (await home({ c: 'SUMMER' })) as { type: unknown; props: { target: unknown } };
    expect(redirect).not.toHaveBeenCalled();
    expect(el.type).toBe(LandingPageView);
    // The campaign code travels into the page, where the view and the order are credited to it.
    expect(el.props.target).toEqual({ frontPageId: 'lp1', storeId: 's1', campaign: 'SUMMER' });
  });

  it('has no product pages — they lead back to the front, the campaign code kept', async () => {
    getStorefront.mockResolvedValue(store({ landingPageId: 'lp1' }));
    await expect(product('SKU1', { c: 'SUMMER' })).rejects.toMatchObject({ url: '/s/sehha?c=SUMMER' });
  });
});

describe('a Single Product store without a front page', () => {
  it('is its one product\'s page, the campaign code carried across the redirect', async () => {
    getStorefront.mockResolvedValue(store());
    storefrontProducts.mockResolvedValue([{ sku: 'SKU1' }]);
    await expect(home({ c: 'SUMMER' })).rejects.toMatchObject({ url: '/s/sehha/p/SKU1?c=SUMMER' });
    expect(storefrontProducts).toHaveBeenCalledWith('c1', 's1', 2);
  });

  it('with several products shows its own list until a front page is picked — it does not go dark', async () => {
    getStorefront.mockResolvedValue(store());
    storefrontProducts.mockResolvedValue([{ sku: 'A' }, { sku: 'B' }]);
    await expect(home()).resolves.toBeTruthy();
    expect(storefrontProducts).toHaveBeenLastCalledWith('c1', 's1');
    expect(notFound).not.toHaveBeenCalled();
  });
});

describe('a many-products store', () => {
  it('lists its own products only', async () => {
    getStorefront.mockResolvedValue(store({ type: 'MULTI_PRODUCT' }));
    storefrontProducts.mockResolvedValue([]);
    await home();
    expect(storefrontProducts).toHaveBeenCalledWith('c1', 's1');
  });
});
