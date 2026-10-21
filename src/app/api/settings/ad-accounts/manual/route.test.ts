import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * ADDING AN AD ACCOUNT BY HAND — AND WHAT THAT MUST NEVER DO.
 *
 * «اوتوماتيك او ادخال يدوي بالكامل. اريد الخيارين». The connect route is a
 * strict chain: encryption configured, credentials matching the adapter, the
 * platform asked before anything is stored. This one has no secret, so none
 * of that applies — and what it must hold instead is the other side of the
 * same rule: NO token is written, however one arrives; NO platform is called;
 * and an account that is already connected is never quietly replaced by an
 * empty one.
 *
 * These assert what the route WROTE, field by field, not that it said 200.
 */

const { db, requireContext, requirePermission, logAudit } = vi.hoisted(() => ({
  db: { adAccount: { findFirst: vi.fn(), create: vi.fn() } },
  requireContext: vi.fn(),
  requirePermission: vi.fn(),
  logAudit: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ db }));
vi.mock('@/lib/geo-context', () => ({ requireContext: (...a: unknown[]) => requireContext(...a) }));
vi.mock('@/lib/authorization', () => ({ requirePermission: (...a: unknown[]) => requirePermission(...a) }));
vi.mock('@/lib/audit', () => ({ logAudit: (...a: unknown[]) => logAudit(...a) }));

import { POST } from './route';

const post = (body: unknown) =>
  POST(new Request('http://localhost/api/settings/ad-accounts/manual', { method: 'POST', body: JSON.stringify(body) }));

const written = () => db.adAccount.create.mock.calls[0][0].data as Record<string, unknown>;

let fetchSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.resetAllMocks();
  requireContext.mockResolvedValue({ user: { id: 'u1' }, companyId: 'co-1', storeId: 'st-1' });
  requirePermission.mockResolvedValue(undefined);
  db.adAccount.findFirst.mockResolvedValue(null);
  db.adAccount.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: 'acc-new', platform: data.platform, accountId: data.accountId, accountName: data.accountName, status: data.status,
  }));
  // A platform call would be a request to the internet. None may be made.
  fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
    throw new Error('a manual account must not call out');
  });
});
afterEach(() => fetchSpy.mockRestore());

