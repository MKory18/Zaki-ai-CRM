import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * SWITCHING AN AD ACCOUNT TO MANUAL — AND WHAT IT MUST NOT TAKE WITH IT.
 *
 * «اوتوماتيك او ادخال يدوي بالكامل. اريد الخيارين». A connected account can
 * be made manual: the token is DELETED (not hidden), the campaigns STAY in
 * the account and stop being synced, and the money already pulled is left
 * exactly as it was — it was real, and the disconnect beside this one says so.
 *
 * And the other half of the same file: a manual account has no token and no
 * platform, so the listing of «their» campaigns must refuse it BEFORE
 * anything is decrypted — `readCredentials` on a null is the throw this route
 * used to be one nullable column away from.
 */

const { db, requireContext, requirePermission, logAudit, readCredentials, listCampaigns } = vi.hoisted(() => ({
  db: {
    adAccount: { findFirst: vi.fn(), update: vi.fn(), delete: vi.fn() },
    campaign: { updateMany: vi.fn() },
    $transaction: vi.fn(),
  },
  requireContext: vi.fn(),
  requirePermission: vi.fn(),
  logAudit: vi.fn(),
  readCredentials: vi.fn(),
  listCampaigns: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ db }));
vi.mock('@/lib/geo-context', () => ({ requireContext: (...a: unknown[]) => requireContext(...a) }));
vi.mock('@/lib/authorization', () => ({ requirePermission: (...a: unknown[]) => requirePermission(...a) }));
vi.mock('@/lib/audit', () => ({ logAudit: (...a: unknown[]) => logAudit(...a) }));
vi.mock('@/lib/ads', () => ({
  readCredentials: (...a: unknown[]) => readCredentials(...a),
  adapterFor: () => ({ listCampaigns: (...a: unknown[]) => listCampaigns(...a), explainError: (e: unknown) => String(e) }),
}));

import { DELETE, GET, PATCH } from './route';

const ctx = { params: Promise.resolve({ id: 'acc-1' }) };
const url = 'http://localhost/api/settings/ad-accounts/acc-1';
const patch = (body: unknown) => PATCH(new Request(url, { method: 'PATCH', body: JSON.stringify(body) }), ctx);

const CONNECTED = {
  id: 'acc-1', platform: 'META', accountId: 'act_1234567890', accountName: 'حساب ميتا',
  status: 'CONNECTED', tokenEncrypted: 'enc-blob', _count: { campaigns: 3 },
};
const MANUAL = { ...CONNECTED, accountId: 'manual-1a2b3c4d', accountName: 'يدوي', status: 'MANUAL', tokenEncrypted: null, _count: { campaigns: 2 } };

beforeEach(() => {
  vi.resetAllMocks();
  requireContext.mockResolvedValue({ user: { id: 'u1' }, companyId: 'co-1', storeId: 'st-1' });
  requirePermission.mockResolvedValue(undefined);
  db.adAccount.findFirst.mockResolvedValue(CONNECTED);
  // The two writes go through ONE transaction; the mock just settles what it is given.
  db.$transaction.mockImplementation(async (ops: unknown[]) => Promise.all(ops));
  readCredentials.mockReturnValue({ token: 't' });
  listCampaigns.mockResolvedValue([]);
});

