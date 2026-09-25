import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * THE STORE'S LOOK: ONE EDITOR, ONE STORE, ONE PERMISSION.
 *
 * Every test here is a refusal. The three things that must not be possible:
 * painting a shop you are not working in, painting one without the
 * permission to, and a Single Product store holding a cart-bar setting for
 * a cart it does not have.
 */

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

import { GET, PATCH } from './route';
import { DEFAULT_STORE_THEME } from '@/lib/store-theme';

const STORE = {
  id: 'store-1',
  name: 'صحة بلس',
  type: 'MULTI_PRODUCT',
  theme: null as string | null,
  logo: '/logo.webp',
  favicon: null,
};

const patch = (body: unknown) =>
  PATCH(new Request('http://localhost/api/store/theme', { method: 'PATCH', body: JSON.stringify(body) }));

beforeEach(() => {
  vi.clearAllMocks();
  requireContext.mockResolvedValue({ user: { id: 'u1', name: 'المالك' }, companyId: 'c1', storeId: 'store-1' });
  requirePermission.mockResolvedValue(undefined);
  db.store.findFirst.mockResolvedValue({ ...STORE });
  db.store.update.mockResolvedValue({});
});

describe('which store gets painted', () => {
  it('is the one the session is in — never one named in the body', async () => {
    await patch({ ...DEFAULT_STORE_THEME, accent: '#010203', id: 'someone-elses-store' });
    // The id in the body is not a field of the theme, so a strict parse
    // would reject it; what matters is the store looked up and written.
    const where = db.store.findFirst.mock.calls[0][0].where;
    expect(where).toMatchObject({ id: 'store-1', companyId: 'c1' });
  });

  it('is scoped to the company, so another tenant’s store reads as missing', async () => {
    db.store.findFirst.mockResolvedValue(null);
    const res = await patch(DEFAULT_STORE_THEME);
    expect(res.status).toBe(404);
    expect(db.store.update).not.toHaveBeenCalled();
  });
});

describe('who may paint it', () => {
  it('reading asks for storefront.view', async () => {
    await GET();
    expect(requirePermission).toHaveBeenCalledWith('storefront.view');
  });

  it('writing asks for storefront.manage, not geo.manage', async () => {
    await patch(DEFAULT_STORE_THEME);
    expect(requirePermission).toHaveBeenCalledWith('storefront.manage');
    expect(requirePermission).not.toHaveBeenCalledWith('geo.manage');
  });

  it('writes nothing when the permission is refused', async () => {
    requirePermission.mockRejectedValue(Object.assign(new Error('forbidden'), { status: 403 }));
    await patch(DEFAULT_STORE_THEME);
    expect(db.store.update).not.toHaveBeenCalled();
  });
});

describe('what it refuses to store', () => {
  it('a colour that is not a colour', async () => {
    const res = await patch({ ...DEFAULT_STORE_THEME, colors: { primary: 'blue' } });
    expect(res.status).toBe(400);
    expect(db.store.update).not.toHaveBeenCalled();
  });

  it('a footer link that walks the shopper off to another origin', async () => {
    const res = await patch({
      ...DEFAULT_STORE_THEME,
      footer: { links: [{ label: 'x', href: '//evil.example' }], copyright: '' },
    });
    expect(res.status).toBe(400);
    expect(db.store.update).not.toHaveBeenCalled();
  });

  it('a body that is not a theme at all', async () => {
    expect((await patch({ nonsense: true })).status).toBe(400);
    expect(db.store.update).not.toHaveBeenCalled();
  });
});

describe('a Single Product store has no cart, so it holds no cart-bar setting', () => {
  it('drops it on the way in — hiding the tab was never the enforcement', async () => {
    db.store.findFirst.mockResolvedValue({ ...STORE, type: 'SINGLE_PRODUCT' });
    await patch({ ...DEFAULT_STORE_THEME, cartBar: { enabled: true, label: 'أكمل الطلب' } });
    const written = JSON.parse(db.store.update.mock.calls[0][0].data.theme);
    expect(written.cartBar).toBeUndefined();
  });

  it('keeps it for a shop that does have a cart', async () => {
    await patch({ ...DEFAULT_STORE_THEME, cartBar: { enabled: false, label: 'السلة' } });
    const written = JSON.parse(db.store.update.mock.calls[0][0].data.theme);
    expect(written.cartBar).toMatchObject({ enabled: false });
  });

  it('and says so in what it hands the screen', async () => {
    db.store.findFirst.mockResolvedValue({ ...STORE, type: 'SINGLE_PRODUCT' });
    const body = await (await GET()).json();
    expect(body.store.cartBarApplies).toBe(false);
  });
});

describe('the logo and the favicon', () => {
  it('are returned to be shown and linked to, and there is no way to write them here', async () => {
    const body = await (await GET()).json();
    expect(body.store.logo).toBe('/logo.webp');
    await patch({ ...DEFAULT_STORE_THEME, logo: '/other.webp', favicon: '/other.ico' });
    const call = db.store.update.mock.calls[0]?.[0];
    // Only the theme column is ever written from this route.
    expect(Object.keys(call.data)).toEqual(['theme']);
  });
});

describe('the change is recorded', () => {
  it('with the theme before and after', async () => {
    db.store.findFirst.mockResolvedValue({ ...STORE, theme: '{"accent":"#000000"}' });
    await patch({ ...DEFAULT_STORE_THEME, accent: '#111111' });
    const entry = logAudit.mock.calls[0][0];
    expect(entry).toMatchObject({ action: 'STORE_THEME_UPDATED', entity: 'Store', entityId: 'store-1' });
    expect(entry.previousData.theme).toContain('#000000');
    expect(entry.newData.theme).toContain('#111111');
  });
});
