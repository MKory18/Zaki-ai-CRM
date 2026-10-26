import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * THE MODERATORS DOOR IS CLOSED, AND WRITES NOTHING.
 *
 * This file used to pin how `POST /api/moderators` read a commission rate —
 * the right rules for a door that should not have been open. It created an
 * ACTIVE moderator on «إنشاء المستخدمين» alone: no check that the creator
 * holds what the role carries, no password-strength check, nobody recorded
 * as having placed the account, and the answer was the whole new row with
 * its password hash. Nothing calls it (the order form only reads the list).
 *
 * REWRITTEN ON PURPOSE: the door now answers 410 with where to go — the
 * people screen, `POST /api/users`, which has all of those checks — and the
 * one thing worth pinning is that it creates nothing, whatever it is sent.
 */

const { db, requireCompanyTenant, hashPassword } = vi.hoisted(() => ({
  db: { user: { findUnique: vi.fn(), create: vi.fn(), findMany: vi.fn() } },
  requireCompanyTenant: vi.fn(),
  hashPassword: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ db }));
vi.mock('@/lib/auth', () => ({
  requireCompanyTenant: (...a: unknown[]) => requireCompanyTenant(...a),
  hashPassword: (...a: unknown[]) => hashPassword(...a),
}));
vi.mock('@/lib/audit', () => ({ logAudit: vi.fn() }));
vi.mock('@/lib/authorization', () => ({ requirePermission: vi.fn(async () => ({})) }));
vi.mock('@/lib/commission', () => ({ commissionByUserForOrders: vi.fn() }));

import { POST } from './route';

beforeEach(() => {
  vi.clearAllMocks();
  requireCompanyTenant.mockResolvedValue({ user: { id: 'admin', role: 'COMPANY_ADMIN', companyId: 'c1' }, companyId: 'c1' });
});

describe('POST /api/moderators', () => {
  it('answers 410 with the way to the people screen', async () => {
    const res = await POST();
    const body = await res.json();
    expect(res.status).toBe(410);
    expect(body.code).toBe('GONE');
    expect(body.errorAr).toContain('المستخدمين');
  });

  it('creates nothing and hashes nothing', async () => {
    await POST();
    expect(db.user.create).not.toHaveBeenCalled();
    expect(hashPassword).not.toHaveBeenCalled();
  });

  it('still asks who is knocking: a stranger gets the sign-in answer, not the 410', async () => {
    requireCompanyTenant.mockRejectedValue(new Error('Unauthorized'));
    expect((await POST()).status).toBe(401);
  });
});
