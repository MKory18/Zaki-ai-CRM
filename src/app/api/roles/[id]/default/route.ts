import { NextResponse } from 'next/server';
import { apiErrorResponse } from '@/lib/api-error';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/authorization';
import { ALL_CATALOG_KEYS } from '@/lib/permission-catalog';
import { normalizeRoleName } from '@/lib/role-names';

/**
 * GET /api/roles/:id/default — the matrix this role was issued with.
 *
 * Read-only on purpose: it fills the editor so the admin sees what the undo
 * would do before saving it, and the save goes through PATCH like any other
 * edit — same granter-must-hold guard, same audit entry. A second write path
 * into a role's permissions would be a second place to get that guard wrong.
 *
 * Keys the catalogue no longer carries are dropped on the way out: a snapshot
 * taken before a permission was retired must not put it back.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requirePermission('roles.view');
    const { id } = await params;

    const role = await db.role.findUnique({ where: { id }, select: { name: true, companyId: true } });
    if (!role || (role.companyId !== null && role.companyId !== admin.companyId)) {
      return NextResponse.json({ error: 'الدور غير موجود' }, { status: 404 });
    }

    // SUPER_ADMIN is full-access centrally and holds no matrix to restore.
    if (normalizeRoleName(role.name) === normalizeRoleName('SUPER_ADMIN')) {
      return NextResponse.json({ available: false, permissions: [] });
    }

    const rows = await db.rolePermissionDefault.findMany({
      where: { roleId: id },
      select: { permission: true, scope: true, scopeIds: true },
      orderBy: { permission: 'asc' },
    });
    if (rows.length === 0) {
      // A role created before the snapshot existed and holding nothing then:
      // there is no baseline to offer, and an empty one would wipe the role.
      return NextResponse.json({ available: false, permissions: [] });
    }

    return NextResponse.json({
      available: true,
      permissions: rows.filter((r) => ALL_CATALOG_KEYS.has(r.permission)),
    });
  } catch (error: unknown) {
    return apiErrorResponse(error);
  }
}
