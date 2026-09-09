import { NextResponse } from 'next/server';
import { apiErrorResponse } from '@/lib/api-error';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/authorization';
import { logAudit } from '@/lib/audit';
import { loadPermissionTarget, superAdminOverrideGuard } from '@/lib/user-permissions';

/**
 * DELETE /api/users/:id/permissions/:permission — remove a single override row
 * (users.edit). 404 when no override exists for that permission key.
 * Same tenant boundary + SUPER_ADMIN guards as the collection route.
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; permission: string }> }
) {
  try {
    const { id, permission } = await params;
    const admin = await requirePermission('users.edit');

    const loaded = await loadPermissionTarget(id, admin);
    if (!loaded.ok) return loaded.response;
    const target = loaded.user;

    // SUPER_ADMIN is full-access by engine precedence — no overrides, ever.
    const superBlock = superAdminOverrideGuard(target);
    if (superBlock) return superBlock;

    const existing = await db.userPermission.findUnique({
      where: { userId_permission: { userId: id, permission } },
    });
    if (!existing) {
      return NextResponse.json({ error: 'لا يوجد استثناء لهذه الصلاحية' }, { status: 404 });
    }

    await db.$transaction([
      db.userPermission.delete({
        where: { userId_permission: { userId: id, permission } },
      }),
      // Invalidate cached grants — the target recomputes on their next request.
      db.user.update({ where: { id }, data: { permissionsVersion: { increment: 1 } } }),
    ]);

    await logAudit({
      companyId: target.companyId || admin.companyId || 'platform',
      userId: admin.id,
      action: 'USER_PERMISSION_OVERRIDE_REMOVED',
      entity: 'User',
      entityId: target.id,
      previousData: {
        targetUserId: target.id,
        permission: existing.permission,
        effect: existing.effect,
        scope: existing.scope,
        scopeIds: existing.scopeIds,
      },
      newData: { removedBy: admin.name },
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    return apiErrorResponse(error);
  }
}
