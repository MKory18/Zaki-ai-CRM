import { beforeEach, describe, expect, it, vi } from 'vitest';

const { db, requireContext, requirePermission, logAudit } = vi.hoisted(() => ({
  db: { store: { findFirst: vi.fn(), update: vi.fn() } },
  requireContext: vi.fn(),
  requirePermission: vi.fn(),
  logAudit: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ db }));
vi.mock('@/lib/geo-context', () => ({ requireContext: (...a: unknown[]) => requireContext(...a) }));
vi.mock('@/lib/authorization', () => ({ requirePermission: (...a: unknown[]) => requirePermission(...a) }));
vi.mock('@/lib/audit', () => ({ logAudit: (...a: unknown[]) => logAudit(...a) }));

import { GET, PUT } from './route';

const put = (body: unknown) =>
  PUT(new Request('http://localhost/api/store/language', { method: 'PUT', body: JSON.stringify(body) }));

beforeEach(() => {
  vi.resetAllMocks();
  requireContext.mockResolvedValue({ user: { id: 'u1' }, companyId: 'c1', storeId: 's1' });
  requirePermission.mockResolvedValue(undefined);
  db.store.findFirst.mockResolvedValue({ id: 's1', language: 'ar' });
  db.store.update.mockResolvedValue({});
});

describe('setting the language', () => {
  it('stores the language and answers with the direction it implies', async () => {
    const body = await (await put({ language: 'en' })).json();
    expect(db.store.update.mock.calls[0][0].data).toEqual({ language: 'en' });
    expect(body.dir).toBe('ltr');
  });

  it('never stores a direction — there is one source of truth', async () => {
    await put({ language: 'en' });
    expect(Object.keys(db.store.update.mock.calls[0][0].data)).toEqual(['language']);
  });

  it('ignores a direction somebody sends alongside', async () => {
    // A request saying «العربية, but left-to-right» is the disagreement the
    // derived direction exists to make impossible.
    const body = await (await put({ language: 'ar', dir: 'ltr' })).json();
    expect(db.store.update.mock.calls[0][0].data).toEqual({ language: 'ar' });
    expect(body.dir).toBe('rtl');
  });

  it('refuses a language it does not support, rather than defaulting quietly', async () => {
    for (const bad of ['de', 'zz', '', 'ar-SY', null]) {
      const res = await put({ language: bad });
      expect(res.status, String(bad)).toBe(400);
    }
    expect(db.store.update).not.toHaveBeenCalled();
  });

  it('records what it was and what it became', async () => {
    await put({ language: 'fr' });
    const entry = logAudit.mock.calls[0][0];
    expect(entry.action).toBe('STORE_LANGUAGE_CHANGED');
    expect(entry.previousData).toEqual({ language: 'ar' });
    expect(entry.newData).toEqual({ language: 'fr' });
  });
});

describe('the guards', () => {
  it('reading is storefront.view, writing is storefront.manage', async () => {
    await GET();
    expect(requirePermission).toHaveBeenCalledWith('storefront.view');
    vi.clearAllMocks();
    requirePermission.mockResolvedValue(undefined);
    db.store.findFirst.mockResolvedValue({ id: 's1', language: 'ar' });
    db.store.update.mockResolvedValue({});
    await put({ language: 'en' });
    expect(requirePermission).toHaveBeenCalledWith('storefront.manage');
  });

  it('writes nothing without the permission', async () => {
    requirePermission.mockRejectedValue(Object.assign(new Error('forbidden'), { status: 403 }));
    await put({ language: 'en' });
    expect(db.store.update).not.toHaveBeenCalled();
  });

  it('another company’s store reads as missing', async () => {
    db.store.findFirst.mockResolvedValue(null);
    expect((await GET()).status).toBe(404);
    expect((await put({ language: 'en' })).status).toBe(404);
  });

  it('is the store the session is in', async () => {
    await GET();
    expect(db.store.findFirst.mock.calls[0][0].where).toMatchObject({ id: 's1', companyId: 'c1' });
  });
});

describe('what the screen is offered', () => {
  it('every language, each with its direction already decided', async () => {
    const body = await (await GET()).json();
    expect(body.available.length).toBeGreaterThan(1);
    for (const l of body.available) {
      expect(['rtl', 'ltr']).toContain(l.dir);
      expect(l.label.length).toBeGreaterThan(1);
    }
  });
});
