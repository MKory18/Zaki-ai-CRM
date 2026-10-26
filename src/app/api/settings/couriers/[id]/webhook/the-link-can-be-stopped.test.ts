import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * «الغي الويب هوك وخليك API». The courier's status link can be stopped from the settings screen — the statuses keep
 * coming from the API — and the screen is told whether this courier is polled at all.
 */

const { db, requirePermission, logAudit } = vi.hoisted(() => ({
  db: { deliveryProvider: { findFirst: vi.fn(), update: vi.fn() } },
  requirePermission: vi.fn(),
  logAudit: vi.fn(),
}));
vi.mock('@/lib/db', () => ({ db }));
vi.mock('@/lib/geo-context', () => ({ requireContext: async () => ({ user: { id: 'u1' }, companyId: 'c1', storeId: 's1' }) }));
vi.mock('@/lib/authorization', () => ({ requirePermission: (...a: unknown[]) => requirePermission(...a) }));
vi.mock('@/lib/audit', () => ({ logAudit: (...a: unknown[]) => logAudit(...a) }));
vi.mock('@/lib/couriers', () => ({ isAutomated: (p: { adapterCode?: string; apiEnabled?: boolean }) => !!p.apiEnabled && p.adapterCode === 'LOGESTECHS' }));

import { DELETE, GET } from './route';

const params = { params: Promise.resolve({ id: 'p1' }) };
const del = () => DELETE(new Request('http://localhost/x', { method: 'DELETE' }), params);
const get = () => GET(new Request('http://localhost/x'), params);

beforeEach(() => {
  vi.clearAllMocks();
  requirePermission.mockResolvedValue(undefined);
});

describe('stopping the link', () => {
  it('clears the link, and the audit names the courier but never the link', async () => {
    db.deliveryProvider.findFirst.mockResolvedValue({ id: 'p1', name: 'الباشا', webhookSecretHash: 'hash', webhookLastSeenAt: null });
    const res = await del();
    expect(await res.json()).toEqual({ ok: true, revoked: true });
    expect(db.deliveryProvider.update.mock.calls[0][0].data).toEqual({ webhookSecretHash: null, webhookSecretSetAt: null, webhookLastSeenAt: null });
    expect(logAudit.mock.calls[0][0]).toMatchObject({ action: 'COURIER_WEBHOOK_REVOKED', newData: { courier: 'الباشا' } });
    expect(JSON.stringify(logAudit.mock.calls)).not.toContain('hash');
  });

  it('NEGATIVE: nothing to stop writes nothing', async () => {
    db.deliveryProvider.findFirst.mockResolvedValue({ id: 'p1', name: 'الباشا', webhookSecretHash: null, webhookLastSeenAt: null });
    expect(await (await del()).json()).toEqual({ ok: true, revoked: false });
    expect(db.deliveryProvider.update).not.toHaveBeenCalled();
    expect(logAudit).not.toHaveBeenCalled();
  });

  it('NEGATIVE: another company’s courier is not found', async () => {
    db.deliveryProvider.findFirst.mockResolvedValue(null);
    expect((await del()).status).toBe(404);
    expect(db.deliveryProvider.findFirst.mock.calls[0][0].where).toEqual({ id: 'p1', companyId: 'c1' });
  });

  it('NEGATIVE: without the sensitive-settings permission it is refused', async () => {
    requirePermission.mockRejectedValue(Object.assign(new Error('Forbidden'), { status: 403 }));
    const res = await del();
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(db.deliveryProvider.update).not.toHaveBeenCalled();
    expect(requirePermission).toHaveBeenCalledWith('settings.manage');
  });
});

describe('the screen is told whether the statuses are pulled', () => {
  it('polled for Basha on LogesTechs; no credential leaves the server', async () => {
    db.deliveryProvider.findFirst.mockResolvedValue({
      webhookSecretHash: null, webhookSecretSetAt: null, webhookLastSeenAt: null,
      code: 'BASHA', apiEnabled: true, adapterCode: 'LOGESTECHS', apiConfig: {}, apiCredentials: 'sealed-blob',
    });
    const json = await (await get()).json();
    expect(json.polled).toBe(true);
    expect(JSON.stringify(json)).not.toContain('sealed-blob');
  });

  it('NEGATIVE: a manual courier is not polled', async () => {
    db.deliveryProvider.findFirst.mockResolvedValue({
      webhookSecretHash: null, webhookSecretSetAt: null, webhookLastSeenAt: null,
      code: 'ALO', apiEnabled: false, adapterCode: null, apiConfig: null, apiCredentials: null,
    });
    expect((await (await get()).json()).polled).toBe(false);
  });
});