describe('switching a connected account to manual', () => {
  it('— deletes the token and says MANUAL, in one row, in the shop it belongs to', async () => {
    const res = await patch({ mode: 'MANUAL' });
    expect(res.status).toBe(200);
    expect(db.adAccount.findFirst.mock.calls[0][0].where).toMatchObject({ id: 'acc-1', companyId: 'co-1' });
    expect(db.adAccount.update).toHaveBeenCalledTimes(1);
    expect(db.adAccount.update.mock.calls[0][0]).toEqual({
      where: { id: 'acc-1' },
      data: { tokenEncrypted: null, tokenHint: null, status: 'MANUAL', lastError: null },
    });
  });

  it('and the campaigns STAY in the account but stop waiting for a sync that cannot come', async () => {
    await patch({ mode: 'MANUAL' });
    expect(db.campaign.updateMany).toHaveBeenCalledTimes(1);
    expect(db.campaign.updateMany.mock.calls[0][0]).toEqual({
      where: { adAccountId: 'acc-1' },
      // Not `adAccountId: null` — they are still in this account. And no `spend`
      // key at all: what was pulled was real money, and it is left alone.
      data: { externalId: null, spendSource: 'MANUAL' },
    });
    expect(Object.keys(db.campaign.updateMany.mock.calls[0][0].data)).not.toContain('spend');
  });

  it('and both writes are one transaction, so a failure cannot leave half of a switch', async () => {
    await patch({ mode: 'MANUAL' });
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(db.$transaction.mock.calls[0][0]).toHaveLength(2);
  });

  it('and says what happened, with the number of campaigns', async () => {
    const json = await (await patch({ mode: 'MANUAL' })).json();
    expect(json).toMatchObject({ success: true, changed: true, campaigns: 3 });
    expect(json.message).toContain('3 حملة');
    expect(json.message).toContain('مصروف حقيقي');
  });

  it('and its audit entry names the account and what it was — never the token', async () => {
    await patch({ mode: 'MANUAL' });
    expect(logAudit.mock.calls[0][0]).toMatchObject({
      companyId: 'co-1',
      userId: 'u1',
      action: 'AD_ACCOUNT_SWITCHED_TO_MANUAL',
      entity: 'AdAccount',
      entityId: 'acc-1',
      previousData: { accountId: 'act_1234567890', accountName: 'حساب ميتا', status: 'CONNECTED' },
      newData: { status: 'MANUAL', campaigns: 3 },
    });
    expect(JSON.stringify(logAudit.mock.calls)).not.toContain('enc-blob');
  });

  it('and doing it twice is not an error and changes nothing the second time', async () => {
    db.adAccount.findFirst.mockResolvedValue(MANUAL);
    const res = await patch({ mode: 'MANUAL' });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ success: true, changed: false });
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(db.adAccount.update).not.toHaveBeenCalled();
    expect(logAudit).not.toHaveBeenCalled();
  });

  it.each([
    ['another mode', { mode: 'AUTO' }],
    ['no mode', {}],
    ['no body', null],
  ])('and refuses %s, writing nothing', async (_n, body) => {
    const res = await patch(body);
    expect(res.status).toBe(400);
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('and refuses an account of another shop (the lookup is scoped, so it is simply not found)', async () => {
    db.adAccount.findFirst.mockResolvedValue(null);
    const res = await patch({ mode: 'MANUAL' });
    expect(res.status).toBe(404);
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('and is for those who manage settings', async () => {
    requirePermission.mockRejectedValue(new Error('forbidden'));
    const res = await patch({ mode: 'MANUAL' });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(requirePermission).toHaveBeenCalledWith('settings.manage');
    expect(db.$transaction).not.toHaveBeenCalled();
  });
});

describe('listing a platform’s campaigns', () => {
  const get = () => GET(new Request(url), ctx);

  it('— refuses a manual account before anything is decrypted or asked', async () => {
    db.adAccount.findFirst.mockResolvedValue(MANUAL);
    const res = await get();
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('حساب يدوي');
    expect(readCredentials, 'فكّ رمز حساب يدوي').not.toHaveBeenCalled();
    expect(listCampaigns).not.toHaveBeenCalled();
    expect(db.adAccount.update, 'ما لازم يتحوّل إلى ERROR').not.toHaveBeenCalled();
  });

  it('and still lists a connected one, with its token', async () => {
    const res = await get();
    expect(res.status).toBe(200);
    expect(readCredentials).toHaveBeenCalledWith('enc-blob');
    expect(listCampaigns).toHaveBeenCalledWith({ token: 't' }, 'act_1234567890');
  });
});

describe('removing an account', () => {
  const remove = () => DELETE(new Request(url, { method: 'DELETE' }), ctx);

  it('— says «فُصل» for a connected one and «حُذف» for a manual one, and keeps the campaigns either way', async () => {
    const connected = await (await remove()).json();
    expect(connected.message).toContain('فُصل');
    expect(connected.unlinked).toBe(3);

    db.adAccount.findFirst.mockResolvedValue(MANUAL);
    const manual = await (await remove()).json();
    expect(manual.message).toContain('حُذف');
    expect(manual.message, 'حساب يدوي ما انربط حتى يُفصل').not.toContain('فُصل');
    expect(manual.unlinked).toBe(2);
    // The campaigns are un-filed, not deleted, in both cases.
    for (const [arg] of db.campaign.updateMany.mock.calls) {
      expect(arg.data).toEqual({ adAccountId: null, externalId: null, spendSource: 'MANUAL' });
    }
    expect(db.adAccount.delete).toHaveBeenCalledTimes(2);
  });

  it('and records which kind it was in the audit entry', async () => {
    db.adAccount.findFirst.mockResolvedValue(MANUAL);
    await remove();
    expect(logAudit.mock.calls[0][0]).toMatchObject({
      action: 'AD_ACCOUNT_DISCONNECTED',
      previousData: { accountId: 'manual-1a2b3c4d', status: 'MANUAL' },
    });
  });
});
