import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A REAL ORDER TO PREVIEW AGAINST — BEHIND THE SETTINGS PERMISSION.
 *
 * Reading the templates is deliberately open: the tracking screen loads
 * them on every visit, and an agent who cannot read the list cannot send
 * anything. That is exactly why the sample order cannot ride along with
 * them. It carries a customer's name, and a screen that asked for
 * sentences has no business being handed a person.
 */

const { db, requireContext, requirePermission, logAudit } = vi.hoisted(() => ({
  db: { company: { findUnique: vi.fn() }, order: { findFirst: vi.fn() }, $transaction: vi.fn(), $queryRaw: vi.fn() },
  requireContext: vi.fn(),
  requirePermission: vi.fn(),
  logAudit: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ db }));
vi.mock('@/lib/geo-context', () => ({ requireContext: (...a: unknown[]) => requireContext(...a) }));
vi.mock('@/lib/authorization', () => ({ requirePermission: (...a: unknown[]) => requirePermission(...a) }));
vi.mock('@/lib/audit', () => ({ logAudit: (...a: unknown[]) => logAudit(...a) }));

import { GET } from './route';

const get = (qs = '') => GET(new Request(`http://localhost/api/settings/messages${qs}`));

beforeEach(() => {
  vi.resetAllMocks();
  requireContext.mockResolvedValue({ user: { id: 'u1' }, companyId: 'c1', storeId: 's1' });
  requirePermission.mockResolvedValue(undefined);
  db.company.findUnique.mockResolvedValue({ settings: null });
  db.order.findFirst.mockResolvedValue({
    orderNumber: 'SY-0044',
    totalAmount: 1200,
    currency: 'SYP',
    trackingNumber: 'BC-9',
    customer: { fullName: 'سارة' },
    region: { name: 'المزة' },
    deliveryProvider: { name: 'باشا' },
    store: { name: 'متجري' },
  });
});

describe('the plain read', () => {
  it('needs no permission — an agent who cannot read it cannot send anything', async () => {
    expect((await get()).status).toBe(200);
    expect(requirePermission).not.toHaveBeenCalled();
  });

  it('carries no customer with it', async () => {
    const body = await (await get()).json();
    expect(body.sample).toBeUndefined();
    expect(db.order.findFirst).not.toHaveBeenCalled();
    expect(JSON.stringify(body)).not.toContain('سارة');
  });

  it('and still says which moments and languages exist, so the picker can group', async () => {
    const body = await (await get()).json();
    expect(body.situations.map((s: { key: string }) => s.key)).toContain('no_answer');
    expect(body.languages.map((l: { code: string }) => l.code)).toContain('ar');
  });
});

describe('the sample order', () => {
  it('is only fetched when it is asked for', async () => {
    const body = await (await get('?sample=1')).json();
    expect(body.sample).toMatchObject({ orderNumber: 'SY-0044', customerName: 'سارة', courier: 'باشا' });
  });

  it('is behind the permission that edits settings', async () => {
    requirePermission.mockRejectedValue(new Error('Forbidden: missing required permission settings.manage'));
    expect((await get('?sample=1')).status).toBe(403);
    expect(db.order.findFirst).not.toHaveBeenCalled();
  });

  it('comes from this store, not whichever order is newest in the company', async () => {
    await get('?sample=1');
    expect(db.order.findFirst.mock.calls[0][0].where).toMatchObject({ companyId: 'c1', storeId: 's1' });
  });

  it('is null on a shop with no orders yet — said plainly, not invented', async () => {
    db.order.findFirst.mockResolvedValue(null);
    expect((await (await get('?sample=1')).json()).sample).toBeNull();
  });
});
