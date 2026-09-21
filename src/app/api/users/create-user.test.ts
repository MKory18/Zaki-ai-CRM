import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Creating an employee.
 *
 * The account and the places it may work are written together: an account
 * created with a role but no country cannot open a screen that needs a
 * context, and one created with a country it should not have is a tenant
 * leak. Both belong to the same transaction and the same guards the
 * geo-access editor uses — creating the account is not a way around them.
 */

const { db, requirePermission, can, hashPassword, resolveSingleCompanyId, canConferRole, geoAccessError, replaceGeoAccess, logAudit } =
  vi.hoisted(() => ({
    db: {
      user: { findUnique: vi.fn(), create: vi.fn() },
      role: { findUnique: vi.fn() },
      $transaction: vi.fn(),
    },
    requirePermission: vi.fn(),
    can: vi.fn(),
    hashPassword: vi.fn(),
    resolveSingleCompanyId: vi.fn(),
    canConferRole: vi.fn(),
    geoAccessError: vi.fn(),
    replaceGeoAccess: vi.fn(),
    logAudit: vi.fn(),
  }));

vi.mock('@/lib/db', () => ({ db }));
vi.mock('@/lib/authorization', () => ({
  requirePermission: (...a: unknown[]) => requirePermission(...a),
  can: (...a: unknown[]) => can(...a),
}));
vi.mock('@/lib/auth', () => ({
  hashPassword: (...a: unknown[]) => hashPassword(...a),
  resolveSingleCompanyId: (...a: unknown[]) => resolveSingleCompanyId(...a),
}));
vi.mock('@/lib/user-permissions', () => ({ canConferRole: (...a: unknown[]) => canConferRole(...a) }));
vi.mock('@/lib/geo-access', () => ({
  geoAccessError: (...a: unknown[]) => geoAccessError(...a),
  replaceGeoAccess: (...a: unknown[]) => replaceGeoAccess(...a),
}));
vi.mock('@/lib/audit', () => ({ logAudit: (...a: unknown[]) => logAudit(...a) }));
vi.mock('@/lib/role-names', () => ({ isPrivilegedRoleName: () => false }));

import { POST } from './route';

const COMPANY = 'c1';
const SYRIA = '22222222-2222-4222-8222-222222222222';
const STORE = '33333333-3333-4333-8333-333333333333';

const sound = {
  name: 'موظف جديد',
  email: 'staff@example.com',
  password: 'Passw0rdOk',
  role: 'MODERATOR',
};

const post = (body: unknown) =>
  POST(new Request('http://localhost/api/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }));

beforeEach(() => {
  vi.clearAllMocks();
  requirePermission.mockResolvedValue({ id: 'admin', name: 'مدير', role: 'COMPANY_ADMIN', companyId: COMPANY });
  can.mockReturnValue(true);
  hashPassword.mockResolvedValue('hashed');
  db.user.findUnique.mockResolvedValue(null);
  db.user.create.mockResolvedValue({ id: 'u-new', name: sound.name, email: sound.email, role: 'MODERATOR', status: 'ACTIVE' });
  db.$transaction.mockImplementation(async (fn: any) => fn(db));
  canConferRole.mockResolvedValue({ ok: true });
  geoAccessError.mockResolvedValue(null);
});

describe('an employee is created with the places he works', () => {
  it('writes the account and its countries and stores in one transaction', async () => {
    const res = await post({ ...sound, countryIds: [SYRIA], storeIds: [STORE] });
    expect(res.status).toBe(200);
    expect(db.$transaction).toHaveBeenCalled();
    expect(replaceGeoAccess).toHaveBeenCalledWith(expect.anything(), 'u-new', [SYRIA], [STORE]);
  });

  it('refuses a country or store the validator rejects, before creating anyone', async () => {
    geoAccessError.mockResolvedValue('كل متجر يجب أن يكون ضمن بلد مُسند للمستخدم');
    const res = await post({ ...sound, countryIds: [SYRIA], storeIds: [STORE] });
    expect(res.status).toBe(400);
    expect(db.user.create).not.toHaveBeenCalled();
  });

  it('refuses to hand out countries to an admin without geo.manage', async () => {
    can.mockImplementation((_u: unknown, key: string) => key !== 'geo.manage');
    const res = await post({ ...sound, countryIds: [SYRIA] });
    expect(res.status).toBe(403);
    expect(db.user.create).not.toHaveBeenCalled();
  });

  it('still creates an account with no geo assignment at all', async () => {
    can.mockImplementation((_u: unknown, key: string) => key !== 'geo.manage');
    const res = await post(sound);
    expect(res.status).toBe(200);
    expect(replaceGeoAccess).toHaveBeenCalledWith(expect.anything(), 'u-new', [], []);
  });

  it('drops a country listed twice rather than writing it twice', async () => {
    await post({ ...sound, countryIds: [SYRIA, SYRIA], storeIds: [STORE, STORE] });
    expect(replaceGeoAccess).toHaveBeenCalledWith(expect.anything(), 'u-new', [SYRIA], [STORE]);
  });

  it('refuses a password too weak to be one', async () => {
    const res = await post({ ...sound, password: 'shortie' });
    expect(res.status).toBe(400);
    expect(db.user.create).not.toHaveBeenCalled();
  });

  it('never lets a non-super-admin create a SUPER_ADMIN', async () => {
    const res = await post({ ...sound, role: 'SUPER_ADMIN' });
    expect(res.status).toBe(403);
    expect(db.user.create).not.toHaveBeenCalled();
  });

  it('refuses a role the actor could not confer', async () => {
    canConferRole.mockResolvedValue({ ok: false, error: 'لا تملك كل صلاحيات هذا الدور', status: 403 });
    const res = await post({ ...sound, role: 'MANAGER' });
    expect(res.status).toBe(403);
    expect(db.user.create).not.toHaveBeenCalled();
  });

  it('records the assignment in the audit entry, not just the account', async () => {
    await post({ ...sound, countryIds: [SYRIA], storeIds: [STORE] });
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'USER_CREATED_BY_ADMIN',
        newData: expect.objectContaining({ countryIds: [SYRIA], storeIds: [STORE] }),
      })
    );
  });

  it('refuses an email already taken', async () => {
    db.user.findUnique.mockResolvedValue({ id: 'someone' });
    const res = await post(sound);
    expect(res.status).toBe(409);
    expect(db.user.create).not.toHaveBeenCalled();
  });
});
