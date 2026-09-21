import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * "Undo my edits to this role."
 *
 * The undo has to return to what the role was ISSUED with, which is why the
 * baseline lives in its own table: the rows being edited cannot also be the
 * record of what they started as. Two ways this goes wrong, both silent:
 *
 *   An empty baseline offered as a default wipes the role on save.
 *   A baseline taken before a permission was retired puts a dead key back —
 *   the exact grants the permissions screen was cleaned of.
 */

const { db, requirePermission } = vi.hoisted(() => ({
  db: {
    role: { findUnique: vi.fn() },
    rolePermissionDefault: { findMany: vi.fn() },
  },
  requirePermission: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ db }));
vi.mock('@/lib/authorization', () => ({ requirePermission: (...a: unknown[]) => requirePermission(...a) }));

import { GET } from './[id]/default/route';

const ROLE_ID = '11111111-1111-4111-8111-111111111111';
const params = { params: Promise.resolve({ id: ROLE_ID }) };
const call = () => GET(new Request('http://localhost/x'), params);

beforeEach(() => {
  vi.clearAllMocks();
  requirePermission.mockResolvedValue({ id: 'admin', companyId: 'c1', role: 'COMPANY_ADMIN' });
  db.role.findUnique.mockResolvedValue({ name: 'WAREHOUSE', companyId: null });
  db.rolePermissionDefault.findMany.mockResolvedValue([
    { permission: 'ops.prepare', scope: 'ALL_COMPANY', scopeIds: null },
    { permission: 'inventory.view', scope: 'ALL_COMPANY', scopeIds: null },
  ]);
});

describe('the matrix a role was issued with', () => {
  it('returns the snapshot, not the live rows', async () => {
    const body = await (await call()).json();
    expect(body.available).toBe(true);
    expect(body.permissions.map((p: any) => p.permission)).toEqual(['ops.prepare', 'inventory.view']);
    // The editable rows are never consulted: that is the whole point.
    expect(db.rolePermissionDefault.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { roleId: ROLE_ID } })
    );
  });

  it('keeps the scope the role was issued with, not a wider one', async () => {
    db.rolePermissionDefault.findMany.mockResolvedValue([
      { permission: 'orders.edit', scope: 'ASSIGNED', scopeIds: null },
    ]);
    const body = await (await call()).json();
    expect(body.permissions[0].scope).toBe('ASSIGNED');
  });

  it('drops a permission the catalogue no longer carries', async () => {
    db.rolePermissionDefault.findMany.mockResolvedValue([
      { permission: 'crm.manage', scope: 'ALL_COMPANY', scopeIds: null },
      { permission: 'orders.view', scope: 'ALL_COMPANY', scopeIds: null },
    ]);
    const body = await (await call()).json();
    expect(body.permissions.map((p: any) => p.permission)).toEqual(['orders.view']);
  });

  it('offers nothing when there is no baseline — an empty one would wipe the role', async () => {
    db.rolePermissionDefault.findMany.mockResolvedValue([]);
    const body = await (await call()).json();
    expect(body.available).toBe(false);
    expect(body.permissions).toEqual([]);
  });

  it('offers nothing for SUPER_ADMIN, which holds no matrix at all', async () => {
    db.role.findUnique.mockResolvedValue({ name: 'SUPER_ADMIN', companyId: null });
    const body = await (await call()).json();
    expect(body.available).toBe(false);
  });

  it('does not reach into another company’s role', async () => {
    db.role.findUnique.mockResolvedValue({ name: 'خاص', companyId: 'other-company' });
    const res = await call();
    expect(res.status).toBe(404);
    expect(db.rolePermissionDefault.findMany).not.toHaveBeenCalled();
  });

  it('is read-only — it never writes the permissions back itself', async () => {
    await call();
    // Restoring goes through PATCH so the granter-must-hold guard and the
    // audit entry apply; this endpoint only shows what the undo would do.
    expect((db as any).rolePermission).toBeUndefined();
  });
});
