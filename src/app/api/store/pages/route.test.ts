import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A SHOP'S PAGES: ITS OWN, AND THE THREE IT CANNOT LOSE.
 *
 * The refusals: reaching another shop's page by id, writing without the
 * permission, deleting a page an advertising review asks for, and
 * relabelling a page's kind so a shop believes itself covered when it is
 * not.
 */

const { db, requireContext, requirePermission, logAudit } = vi.hoisted(() => ({
  db: {
    store: { findFirst: vi.fn() },
    storePage: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
  },
  requireContext: vi.fn(),
  requirePermission: vi.fn(),
  logAudit: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ db }));
vi.mock('@/lib/geo-context', () => ({ requireContext: (...a: unknown[]) => requireContext(...a) }));
vi.mock('@/lib/authorization', () => ({ requirePermission: (...a: unknown[]) => requirePermission(...a) }));
vi.mock('@/lib/audit', () => ({ logAudit: (...a: unknown[]) => logAudit(...a) }));

import { GET, POST } from './route';
import { PATCH, DELETE } from './[id]/route';

const PAGE = {
  id: 'p1', slug: 'privacy', title: 'سياسة الخصوصية', body: 'نصّ',
  kind: 'PRIVACY', isPublished: false, sortOrder: 1, updatedAt: new Date(),
};

const ctx = { params: Promise.resolve({ id: 'p1' }) };
const post = (body: unknown) =>
  POST(new Request('http://localhost/api/store/pages', { method: 'POST', body: JSON.stringify(body) }));
const patch = (body: unknown) =>
  PATCH(new Request('http://localhost/api/store/pages/p1', { method: 'PATCH', body: JSON.stringify(body) }), ctx);

beforeEach(() => {
  // reset, not clear: clearAllMocks empties the call log but leaves both the
  // implementation and any un-consumed mockResolvedValueOnce queue in place,
  // so one test's "something already sits here" leaked into the next.
  vi.resetAllMocks();
  requireContext.mockResolvedValue({ user: { id: 'u1' }, companyId: 'c1', storeId: 's1' });
  requirePermission.mockResolvedValue(undefined);
  db.store.findFirst.mockResolvedValue({ id: 's1', slug: 'seha' });
  db.storePage.findMany.mockResolvedValue([PAGE]);
  db.storePage.findFirst.mockResolvedValue(null);
  db.storePage.create.mockImplementation(async ({ data }: never) => ({ ...PAGE, ...(data as object) }));
  db.storePage.update.mockImplementation(async ({ data }: never) => ({ ...PAGE, ...(data as object) }));
});

describe('which shop’s pages', () => {
  it('are read from the store the session is in', async () => {
    await GET();
    expect(db.storePage.findMany.mock.calls[0][0].where).toMatchObject({ storeId: 's1', companyId: 'c1' });
  });

  it('a page id belonging to another shop reads as missing, not as somebody else’s', async () => {
    db.storePage.findFirst.mockResolvedValue(null);
    expect((await patch({ title: 'x' })).status).toBe(404);
    expect(db.storePage.update).not.toHaveBeenCalled();
  });
});

describe('who may write them', () => {
  it('reading asks for storefront.view, writing for storefront.manage', async () => {
    await GET();
    expect(requirePermission).toHaveBeenCalledWith('storefront.view');
    vi.clearAllMocks();
    requirePermission.mockResolvedValue(undefined);
    db.store.findFirst.mockResolvedValue({ id: 's1', slug: 'seha' });
    await post({ slug: 'about', title: 'من نحن' });
    expect(requirePermission).toHaveBeenCalledWith('storefront.manage');
  });

  it('writes nothing when the permission is refused', async () => {
    requirePermission.mockRejectedValue(Object.assign(new Error('forbidden'), { status: 403 }));
    await post({ slug: 'about', title: 'من نحن' });
    expect(db.storePage.create).not.toHaveBeenCalled();
  });
});

describe('the three an ad review asks for', () => {
  it('cannot be deleted — unpublishing is the way, and losing them loses campaigns', async () => {
    for (const kind of ['PRIVACY', 'TERMS', 'REFUND']) {
      db.storePage.findFirst.mockResolvedValue({ ...PAGE, kind });
      const res = await DELETE(new Request('http://localhost/x', { method: 'DELETE' }), ctx);
      expect(res.status, kind).toBe(409);
      expect((await res.json()).code).toBe('REQUIRED_PAGE');
    }
    expect(db.storePage.delete).not.toHaveBeenCalled();
  });

  it('a page the shop added itself can be deleted', async () => {
    db.storePage.findFirst.mockResolvedValue({ ...PAGE, kind: 'CUSTOM' });
    const res = await DELETE(new Request('http://localhost/x', { method: 'DELETE' }), ctx);
    expect(res.status).toBe(200);
    expect(db.storePage.delete).toHaveBeenCalled();
  });

  it('are reported by kind when they are not published yet', async () => {
    db.storePage.findMany.mockResolvedValue([
      { ...PAGE, kind: 'PRIVACY', isPublished: true },
      { ...PAGE, kind: 'TERMS', isPublished: false },
    ]);
    const body = await (await GET()).json();
    expect(body.missingForAds).toEqual(['TERMS', 'REFUND']);
  });
});

describe('a page’s kind is fixed at creation', () => {
  it('so a shop cannot relabel its «about us» as its privacy policy', async () => {
    db.storePage.findFirst.mockResolvedValue({ ...PAGE, kind: 'CUSTOM' });
    const res = await patch({ kind: 'PRIVACY' });
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('KIND_IMMUTABLE');
    expect(db.storePage.update).not.toHaveBeenCalled();
  });

  it('but sending the same kind alongside an edit is not a change', async () => {
    db.storePage.findFirst.mockResolvedValue({ ...PAGE, kind: 'PRIVACY' });
    expect((await patch({ kind: 'PRIVACY', title: 'الخصوصية' })).status).toBe(200);
  });
});

describe('two pages cannot share an address', () => {
  it('on create', async () => {
    db.storePage.findFirst.mockResolvedValue({ id: 'other' });
    expect((await post({ slug: 'privacy', title: 'سياسة الخصوصية' })).status).toBe(409);
    expect(db.storePage.create).not.toHaveBeenCalled();
  });

  it('on rename', async () => {
    db.storePage.findFirst
      .mockResolvedValueOnce({ ...PAGE, slug: 'terms' }) // the page being edited
      .mockResolvedValueOnce({ id: 'other' }); // something already at the new slug
    expect((await patch({ slug: 'privacy' })).status).toBe(409);
    expect(db.storePage.update).not.toHaveBeenCalled();
  });
});

describe('what a page may not be', () => {
  it.each([['a b'], ['-x'], ['x_y'], [''], ['a'.repeat(60)]])('the slug %s is refused', async (slug) => {
    const res = await post({ slug, title: 'عنوان' });
    expect(res.status, slug).toBe(400);
    expect(db.storePage.create).not.toHaveBeenCalled();
  });

  it('a slug typed in capitals is lower-cased, not refused — an address has one spelling', async () => {
    const res = await post({ slug: 'About-Us', title: 'من نحن' });
    expect(res.status).toBe(201);
    expect(db.storePage.create.mock.calls[0][0].data.slug).toBe('about-us');
  });

  it('a title too short to name anything', async () => {
    expect((await post({ slug: 'ok', title: 'x' })).status).toBe(400);
  });
});
