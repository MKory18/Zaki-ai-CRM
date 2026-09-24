import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A STOREFRONT TAKES ORDERS FOR ITS OWN PRODUCT, THROUGH THE DOOR IT SHOWS.
 *
 * The product was read by company: /s/<store-A>/p/<store-B's sku> sold
 * store B's product and booked the order against store A's stock. And a
 * Single Product store sells through its front page's own form — the old
 * product-page door must not stay open behind it.
 */

const { db, getStorefront, createPublicOrder } = vi.hoisted(() => ({
  db: { product: { findFirst: vi.fn(), count: vi.fn() }, country: { findUnique: vi.fn() } },
  getStorefront: vi.fn(),
  createPublicOrder: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ db }));
vi.mock('@/lib/storefront', () => ({ getStorefront: (...a: unknown[]) => getStorefront(...a) }));
vi.mock('@/lib/public-order', () => ({ createPublicOrder: (...a: unknown[]) => createPublicOrder(...a) }));
vi.mock('@/lib/campaigns-server', () => ({ resolveCampaign: async () => null }));
vi.mock('@/lib/rate-limit', () => ({ rateLimit: () => ({ allowed: true }), getClientIp: () => '1.1.1.1' }));

import { POST } from './route';

const post = (sku = 'SKU1') =>
  POST(
    new Request('http://localhost/x', { method: 'POST', body: JSON.stringify({ full_name: 'أحمد', phone: '0791234567' }) }),
    { params: Promise.resolve({ store: 'sehha', sku }) }
  );

beforeEach(() => {
  vi.clearAllMocks();
  getStorefront.mockResolvedValue({ id: 's1', slug: 'sehha', name: 'صحة', companyId: 'c1', countryId: 'k1', type: 'MULTI_PRODUCT', landingPageId: null });
  db.product.findFirst.mockResolvedValue({ id: 'p1', name: 'كريم', image: null, basePrice: 10 });
  db.product.count.mockResolvedValue(1);
  db.country.findUnique.mockResolvedValue({ code: 'SY', currencyCode: 'SYP', orderPrefix: 'SY', minorUnit: 0 });
  createPublicOrder.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 201 }));
});

describe('whose product', () => {
  it('reads the product through THIS store', async () => {
    await post();
    expect(db.product.findFirst.mock.calls[0][0].where).toMatchObject({ companyId: 'c1', storeId: 's1', sku: 'SKU1' });
  });

  it('refuses another store\'s product', async () => {
    db.product.findFirst.mockResolvedValue(null); // not in this store
    expect((await post('OTHER')).status).toBe(404);
    expect(createPublicOrder).not.toHaveBeenCalled();
  });
});

describe('a Single Product store', () => {
  it('still takes the order of a customer who opened the product page before a front page was picked', async () => {
    // New visitors are sent to the front page; one mid-order is not refused.
    getStorefront.mockResolvedValue({ id: 's1', slug: 'sehha', name: 'صحة', companyId: 'c1', countryId: 'k1', type: 'SINGLE_PRODUCT', landingPageId: 'lp1' });
    await post();
    expect(createPublicOrder).toHaveBeenCalled();
  });

  it('never another store\'s product, whatever its type', async () => {
    getStorefront.mockResolvedValue({ id: 's1', slug: 'sehha', name: 'صحة', companyId: 'c1', countryId: 'k1', type: 'SINGLE_PRODUCT', landingPageId: null });
    db.product.findFirst.mockResolvedValue(null);
    expect((await post('OTHER')).status).toBe(404);
    expect(createPublicOrder).not.toHaveBeenCalled();
  });
});
