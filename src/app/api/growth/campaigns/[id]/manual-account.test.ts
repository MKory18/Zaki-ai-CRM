import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * FILING A CAMPAIGN UNDER A MANUAL AD ACCOUNT.
 *
 * «ادخال يدوي بالكامل». The link endpoint has always been two things in one:
 * with a remote id it is a SYNC link (the spend now comes from the platform),
 * without one it is just which account the campaign is filed under. A manual
 * account is only ever the second kind — there is no platform behind it for
 * a remote id to point into — and it takes only campaigns of its own
 * platform, because a TikTok campaign filed under a Meta account would put
 * one platform's spend in the other's column.
 *
 * And the first kind must not change at all: a connected account's link is
 * still the loose, existing behaviour. Both halves are asserted, because
 * tightening the connected one would be a regression nobody asked for.
 */

const { db, requireContext, requirePermission, logAudit } = vi.hoisted(() => ({
  db: {
    campaign: { findFirst: vi.fn(), update: vi.fn() },
    adAccount: { findFirst: vi.fn() },
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

const ctx = { params: Promise.resolve({ id: 'c-1' }) };
const link = (body: unknown) =>
  PATCH(new Request('http://localhost/api/growth/campaigns/c-1', { method: 'PATCH', body: JSON.stringify(body) }), ctx);

const CAMPAIGN = { id: 'c-1', name: 'حملة', platform: 'TIKTOK', status: 'ACTIVE', spend: 100, code: 'ABC123', landingPageId: null, productId: null };
const MANUAL_TIKTOK = { id: '11111111-1111-4111-8111-111111111111', status: 'MANUAL', platform: 'TIKTOK' };
const MANUAL_META = { id: '22222222-2222-4222-8222-222222222222', status: 'MANUAL', platform: 'META' };
const CONNECTED_META = { id: '33333333-3333-4333-8333-333333333333', status: 'CONNECTED', platform: 'META' };

const written = () => db.campaign.update.mock.calls[0][0].data as Record<string, unknown>;

beforeEach(() => {
  vi.resetAllMocks();
  requireContext.mockResolvedValue({ user: { id: 'u1' }, companyId: 'co-1', storeId: 'st-1' });
  requirePermission.mockResolvedValue(undefined);
  db.campaign.findFirst.mockResolvedValue(CAMPAIGN);
  db.campaign.update.mockImplementation(async ({ data }: never) => ({ ...CAMPAIGN, ...(data as object) }));
  db.adAccount.findFirst.mockResolvedValue(MANUAL_TIKTOK);
});

describe('filing a campaign under a manual account', () => {
  it('— files it, keeps the spend in the seller’s hands, and does not wait for a sync', async () => {
    const res = await link({ adAccountId: '11111111-1111-4111-8111-111111111111', externalId: null });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, linked: false });
    expect(written()).toEqual({ adAccountId: '11111111-1111-4111-8111-111111111111', externalId: null, spendSource: 'MANUAL' });
    // No `spend` key: filing a campaign does not touch what was paid.
    expect(Object.keys(written())).not.toContain('spend');
  });

  it('and takes no remote id — there is no platform behind the account for one to point into', async () => {
    const res = await link({ adAccountId: '11111111-1111-4111-8111-111111111111', externalId: '120211234567890' });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('حساب');
    expect(db.campaign.update).not.toHaveBeenCalled();
  });

  it('and takes only campaigns of its own platform', async () => {
    db.adAccount.findFirst.mockResolvedValue(MANUAL_META); // the campaign is TIKTOK
    const res = await link({ adAccountId: '22222222-2222-4222-8222-222222222222', externalId: null });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('منصة');
    expect(db.campaign.update).not.toHaveBeenCalled();
  });

  it('and un-filing it is the same edit with no account', async () => {
    const res = await link({ adAccountId: null, externalId: null });
    expect(res.status).toBe(200);
    expect(written()).toEqual({ adAccountId: null, externalId: null, spendSource: 'MANUAL' });
    // Nothing to look up: there is no account to check.
    expect(db.adAccount.findFirst).not.toHaveBeenCalled();
  });

  it('and the account is looked up in THIS shop, so another shop’s is simply not found', async () => {
    db.adAccount.findFirst.mockResolvedValue(null);
    const res = await link({ adAccountId: '44444444-4444-4444-8444-444444444444', externalId: null });
    expect(res.status).toBe(400);
    expect(db.adAccount.findFirst.mock.calls[0][0].where).toMatchObject({ id: '44444444-4444-4444-8444-444444444444', companyId: 'co-1' });
    expect(db.campaign.update).not.toHaveBeenCalled();
  });
});

describe('a CONNECTED account’s link is exactly what it was', () => {
  it('— with a remote id the spend comes from the platform', async () => {
    db.adAccount.findFirst.mockResolvedValue(CONNECTED_META);
    const res = await link({ adAccountId: '33333333-3333-4333-8333-333333333333', externalId: '120211234567890' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, linked: true });
    expect(written()).toEqual({ adAccountId: '33333333-3333-4333-8333-333333333333', externalId: '120211234567890', spendSource: 'SYNCED' });
  });

  it('and is as loose about the campaign’s platform as it always was', async () => {
    // The campaign is TIKTOK, the account is META. Odd, but it has always been allowed,
    // and tightening it here would change behaviour nobody asked to change.
    db.adAccount.findFirst.mockResolvedValue(CONNECTED_META);
    const res = await link({ adAccountId: '33333333-3333-4333-8333-333333333333', externalId: '120211234567890' });
    expect(res.status).toBe(200);
  });
});
