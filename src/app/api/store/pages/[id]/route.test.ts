import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * PUBLISHING A PAGE MUST NOT ERASE IT — AND THE LEGAL THREE MUST BE
 * REACHABLE AT ALL.
 *
 * `PATCH` reads `storePageUpdateSchema` and writes `parsed.data` WHOLE. The
 * schema was `storePageCreateSchema.partial().strict()`, and `.partial()` in
 * zod 4 keeps every `.default()`, so every edit arrived as a whole row:
 *
 *     { isPublished: true }  →  { body: '', kind: 'CUSTOM',
 *                                 isPublished: true, sortOrder: 0 }
 *     { title: 'الخصوصية' } →  { title: '…', body: '', kind: 'CUSTOM',
 *                                 isPublished: false, sortOrder: 0 }
 *
 * Two losses in one. The text of the page was erased by the act of
 * publishing it. And because `kind` arrived as `'CUSTOM'` on every patch,
 * the route's own `KIND_IMMUTABLE` check fired for every page that is not
 * CUSTOM — so the PRIVACY, TERMS and REFUND pages an ad review requires
 * could not be edited or published through this door at all. The seeded
 * three arrive as drafts on purpose, so that was every shop's legal pages,
 * unreachable.
 *
 * `route.test.ts` one directory up covers the permissions, the slug clash
 * and the undeletable three. This file is about what the route WRITES.
 */

const { db, requireContext, requirePermission, logAudit } = vi.hoisted(() => ({
  db: {
    storePage: { findFirst: vi.fn(), update: vi.fn(), delete: vi.fn() },
  },
  requireContext: vi.fn(),
  requirePermission: vi.fn(),
  logAudit: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ db }));
vi.mock('@/lib/geo-context', () => ({ requireContext: (...a: unknown[]) => requireContext(...a) }));
vi.mock('@/lib/authorization', () => ({ requirePermission: (...a: unknown[]) => requirePermission(...a) }));
vi.mock('@/lib/audit', () => ({ logAudit: (...a: unknown[]) => logAudit(...a) }));

import { PATCH } from './route';

/** A privacy policy the seller has written and not yet published. */
const WRITTEN = {
  id: 'p-1',
  slug: 'privacy',
  title: 'سياسة الخصوصية',
  body: 'ما نجمعه: اسمك ورقم هاتفك وعنوانك.\n\nمع من نتشاركه: شركة الشحن وحدها.',
  kind: 'PRIVACY',
  isPublished: false,
  sortOrder: 1,
  updatedAt: new Date('2026-09-01'),
};

const ctx = { params: Promise.resolve({ id: 'p-1' }) };
const patch = (body: unknown) =>
  PATCH(
    new Request('http://localhost/api/store/pages/p-1', { method: 'PATCH', body: JSON.stringify(body) }),
    ctx
  );

const written = () => db.storePage.update.mock.calls[0][0].data as Record<string, unknown>;

beforeEach(() => {
  vi.resetAllMocks();
  requireContext.mockResolvedValue({ user: { id: 'u1' }, companyId: 'co-1', storeId: 'st-1' });
  requirePermission.mockResolvedValue(undefined);
  db.storePage.findFirst.mockResolvedValue(WRITTEN);
  db.storePage.update.mockImplementation(async ({ data }: never) => ({ ...WRITTEN, ...(data as object) }));
});

describe('publishing a page the seller wrote', () => {
  it('writes the one flag and nothing else', async () => {
    const res = await patch({ isPublished: true });
    expect(res.status).toBe(200);
    expect(written()).toEqual({ isPublished: true });
  });

  it('does not erase the text — that was twenty minutes of the seller’s work', async () => {
    const res = await patch({ isPublished: true });
    expect('body' in written()).toBe(false);
    expect(written().body).toBeUndefined();
    // And the page handed back to the screen still reads as it was written.
    expect((await res.json()).page.body).toBe(WRITTEN.body);
  });

  it('does not move the page to the top of the list', async () => {
    await patch({ isPublished: true });
    expect('sortOrder' in written()).toBe(false);
  });
});

describe('renaming a published page', () => {
  it('does not take it offline', async () => {
    db.storePage.findFirst.mockResolvedValue({ ...WRITTEN, isPublished: true });
    await patch({ title: 'الخصوصية' });
    expect(written()).toEqual({ title: 'الخصوصية' });
    expect('isPublished' in written()).toBe(false);
  });
});

/**
 * THE VERDICT ON `KIND_IMMUTABLE`.
 *
 * The guard was never wrong. It was written for a world where `kind` only
 * arrives if somebody sent it, and the schema had stopped being that world:
 * `kind` arrived as `'CUSTOM'` on every patch, so the guard refused every
 * non-CUSTOM page instead of refusing every kind CHANGE. Stripping the
 * defaults restores the world it was written for, and it does its intended
 * job again — all three cases below, not just the refusing one.
 */
describe('a page’s kind is fixed at creation', () => {
  it('and an edit that never mentions the kind is no longer refused', async () => {
    for (const kind of ['PRIVACY', 'TERMS', 'REFUND', 'ABOUT', 'CONTACT', 'CUSTOM']) {
      vi.clearAllMocks();
      db.storePage.findFirst.mockResolvedValue({ ...WRITTEN, kind });
      db.storePage.update.mockResolvedValue({ ...WRITTEN, kind, isPublished: true });
      const res = await patch({ isPublished: true });
      // This returned 409 KIND_IMMUTABLE for five of these six.
      expect(res.status, kind).toBe(200);
    }
  });

  it('sending the same kind alongside an edit is still not a change', async () => {
    const res = await patch({ kind: 'PRIVACY', title: 'الخصوصية' });
    expect(res.status).toBe(200);
    expect(written()).toEqual({ kind: 'PRIVACY', title: 'الخصوصية' });
  });

  it('sending a different kind is still a 409, so nothing can be relabelled', async () => {
    const res = await patch({ kind: 'CUSTOM' });
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('KIND_IMMUTABLE');
    expect(db.storePage.update).not.toHaveBeenCalled();
  });

  it('including the relabel the guard exists for: «about us» as the policy', async () => {
    db.storePage.findFirst.mockResolvedValue({ ...WRITTEN, kind: 'CUSTOM' });
    const res = await patch({ kind: 'PRIVACY' });
    expect(res.status).toBe(409);
    expect(db.storePage.update).not.toHaveBeenCalled();
  });
});

describe('an empty edit', () => {
  it('writes nothing — it used to write a whole default row', async () => {
    expect((await patch({})).status).toBe(200);
    expect(written()).toEqual({});
  });
});

describe('an edit that really is about the text', () => {
  it('writes the body it was given', async () => {
    await patch({ body: 'نصّ جديد' });
    expect(written()).toEqual({ body: 'نصّ جديد' });
  });

  it('and may deliberately clear it', async () => {
    await patch({ body: '' });
    expect(written()).toEqual({ body: '' });
  });

  it('writes several fields when several were sent', async () => {
    await patch({ title: 'عنوان', body: 'نصّ', sortOrder: 4, isPublished: true });
    expect(written()).toEqual({ title: 'عنوان', body: 'نصّ', sortOrder: 4, isPublished: true });
  });
});

describe('a body carrying a field no page has', () => {
  it('is refused rather than quietly dropped — `.strict()` survived the fix', async () => {
    const res = await patch({ title: 'عنوان', theme: 'dark' });
    expect(res.status).toBe(400);
    expect(db.storePage.update).not.toHaveBeenCalled();
  });
});
