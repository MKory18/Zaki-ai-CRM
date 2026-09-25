import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * THE REDIRECTS API.
 *
 * The refusal that matters most: a shop claiming an address that belongs to
 * another company's live page, which would take their already-paid traffic.
 */

const { db, requireContext, requirePermission, logAudit, forgetRedirects } = vi.hoisted(() => ({
  db: {
    store: { findFirst: vi.fn() },
    storeRedirect: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    landingPage: { findFirst: vi.fn() },
  },
  requireContext: vi.fn(),
  requirePermission: vi.fn(),
  logAudit: vi.fn(),
  forgetRedirects: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ db }));
vi.mock('@/lib/geo-context', () => ({ requireContext: (...a: unknown[]) => requireContext(...a) }));
vi.mock('@/lib/authorization', () => ({ requirePermission: (...a: unknown[]) => requirePermission(...a) }));
vi.mock('@/lib/audit', () => ({ logAudit: (...a: unknown[]) => logAudit(...a) }));
vi.mock('@/lib/store-redirects', async (orig) => ({
  ...(await orig<typeof import('@/lib/store-redirects')>()),
  forgetRedirects,
}));

import { GET, POST } from './route';
import { PATCH, DELETE } from './[id]/route';

const ROW = {
  id: 'r1', from: '/lp/old', to: '/lp/new', kind: 302,
  hits: 0, isActive: true, suggested: true, createdAt: new Date(),
};

const ctx = { params: Promise.resolve({ id: 'r1' }) };
const post = (body: unknown) =>
  POST(new Request('http://localhost/api/store/redirects', { method: 'POST', body: JSON.stringify(body) }));
const patch = (body: unknown) =>
  PATCH(new Request('http://localhost/api/store/redirects/r1', { method: 'PATCH', body: JSON.stringify(body) }), ctx);

beforeEach(() => {
  vi.resetAllMocks();
  requireContext.mockResolvedValue({ user: { id: 'u1' }, companyId: 'c1', storeId: 's1' });
  requirePermission.mockResolvedValue(undefined);
  db.store.findFirst.mockResolvedValue({ id: 's1', slug: 'seha', companyId: 'c1' });
  db.storeRedirect.findMany.mockResolvedValue([ROW]);
  db.storeRedirect.findFirst.mockResolvedValue(null);
  db.storeRedirect.create.mockImplementation(async ({ data }: never) => ({ ...ROW, ...(data as object) }));
  db.storeRedirect.update.mockImplementation(async ({ data }: never) => ({ ...ROW, ...(data as object) }));
  db.landingPage.findFirst.mockResolvedValue(null);
});

describe('claiming an old address', () => {
  it('is refused when another company’s page is live on it', async () => {
    db.landingPage.findFirst.mockResolvedValue({ id: 'their-page' });
    const res = await post({ from: '/lp/their-offer', to: '/s/seha' });
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe('NOT_YOURS');
    expect(db.storeRedirect.create).not.toHaveBeenCalled();
  });

  it('is refused for a path that is not one of this shop’s addresses', async () => {
    for (const from of ['/orders', '/s/another-shop/x', '/admin/users']) {
      const res = await post({ from, to: '/s/seha' });
      expect(res.status, from).toBe(403);
    }
    expect(db.storeRedirect.create).not.toHaveBeenCalled();
  });

  it('goes through for a slug nobody else holds', async () => {
    const res = await post({ from: '/lp/my-old', to: '/lp/my-new' });
    expect(res.status).toBe(201);
    expect(db.storeRedirect.create.mock.calls[0][0].data).toMatchObject({
      from: '/lp/my-old', to: '/lp/my-new', storeId: 's1', suggested: false,
    });
  });

  it('is checked again when an existing redirect’s source is changed', async () => {
    db.storeRedirect.findFirst.mockResolvedValue(ROW);
    db.landingPage.findFirst.mockResolvedValue({ id: 'their-page' });
    const res = await patch({ from: '/lp/theirs' });
    expect(res.status).toBe(403);
    expect(db.storeRedirect.update).not.toHaveBeenCalled();
  });
});

describe('a redirect that would loop', () => {
  it('is refused on create', async () => {
    const res = await post({ from: '/lp/xx', to: '/lp/xx' });
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('SELF_REDIRECT');
  });

  it('and on edit, including when only one side changes', async () => {
    db.storeRedirect.findFirst.mockResolvedValue({ ...ROW, from: '/lp/aa', to: '/lp/bb' });
    expect((await patch({ to: '/lp/aa' })).status).toBe(400);
    expect(db.storeRedirect.update).not.toHaveBeenCalled();
  });
});

describe('accepting a suggestion', () => {
  it('is what makes it forward — until then the proxy ignores it', async () => {
    db.storeRedirect.findFirst.mockResolvedValue(ROW);
    const res = await patch({ accept: true });
    expect(res.status).toBe(200);
    expect(db.storeRedirect.update.mock.calls[0][0].data).toMatchObject({ suggested: false });
    expect(logAudit.mock.calls[0][0].action).toBe('STORE_REDIRECT_ACCEPTED');
  });

  it('and `accept` is not mistaken for a field of the redirect itself', async () => {
    db.storeRedirect.findFirst.mockResolvedValue(ROW);
    const res = await patch({ accept: true, kind: 301 });
    expect(res.status).toBe(200);
    expect(db.storeRedirect.update.mock.calls[0][0].data).toMatchObject({ kind: 301, suggested: false });
  });

  it('dismissing one is recorded as a dismissal, not a deletion', async () => {
    db.storeRedirect.findFirst.mockResolvedValue(ROW);
    await DELETE(new Request('http://localhost/x', { method: 'DELETE' }), ctx);
    expect(logAudit.mock.calls[0][0].action).toBe('STORE_REDIRECT_DISMISSED');
  });
});

describe('the rest of the guards', () => {
  it('writing asks for storefront.manage and does nothing without it', async () => {
    requirePermission.mockRejectedValue(Object.assign(new Error('forbidden'), { status: 403 }));
    await post({ from: '/lp/old-one', to: '/lp/new-one' });
    expect(db.storeRedirect.create).not.toHaveBeenCalled();
  });

  it('a redirect of another shop reads as missing', async () => {
    db.storeRedirect.findFirst.mockResolvedValue(null);
    expect((await patch({ isActive: false })).status).toBe(404);
  });

  it('two redirects cannot claim one source', async () => {
    db.storeRedirect.findFirst.mockResolvedValue({ id: 'existing' });
    expect((await post({ from: '/lp/old-one', to: '/lp/new-one' })).status).toBe(409);
  });

  it('suggestions come back first — they are the ones costing money while they wait', async () => {
    await GET();
    expect(db.storeRedirect.findMany.mock.calls[0][0].orderBy[0]).toEqual({ suggested: 'desc' });
  });

  it('the cache is dropped on every write, so a saved redirect works at once', async () => {
    await post({ from: '/lp/old-one', to: '/lp/new-one' });
    expect(forgetRedirects).toHaveBeenCalled();
  });
});
