import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * /lp/<slug> AND /s/<slug> ARE ONE SPACE FOR EVERY COMPANY.
 *
 * A page's orders are taken at /api/public/landing-pages/<slug>, and a
 * store answers at /s/<slug>. With slugs unique only within a company, a
 * second company's page could receive the first one's customers. And a
 * page sells its OWN store's product — another store's is another
 * country's price and another warehouse's stock.
 */

const { db } = vi.hoisted(() => ({
  db: {
    landingPage: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    product: { findFirst: vi.fn() },
    store: { findFirst: vi.fn(), create: vi.fn() },
    country: { findFirst: vi.fn() },
  },
}));

vi.mock('@/lib/db', () => ({ db }));
vi.mock('@/lib/audit', () => ({ logAudit: vi.fn() }));
vi.mock('@/lib/geo-context', () => ({ requireContext: async () => ({ user: { id: 'u1' }, companyId: 'c1', storeId: 's1' }) }));
vi.mock('@/lib/auth', () => ({ requireCompanyTenant: async () => ({ user: { id: 'u1' }, companyId: 'c1' }) }));
vi.mock('@/lib/authorization', () => ({ requirePermission: async () => undefined }));
vi.mock('@/lib/landing-domain', () => ({ validateDomain: (d: string) => ({ ok: true, domain: d }), forgetHost: vi.fn(), dashboardHosts: () => [] }));

import { POST as createPage } from './route';
import { PATCH as patchPage } from './[id]/route';
import { POST as createStore } from '../geo/stores/route';

const json = (body: unknown) => ({ method: 'POST', body: JSON.stringify(body) });

beforeEach(() => {
  vi.clearAllMocks();
  db.landingPage.create.mockImplementation(async ({ data }: { data: unknown }) => ({ id: 'new', ...(data as object) }));
  db.landingPage.update.mockResolvedValue({ id: 'lp1' });
  db.store.findFirst.mockResolvedValue(null);
  db.country.findFirst.mockResolvedValue({ id: 'k1' });
  db.store.create.mockImplementation(async ({ data }: { data: unknown }) => ({ id: 'st', ...(data as object) }));
});

describe('a landing page slug', () => {
  it('is refused when ANY company already has it', async () => {
    db.landingPage.findFirst.mockResolvedValue({ id: 'another-companys-page' });
    const res = await createPage(new Request('http://localhost/x', json({ name: 'عرض', slug: 'summer-offer' })));
    expect(res.status).toBe(409);
    expect(db.landingPage.create).not.toHaveBeenCalled();
    expect(db.landingPage.findFirst.mock.calls[0][0].where).toEqual({ slug: 'summer-offer' }); // no company filter
  });

  it('is refused on rename too', async () => {
    db.landingPage.findFirst.mockImplementation(async ({ where }: { where: Record<string, unknown> }) =>
      where.id === 'lp1' ? { id: 'lp1', companyId: 'c1', storeId: 's1', slug: 'old', domain: null } : { id: 'taken' }
    );
    const res = await patchPage(
      new Request('http://localhost/x', { method: 'PATCH', body: JSON.stringify({ slug: 'summer-offer' }) }),
      { params: Promise.resolve({ id: 'lp1' }) }
    );
    expect(res.status).toBe(409);
    expect(db.landingPage.update).not.toHaveBeenCalled();
  });
});

describe('the product a page sells', () => {
  it('must be one of its own store\'s products', async () => {
    db.landingPage.findFirst.mockResolvedValue(null);
    db.product.findFirst.mockResolvedValue(null);
    const res = await createPage(new Request('http://localhost/x', json({ name: 'عرض', slug: 'fresh-slug', productId: 'product-of-store-b' })));
    expect(res.status).toBe(404);
    expect(db.product.findFirst.mock.calls[0][0].where).toMatchObject({ companyId: 'c1', storeId: 's1' });
    expect(db.landingPage.create).not.toHaveBeenCalled();
  });

  it('is checked on edit when it changes — refused for another store\'s product', async () => {
    db.landingPage.findFirst.mockImplementation(async ({ where }: { where: Record<string, unknown> }) =>
      where.id === 'lp1' ? { id: 'lp1', companyId: 'c1', storeId: 's1', slug: 'old', domain: null, productId: 'product-mine-1' } : null
    );
    db.product.findFirst.mockResolvedValue(null);
    const edit = (body: unknown) =>
      patchPage(new Request('http://localhost/x', { method: 'PATCH', body: JSON.stringify(body) }), { params: Promise.resolve({ id: 'lp1' }) });

    expect((await edit({ productId: 'product-of-store-b' })).status).toBe(404);
    expect(db.landingPage.update).not.toHaveBeenCalled();

    // The same product sent back with the rest of the form is not a change.
    expect((await edit({ name: 'اسم', productId: 'product-mine-1' })).status).toBe(200);
    expect(db.product.findFirst).toHaveBeenCalledTimes(1);
  });
});

describe('a store slug', () => {
  it('is refused when ANY company already has it', async () => {
    db.store.findFirst.mockResolvedValue({ id: 'another-companys-store' });
    const res = await createStore(new Request('http://localhost/x', json({ countryId: '11111111-1111-4111-8111-111111111111', name: 'صحة', slug: 'sehha' })));
    expect(res.status).toBe(409);
    expect(db.store.create).not.toHaveBeenCalled();
    expect(db.store.findFirst.mock.calls.at(-1)![0].where).toEqual({ slug: 'sehha' });
  });
});
