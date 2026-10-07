import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A TYPED ZERO IS A NUMBER SOMEBODY MEANT.
 *
 * This door stored `parseFloat(commissionRate) || 5.0`. Three different
 * requests — an empty box, a non-numeric box, and «this moderator earns no
 * commission» typed as a deliberate **0** — all stored five percent. The
 * 5.0 is written nowhere else: `schema.prisma` says `@default(0.0)`, the
 * `0_init` migration says `DEFAULT 0.0`, and `POST /api/users`, the other
 * door on the same column, validates the rate and writes 0.
 *
 * So these tests are about the VALUES, not about the presence of a guard.
 * Each one names the number that used to be stored.
 */

const { db, requireCompanyTenant, requirePermission, hashPassword, logAudit, commissionByUserForOrders } =
  vi.hoisted(() => ({
    db: { user: { findUnique: vi.fn(), create: vi.fn(), findMany: vi.fn() } },
    requireCompanyTenant: vi.fn(),
    requirePermission: vi.fn(),
    hashPassword: vi.fn(),
    logAudit: vi.fn(),
    commissionByUserForOrders: vi.fn(),
  }));

vi.mock('@/lib/db', () => ({ db }));
vi.mock('@/lib/auth', () => ({
  requireCompanyTenant: (...a: unknown[]) => requireCompanyTenant(...a),
  hashPassword: (...a: unknown[]) => hashPassword(...a),
}));
vi.mock('@/lib/authorization', () => ({ requirePermission: (...a: unknown[]) => requirePermission(...a) }));
vi.mock('@/lib/audit', () => ({ logAudit: (...a: unknown[]) => logAudit(...a) }));
vi.mock('@/lib/commission', () => ({
  commissionByUserForOrders: (...a: unknown[]) => commissionByUserForOrders(...a),
}));

import { POST } from './route';

const sound = {
  name: 'موظفة جديدة',
  email: 'NEW@Example.com',
  password: 'Passw0rdOk',
};

const post = (body: unknown) =>
  POST(
    new Request('http://localhost/api/moderators', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  );

/** The rate as it actually reached the database. */
const written = () => db.user.create.mock.calls[0][0].data.commissionRate;

beforeEach(() => {
  vi.clearAllMocks();
  requireCompanyTenant.mockResolvedValue({ user: { id: 'admin', name: 'مدير' }, companyId: 'c1' });
  requirePermission.mockResolvedValue(undefined);
  hashPassword.mockResolvedValue('hashed');
  db.user.findUnique.mockResolvedValue(null);
  db.user.create.mockResolvedValue({ id: 'u-new', name: sound.name, email: 'new@example.com' });
});

describe('the rate a person typed is the rate that is stored', () => {
  it('stores a deliberate zero as zero — it used to become five percent', async () => {
    const res = await post({ ...sound, commissionRate: 0 });
    expect(res.status).toBe(200);
    expect(db.user.create).toHaveBeenCalledTimes(1);
    expect(written()).toBe(0);
    expect(written()).not.toBe(5);
  });

  it('stores a rate that was typed, unrounded and unreplaced', async () => {
    const res = await post({ ...sound, commissionRate: 7.5 });
    expect(res.status).toBe(200);
    expect(written()).toBe(7.5);
  });

  it('writes the column default when no rate was typed at all', async () => {
    const res = await post(sound);
    expect(res.status).toBe(200);
    expect(written()).toBe(0);
    expect(written()).not.toBe(5);
  });
});

describe('a rate that is not a rate is refused at the door', () => {
  it('refuses a non-numeric rate instead of storing five percent', async () => {
    const res = await post({ ...sound, commissionRate: 'abc' });
    expect(res.status).toBe(400);
    const { error } = await res.json();
    expect(error).toContain('نسبة العمولة');
    expect(db.user.create).not.toHaveBeenCalled();
    // And nothing was spent on a request that was never going to be stored.
    expect(hashPassword).not.toHaveBeenCalled();
    expect(db.user.findUnique).not.toHaveBeenCalled();
  });

  it('refuses an empty box instead of storing five percent', async () => {
    const res = await post({ ...sound, commissionRate: '' });
    expect(res.status).toBe(400);
    expect(db.user.create).not.toHaveBeenCalled();
  });

  it('refuses a rate above the maximum the other door allows', async () => {
    const res = await post({ ...sound, commissionRate: 60 });
    expect(res.status).toBe(400);
    const { error } = await res.json();
    expect(error).toContain('50');
    expect(db.user.create).not.toHaveBeenCalled();
  });

  it('refuses a negative rate', async () => {
    const res = await post({ ...sound, commissionRate: -1 });
    expect(res.status).toBe(400);
    expect(db.user.create).not.toHaveBeenCalled();
  });

  it('refuses a numeric string rather than guessing it was a number', async () => {
    // `/api/users` has always refused `"5"` here, and one column may not have
    // two answers to the same body. Said out loud because it is a BEHAVIOUR
    // change for anything that was posting strings.
    const res = await post({ ...sound, commissionRate: '5' });
    expect(res.status).toBe(400);
    expect(db.user.create).not.toHaveBeenCalled();
  });
});
