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
    store: { findFirst: vi.fn() },
    product: { findFirst: vi.fn() },
  },
}));

vi.mock('@/lib/db', () => ({ db }));
vi.mock('@/lib/audit', () => ({ logAudit: vi.fn() }));
vi.mock('@/lib/geo-context', () => ({ requireContext: async () => ({ user: { id: 'u1' }, companyId: 'c1', storeId: 's1' }) }));
vi.mock('@/lib/authorization', () => ({ requirePermission: async () => undefined }));
vi.mock('@/lib/landing-domain', () => ({ validateDomain: (d: string) => ({ ok: true, domain: d }), forgetHost: vi.fn() }));

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
});
