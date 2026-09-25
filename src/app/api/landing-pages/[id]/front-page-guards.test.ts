import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A PAGE THAT IS A STORE'S FRONT ANSWERS AT THE STORE'S ADDRESS.
 *
 * What would break that address from the page's side is refused where the
 * seller is: unpublishing it, emptying its product or deleting it while the
 * store is open, and giving it a domain of its own. And a page may never
 * claim a host a store already holds — the proxy answers pages first, so
 * the page would silently take the store over.
 */

const { db } = vi.hoisted(() => ({
  db: {
    landingPage: { findFirst: vi.fn(), update: vi.fn(), delete: vi.fn() },
    // A slug change suggests a redirect and stands down any redirect the new
    // slug would shadow — see src/lib/store-redirects.ts.
    storeRedirect: { upsert: vi.fn(), updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    store: { findFirst: vi.fn() },
    product: { findFirst: vi.fn() },
  },
}));

vi.mock('@/lib/db', () => ({ db }));
vi.mock('@/lib/audit', () => ({ logAudit: vi.fn() }));
vi.mock('@/lib/geo-context', () => ({ requireContext: async () => ({ user: { id: 'u1' }, companyId: 'c1', storeId: 's1' }) }));
vi.mock('@/lib/authorization', () => ({ requirePermission: async () => undefined }));
const { forgetHost } = vi.hoisted(() => ({ forgetHost: vi.fn() }));
vi.mock('@/lib/landing-domain', () => ({
  validateDomain: (d: string) => ({ ok: true, domain: d }),
  forgetHost: (h: string | null) => forgetHost(h),
  dashboardHosts: () => [],
}));

import { PATCH, DELETE } from './route';

const ctx = { params: Promise.resolve({ id: 'lp1' }) };
const patch = (body: unknown) => PATCH(new Request('http://localhost/x', { method: 'PATCH', body: JSON.stringify(body) }), ctx);

let front: { name: string; storefrontEnabled: boolean } | null;

beforeEach(() => {
  vi.clearAllMocks();
  front = { name: 'صحة', storefrontEnabled: true };
  db.landingPage.findFirst.mockImplementation(async ({ where }: { where: Record<string, unknown> }) =>
    where.id === 'lp1' ? { id: 'lp1', companyId: 'c1', storeId: 's1', domain: null, slug: 'p' } : null
  );
  db.landingPage.update.mockResolvedValue({ id: 'lp1' });
  db.landingPage.delete.mockResolvedValue({});
  db.store.findFirst.mockImplementation(async ({ where }: { where: Record<string, unknown> }) => {
    if ('landingPageId' in where) {
      if (!front) return null;
      if (where.storefrontEnabled === true && !front.storefrontEnabled) return null;
      return front;
    }
    return null; // no store holds the domain
  });
});

describe('while the page fronts an OPEN store', () => {
  it('refuses unpublishing it', async () => {
    const res = await patch({ isPublished: false });
    expect(res.status).toBe(409);
    expect(db.landingPage.update).not.toHaveBeenCalled();
  });

  it('refuses taking away its product', async () => {
    expect((await patch({ productId: null })).status).toBe(409);
  });

  it('refuses deleting it', async () => {
    const res = await DELETE(new Request('http://localhost/x', { method: 'DELETE' }), ctx);
    expect(res.status).toBe(409);
    expect(db.landingPage.delete).not.toHaveBeenCalled();
  });

  it('still allows renaming it', async () => {
    expect((await patch({ name: 'اسم جديد' })).status).toBe(200);
  });
});

describe('a page that fronts any store', () => {
  it('may not take a domain of its own', async () => {
    front = { name: 'صحة', storefrontEnabled: false };
    expect((await patch({ domain: 'page.example.com' })).status).toBe(409);
  });

  it('may be unpublished once its store is closed', async () => {
    front = { name: 'صحة', storefrontEnabled: false };
    expect((await patch({ isPublished: false })).status).toBe(200);
  });
});

describe('a page\'s domain', () => {
  it('may not be a host a store already holds', async () => {
    front = null;
    db.store.findFirst.mockImplementation(async ({ where }: { where: Record<string, unknown> }) =>
      'domain' in where ? { id: 'other-store' } : null
    );
    const res = await patch({ domain: 'shop.example.com' });
    expect(res.status).toBe(409);
    expect(db.landingPage.update).not.toHaveBeenCalled();
  });

  it('is refused while another page holds the same slug — the host would answer with the older one', async () => {
    front = null;
    db.landingPage.findFirst.mockImplementation(async ({ where }: { where: Record<string, unknown> }) =>
      where.id === 'lp1'
        ? { id: 'lp1', companyId: 'c1', storeId: 's1', domain: null, slug: 'p' }
        : where.slug === 'p' ? { id: 'legacy-page' } : null
    );
    const res = await patch({ domain: 'page.example.com' });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain('slug');
    expect(db.landingPage.update).not.toHaveBeenCalled();
    // Renamed in the same save, it is free.
    expect((await patch({ slug: 'p-new', domain: 'page.example.com' })).status).toBe(200);
  });
});

describe('what a seller host serves', () => {
  // A host remembers its pages for a minute. A new slug, a publish change or
  // a deleted page must reach it at once, or the store's domain keeps
  // answering with the old paths.
  const withStoreDomain = () =>
    db.store.findFirst.mockImplementation(async ({ where }: { where: Record<string, unknown> }) =>
      'landingPageId' in where ? null : where.id === 's1' ? { domain: 'shop.example.com' } : null
    );

  it('is forgotten when the slug changes: the page\u2019s own domain and its store\u2019s', async () => {
    withStoreDomain();
    db.landingPage.update.mockResolvedValue({ id: 'lp1', slug: 'p-new', isPublished: true });
    db.landingPage.findFirst.mockImplementation(async ({ where }: { where: Record<string, unknown> }) =>
      where.id === 'lp1' ? { id: 'lp1', companyId: 'c1', storeId: 's1', domain: 'page.example.com', slug: 'p', isPublished: true } : null
    );
    expect((await patch({ slug: 'p-new' })).status).toBe(200);
    expect(forgetHost).toHaveBeenCalledWith('page.example.com');
    expect(forgetHost).toHaveBeenCalledWith('shop.example.com');
  });

  it('is forgotten when a page is deleted', async () => {
    withStoreDomain();
    front = null;
    await DELETE(new Request('http://localhost/x', { method: 'DELETE' }), ctx);
    expect(forgetHost).toHaveBeenCalledWith('shop.example.com');
  });

  it('is left alone by a change that moves no path (a new name)', async () => {
    withStoreDomain();
    db.landingPage.update.mockResolvedValue({ id: 'lp1', slug: 'p', isPublished: undefined });
    db.landingPage.findFirst.mockImplementation(async ({ where }: { where: Record<string, unknown> }) =>
      where.id === 'lp1' ? { id: 'lp1', companyId: 'c1', storeId: 's1', domain: null, slug: 'p', isPublished: undefined } : null
    );
    await patch({ name: 'اسم' });
    expect(forgetHost).not.toHaveBeenCalled();
  });
});
