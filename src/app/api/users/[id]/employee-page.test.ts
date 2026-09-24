import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * WHAT THE EMPLOYEE'S PAGE CHANGES.
 *
 * The role changed from the list's modal set only the role's NAME, and
 * permissions resolve by roleId — so the badge said one role and the
 * grants were another's. And the phone, set at creation, had no editor.
 */

const { db, logAudit, canConferRole } = vi.hoisted(() => ({
  db: { user: { findUnique: vi.fn(), update: vi.fn() }, role: { findFirst: vi.fn() } },
  logAudit: vi.fn(),
  canConferRole: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ db }));
vi.mock('@/lib/audit', () => ({ logAudit: (...a: unknown[]) => logAudit(...a) }));
vi.mock('@/lib/auth', () => ({ hashPassword: vi.fn() }));
vi.mock('@/lib/authorization', () => ({
  requirePermission: async () => ({ id: 'admin', name: 'مدير', role: 'COMPANY_ADMIN', companyId: 'c1' }),
}));
vi.mock('@/lib/user-permissions', () => ({ canConferRole: (...a: unknown[]) => canConferRole(...a) }));

import { PATCH } from './route';

const patch = (body: unknown) =>
  PATCH(new Request('http://localhost/x', { method: 'PATCH', body: JSON.stringify(body) }), { params: Promise.resolve({ id: 'u2' }) });

beforeEach(() => {
  vi.clearAllMocks();
  canConferRole.mockResolvedValue({ ok: true });
  db.user.findUnique.mockResolvedValue({
    id: 'u2', name: 'سارة', email: 's@x.com', role: 'CONFIRMATION_AGENT', roleId: 'role-agent',
    status: 'ACTIVE', companyId: 'c1', phone: null, assignedBy: null,
  });
  db.user.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: 'u2', name: 'سارة', email: 's@x.com', role: data.role ?? 'CONFIRMATION_AGENT', status: 'ACTIVE',
  }));
});

describe('changing the role by name', () => {
  it('points roleId at the role of that name, so the grants follow the badge', async () => {
    db.role.findFirst.mockResolvedValue({ id: 'role-supervisor' });
    const res = await patch({ action: 'assignRole', role: 'CONFIRMATION_SUPERVISOR' });
    expect(res.status).toBe(200);
    const data = db.user.update.mock.calls[0][0].data;
    expect(data).toMatchObject({ role: 'CONFIRMATION_SUPERVISOR', roleId: 'role-supervisor' });
    expect(data.permissionsVersion).toEqual({ increment: 1 });
  });

  it('asks the conferral policy about the role row it will point at, not just the name', async () => {
    db.role.findFirst.mockResolvedValue({ id: 'role-supervisor' });
    await patch({ action: 'assignRole', role: 'CONFIRMATION_SUPERVISOR' });
    expect(canConferRole).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'admin' }),
      { id: 'role-supervisor', name: 'CONFIRMATION_SUPERVISOR' }
    );
  });

  it('refuses a role whose grants the admin does not hold — nothing is written', async () => {
    // The company widened its own role of this name beyond the admin.
    db.role.findFirst.mockResolvedValue({ id: 'role-widened' });
    canConferRole.mockResolvedValue({ ok: false, error: 'لا تملك هذه الصلاحيات', status: 403 });
    const res = await patch({ action: 'assignRole', role: 'CONFIRMATION_SUPERVISOR' });
    expect(res.status).toBe(403);
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it('looks only in the admin\'s company and the system roles', async () => {
    db.role.findFirst.mockResolvedValue(null);
    await patch({ action: 'assignRole', role: 'CONFIRMATION_SUPERVISOR' });
    expect(db.role.findFirst.mock.calls[0][0].where.OR).toEqual([{ companyId: 'c1' }, { companyId: null }]);
    // No such role row: roleId is cleared so the name rules, never left pointing at the old role.
    expect(db.user.update.mock.calls[0][0].data.roleId).toBeNull();
  });
});

describe('the phone', () => {
  it('is saved and audited with before and after', async () => {
    const res = await patch({ action: 'updateContact', phone: ' +962 79 123 4567 ' });
    expect(res.status).toBe(200);
    expect(db.user.update.mock.calls[0][0].data).toEqual({ phone: '+962 79 123 4567' });
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({
      action: 'USER_CONTACT_UPDATED',
      previousData: expect.objectContaining({ phone: null }),
      newData: expect.objectContaining({ phone: '+962 79 123 4567' }),
    }));
  });

  it('accepts the digits of an Arabic keyboard, and stores them as 0-9', async () => {
    const res = await patch({ action: 'updateContact', phone: '٠٧٩١٢٣٤٥٦٧' });
    expect(res.status).toBe(200);
    expect(db.user.update.mock.calls[0][0].data).toEqual({ phone: '0791234567' });
  });

  it('is cleared by an empty value', async () => {
    await patch({ action: 'updateContact', phone: '' });
    expect(db.user.update.mock.calls[0][0].data).toEqual({ phone: null });
  });

  it('refuses what is not a phone number', async () => {
    for (const bad of ['abc', '<script>', '12']) {
      expect((await patch({ action: 'updateContact', phone: bad })).status).toBe(400);
    }
    expect(db.user.update).not.toHaveBeenCalled();
  });
});