describe('a manual account, as it is stored', () => {
  it('— has no token, no hint, no error, and says MANUAL', async () => {
    const res = await post({ platform: 'META', accountName: '  حساب ميتا الرئيسي  ' });
    expect(res.status).toBe(200);
    const data = written();
    expect(data).toMatchObject({
      companyId: 'co-1',
      storeId: 'st-1',
      platform: 'META',
      accountName: 'حساب ميتا الرئيسي', // trimmed
      createdById: 'u1',
      tokenEncrypted: null,
      tokenHint: null,
      status: 'MANUAL',
      lastError: null,
    });
    // The pairing the database holds: manual ⟺ no token.
    expect((data.status === 'MANUAL') === (data.tokenEncrypted === null)).toBe(true);
  });

  it('and calls no platform, because there is none behind it', async () => {
    await post({ platform: 'TIKTOK', accountName: 'تيك توك', accountId: '7012345678901234567' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('and a token sent anyway is not stored, not audited, not echoed', async () => {
    const SECRET = 'EAAB-THIS-MUST-NEVER-BE-KEPT-0123456789';
    const res = await post({
      platform: 'META',
      accountName: 'حساب',
      credentials: { token: SECRET },
      tokenEncrypted: SECRET,
      token: SECRET,
    });
    expect(res.status).toBe(200);
    expect(JSON.stringify(db.adAccount.create.mock.calls)).not.toContain(SECRET);
    expect(JSON.stringify(logAudit.mock.calls)).not.toContain(SECRET);
    expect(JSON.stringify(await res.json())).not.toContain(SECRET);
    expect(written().tokenEncrypted).toBeNull();
  });

  it('and its audit entry names the account and the person — nothing secret to leave out', async () => {
    await post({ platform: 'META', accountName: 'حساب', accountId: 'act_1234567890' });
    expect(logAudit).toHaveBeenCalledTimes(1);
    expect(logAudit.mock.calls[0][0]).toMatchObject({
      companyId: 'co-1',
      userId: 'u1',
      action: 'AD_ACCOUNT_ADDED_MANUAL',
      entity: 'AdAccount',
      entityId: 'acc-new',
      newData: { platform: 'META', accountId: 'act_1234567890', accountName: 'حساب' },
    });
  });
});

describe('the platform’s own id, which the seller may not have', () => {
  it('— without one, an id is made that says it is made', async () => {
    const res = await post({ platform: 'META', accountName: 'حساب' });
    const json = await res.json();
    expect(written().accountId).toMatch(/^manual-[0-9a-f]{8}$/);
    expect(json.account.accountId).toBe(written().accountId);
  });

  it('and a blank one counts as none, not as an invalid id', async () => {
    const res = await post({ platform: 'META', accountName: 'حساب', accountId: '   ' });
    expect(res.status).toBe(200);
    expect(written().accountId).toMatch(/^manual-/);
  });

  it('and one that is given is normalised the way the connect route does it', async () => {
    await post({ platform: 'META', accountName: 'حساب', accountId: ' 1234567890 ' });
    expect(written().accountId, 'ميتا بتحتاج act_').toBe('act_1234567890');
  });

  it('and one that is not an id is refused, and nothing is written', async () => {
    const res = await post({ platform: 'META', accountName: 'حساب', accountId: 'not an id' });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('غير صالح');
    expect(db.adAccount.create).not.toHaveBeenCalled();
  });
});

describe('what it refuses', () => {
  it.each([
    ['a platform that is not one of the three', { platform: 'GOOGLE', accountName: 'حساب' }],
    ['no name', { platform: 'META' }],
    ['a name of one letter', { platform: 'META', accountName: 'أ' }],
    ['a name that is only spaces', { platform: 'META', accountName: '     ' }],
    ['no body at all', null],
  ])('— %s', async (_name, body) => {
    const res = await post(body);
    expect(res.status).toBe(400);
    expect(db.adAccount.create).not.toHaveBeenCalled();
  });

  it('and with no shop chosen: an ad account belongs to one brand', async () => {
    requireContext.mockResolvedValue({ user: { id: 'u1' }, companyId: 'co-1', storeId: null });
    const res = await post({ platform: 'META', accountName: 'حساب' });
    expect(res.status).toBe(400);
    expect(db.adAccount.create).not.toHaveBeenCalled();
  });

  it('and for someone who may not manage settings', async () => {
    requirePermission.mockRejectedValue(new Error('forbidden'));
    const res = await post({ platform: 'META', accountName: 'حساب' });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(requirePermission).toHaveBeenCalledWith('settings.manage');
    expect(db.adAccount.create).not.toHaveBeenCalled();
  });

  it('and an account that is already there — saying which kind, and never replacing it', async () => {
    db.adAccount.findFirst.mockResolvedValue({ id: 'x', status: 'MANUAL' });
    const again = await post({ platform: 'META', accountName: 'حساب', accountId: 'act_1234567890' });
    expect(again.status).toBe(409);
    const manualMsg = (await again.json()).error;
    expect(manualMsg).toContain('مضاف يدوياً');

    db.adAccount.findFirst.mockResolvedValue({ id: 'y', status: 'CONNECTED' });
    const connected = await post({ platform: 'META', accountName: 'حساب', accountId: 'act_1234567890' });
    expect(connected.status).toBe(409);
    const connectedMsg = (await connected.json()).error;
    expect(connectedMsg, 'رسالتان مختلفتان').not.toBe(manualMsg);
    expect(connectedMsg).toContain('حوّله إلى يدوي');

    // Looked up in THIS shop and THIS platform, by the id that is about to be written.
    expect(db.adAccount.findFirst.mock.calls[0][0].where).toEqual({
      companyId: 'co-1', storeId: 'st-1', platform: 'META', accountId: 'act_1234567890',
    });
    expect(db.adAccount.create).not.toHaveBeenCalled();
  });
});
