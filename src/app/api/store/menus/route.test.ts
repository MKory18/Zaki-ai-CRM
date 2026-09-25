import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * THE MENUS API: THIS SHOP'S, AND NOTHING THAT POINTS ELSEWHERE.
 */

const { db, requireContext, requirePermission, logAudit } = vi.hoisted(() => ({
  db: {
    store: { findFirst: vi.fn() },
    storeMenu: { findMany: vi.fn(), findFirst: vi.fn(), upsert: vi.fn() },
    storePage: { findMany: vi.fn() },
  },
  requireContext: vi.fn(),
  requirePermission: vi.fn(),
  logAudit: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ db }));
vi.mock('@/lib/geo-context', () => ({ requireContext: (...a: unknown[]) => requireContext(...a) }));
vi.mock('@/lib/authorization', () => ({ requirePermission: (...a: unknown[]) => requirePermission(...a) }));
vi.mock('@/lib/audit', () => ({ logAudit: (...a: unknown[]) => logAudit(...a) }));

import { GET, PUT } from './route';

const put = (key: string, body: unknown) =>
  PUT(new Request(`http://localhost/api/store/menus?key=${key}`, { method: 'PUT', body: JSON.stringify(body) }));

const ITEM = { label: 'من نحن', href: '/s/seha/pages/about', visible: true };

beforeEach(() => {
  // reset, not clear: clearAllMocks leaves implementations and un-consumed
  // Once queues in place, and one test's state then leaks into the next.
  vi.resetAllMocks();
  requireContext.mockResolvedValue({ user: { id: 'u1' }, companyId: 'c1', storeId: 's1' });
  requirePermission.mockResolvedValue(undefined);
  db.store.findFirst.mockResolvedValue({ id: 's1', slug: 'seha' });
  db.storeMenu.findMany.mockResolvedValue([]);
  db.storeMenu.findFirst.mockResolvedValue(null);
  db.storeMenu.upsert.mockResolvedValue({});
  db.storePage.findMany.mockResolvedValue([]);
});

describe('reading the menus', () => {
  it('returns all five, empty where nothing is set', async () => {
    const body = await (await GET()).json();
    expect(Object.keys(body.menus)).toEqual(['HEADER', 'MAIN', 'FOOTER', 'ABOUT', 'POLICIES']);
    for (const key of Object.keys(body.menus)) expect(body.menus[key]).toEqual([]);
  });

  it('is scoped to the store the session is in', async () => {
    await GET();
    expect(db.storeMenu.findMany.mock.calls[0][0].where).toMatchObject({ storeId: 's1' });
    expect(db.store.findFirst.mock.calls[0][0].where).toMatchObject({ id: 's1', companyId: 'c1' });
  });

  it('offers the shop’s own pages as destinations, drafts included and marked', async () => {
    // A seller building the footer before publishing the policies is
    // ordinary; refusing the link would force the wrong order of work.
    db.storePage.findMany.mockResolvedValue([
      { slug: 'privacy', title: 'الخصوصية', isPublished: false },
      { slug: 'terms', title: 'الشروط', isPublished: true },
    ]);
    const body = await (await GET()).json();
    expect(body.pages).toHaveLength(2);
    expect(body.pages[0].isPublished).toBe(false);
  });

  it('asks for storefront.view', async () => {
    await GET();
    expect(requirePermission).toHaveBeenCalledWith('storefront.view');
  });
});

describe('writing a menu', () => {
  it('asks for storefront.manage and writes nothing without it', async () => {
    requirePermission.mockRejectedValue(Object.assign(new Error('forbidden'), { status: 403 }));
    await put('FOOTER', { items: [ITEM] });
    expect(db.storeMenu.upsert).not.toHaveBeenCalled();
  });

  it('replaces the menu whole, keyed on the shop and the menu', async () => {
    await put('FOOTER', { items: [ITEM] });
    const call = db.storeMenu.upsert.mock.calls[0][0];
    expect(call.where).toEqual({ storeId_key: { storeId: 's1', key: 'FOOTER' } });
    expect(JSON.parse(call.update.items)).toEqual([ITEM]);
  });

  it('accepts an empty menu — emptying one is a thing a seller may want', async () => {
    const res = await put('MAIN', { items: [] });
    expect(res.status).toBe(200);
    expect(JSON.parse(db.storeMenu.upsert.mock.calls[0][0].update.items)).toEqual([]);
  });

  it('refuses a menu key it does not know', async () => {
    for (const key of ['SIDEBAR', '', 'footer', 'DROP TABLE']) {
      const res = await put(key, { items: [] });
      expect(res.status, key).toBe(400);
    }
    expect(db.storeMenu.upsert).not.toHaveBeenCalled();
  });

  it('refuses a destination that leaves the shop for another origin', async () => {
    for (const href of ['//evil.example', 'javascript:alert(1)', 'data:text/html,x', '/\\evil.example']) {
      const res = await put('FOOTER', { items: [{ label: 'x', href, visible: true }] });
      expect(res.status, href).toBe(400);
    }
    expect(db.storeMenu.upsert).not.toHaveBeenCalled();
  });

  it('refuses one bad item among good ones — the menu is written whole or not at all', async () => {
    const res = await put('FOOTER', {
      items: [ITEM, { label: 'x', href: '//evil.example', visible: true }, ITEM],
    });
    expect(res.status).toBe(400);
    expect(db.storeMenu.upsert).not.toHaveBeenCalled();
  });

  it('records what the menu was and what it became', async () => {
    db.storeMenu.findFirst.mockResolvedValue({ items: '[]' });
    await put('FOOTER', { items: [ITEM] });
    const entry = logAudit.mock.calls[0][0];
    expect(entry).toMatchObject({ action: 'STORE_MENU_UPDATED', entity: 'StoreMenu', entityId: 's1:FOOTER' });
    expect(entry.previousData.items).toBe('[]');
    expect(entry.newData.items).toContain('من نحن');
  });

  it('a store outside the company reads as missing', async () => {
    db.store.findFirst.mockResolvedValue(null);
    expect((await put('FOOTER', { items: [ITEM] })).status).toBe(404);
    expect(db.storeMenu.upsert).not.toHaveBeenCalled();
  });
});
