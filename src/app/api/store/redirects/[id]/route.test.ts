import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * CHANGING WHERE A REDIRECT SENDS PEOPLE MUST NOT CHANGE WHAT KIND IT IS.
 *
 * `PATCH` spreads `{ ...parsed.data }` into the update. The schema was
 * `redirectCreateSchema.partial().strict()`, and `.partial()` in zod 4 keeps
 * every `.default()`:
 *
 *     { to: '/b' }  →  { to: '/b', kind: 302, isActive: true }
 *
 * So editing only the destination silently turned a permanent 301 into a
 * temporary 302, and switched back on a redirect somebody had deliberately
 * disabled — including one `standDownRedirectsTo` had disabled because a
 * live page now answers on that address.
 *
 * `route.test.ts` one directory up covers the ownership refusal, the loop
 * refusal and the accept flow. This file is about what the route WRITES.
 */

const { db, requireContext, requirePermission, logAudit, forgetRedirects } = vi.hoisted(() => ({
  db: {
    store: { findFirst: vi.fn() },
    storeRedirect: { findFirst: vi.fn(), update: vi.fn(), delete: vi.fn() },
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

import { PATCH } from './route';

/**
 * A redirect the seller MEANT: a permanent move, and switched off for now.
 * Both values are the opposite of the default the schema used to supply.
 */
const MEANT = {
  id: 'r-1',
  from: '/lp/winter-offer',
  to: '/lp/winter-offer-2',
  kind: 301,
  hits: 418,
  isActive: false,
  suggested: false,
  createdAt: new Date('2026-08-01'),
};

const ctx = { params: Promise.resolve({ id: 'r-1' }) };
const patch = (body: unknown) =>
  PATCH(
    new Request('http://localhost/api/store/redirects/r-1', { method: 'PATCH', body: JSON.stringify(body) }),
    ctx
  );

const written = () => db.storeRedirect.update.mock.calls[0][0].data as Record<string, unknown>;

beforeEach(() => {
  vi.resetAllMocks();
  requireContext.mockResolvedValue({ user: { id: 'u1' }, companyId: 'co-1', storeId: 'st-1' });
  requirePermission.mockResolvedValue(undefined);
  db.store.findFirst.mockResolvedValue({ id: 'st-1', slug: 'seha', companyId: 'co-1' });
  db.storeRedirect.findFirst.mockResolvedValue(MEANT);
  db.storeRedirect.update.mockImplementation(async ({ data }: never) => ({ ...MEANT, ...(data as object) }));
  db.landingPage.findFirst.mockResolvedValue(null);
});

describe('changing only the destination', () => {
  it('writes the destination and nothing else', async () => {
    const res = await patch({ to: '/lp/winter-offer-3' });
    expect(res.status).toBe(200);
    expect(written()).toEqual({ to: '/lp/winter-offer-3' });
  });

  it('does not turn a permanent 301 into a temporary 302', async () => {
    await patch({ to: '/lp/winter-offer-3' });
    expect('kind' in written()).toBe(false);
    expect(written().kind).toBeUndefined();
  });

  it('does not switch a deliberately disabled redirect back on', async () => {
    await patch({ to: '/lp/winter-offer-3' });
    expect('isActive' in written()).toBe(false);
  });

  it('and the row handed back is still the 301 the seller chose', async () => {
    const res = await patch({ to: '/lp/winter-offer-3' });
    const body = await res.json();
    expect(body.redirect.kind).toBe(301);
    expect(body.redirect.isActive).toBe(false);
  });
});

describe('an edit that really is about those fields', () => {
  it('writes the kind when the kind was sent', async () => {
    await patch({ kind: 302 });
    expect(written()).toEqual({ kind: 302 });
  });

  it('turns one on when asked', async () => {
    await patch({ isActive: true });
    expect(written()).toEqual({ isActive: true });
  });

  it('writes both sides when both were sent', async () => {
    // First lookup is the row being edited; the second is the clash check on
    // the new `from`, which nobody holds.
    db.storeRedirect.findFirst.mockReset();
    db.storeRedirect.findFirst.mockResolvedValueOnce(MEANT).mockResolvedValueOnce(null);
    await patch({ from: '/lp/a-old', to: '/lp/a-new', kind: 301, isActive: true });
    expect(written()).toEqual({ from: '/lp/a-old', to: '/lp/a-new', kind: 301, isActive: true });
  });
});

describe('accepting a suggestion', () => {
  it('writes only that it is no longer a suggestion', async () => {
    db.storeRedirect.findFirst.mockResolvedValue({ ...MEANT, suggested: true });
    const res = await patch({ accept: true });
    expect(res.status).toBe(200);
    expect(written()).toEqual({ suggested: false });
    expect(logAudit.mock.calls[0][0].action).toBe('STORE_REDIRECT_ACCEPTED');
  });

  it('and accepting a 301 suggestion does not demote it to a 302 on the way', async () => {
    db.storeRedirect.findFirst.mockResolvedValue({ ...MEANT, suggested: true, kind: 301 });
    await patch({ accept: true });
    expect('kind' in written()).toBe(false);
  });

  it('`accept` is still not mistaken for a field of the redirect itself', async () => {
    db.storeRedirect.findFirst.mockResolvedValue({ ...MEANT, suggested: true });
    await patch({ accept: true, kind: 302 });
    expect(written()).toEqual({ kind: 302, suggested: false });
  });
});

describe('an empty edit', () => {
  it('writes nothing — it used to write a whole default row', async () => {
    expect((await patch({})).status).toBe(200);
    expect(written()).toEqual({});
  });
});

describe('what the edit door still refuses', () => {
  it('a loop, measured against the stored row', async () => {
    const res = await patch({ to: '/lp/winter-offer' });
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('SELF_REDIRECT');
    expect(db.storeRedirect.update).not.toHaveBeenCalled();
  });

  it('a destination that is neither a path nor an http(s) URL', async () => {
    expect((await patch({ to: 'javascript:alert(1)' })).status).toBe(400);
    expect(db.storeRedirect.update).not.toHaveBeenCalled();
  });

  it('a source that would make the path an open door to another host', async () => {
    expect((await patch({ from: '//evil.example' })).status).toBe(400);
    expect(db.storeRedirect.update).not.toHaveBeenCalled();
  });

  it('a field no redirect has — `.strict()` survived the fix', async () => {
    expect((await patch({ to: '/lp/x', suggested: false })).status).toBe(400);
    expect(db.storeRedirect.update).not.toHaveBeenCalled();
  });

  it('a redirect of another shop reads as missing', async () => {
    db.storeRedirect.findFirst.mockResolvedValue(null);
    expect((await patch({ to: '/lp/x' })).status).toBe(404);
    expect(db.storeRedirect.update).not.toHaveBeenCalled();
  });
});
