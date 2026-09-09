import { NextResponse } from 'next/server';
import { apiErrorResponse } from '@/lib/api-error';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/authorization';
import { logAudit } from '@/lib/audit';

/**
 * POST /api/roles/:id/duplicate — copy a role (name + ' (نسخة)') with its full
 * permission matrix incl. scopeIds. Requires roles.create. No users are bound.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requirePermission('roles.create');
    const { id } = await params;

    const source = await db.role.findUnique({
      where: { id },
      include: { permissions: true },
    });
    if (!source) {
      return NextResponse.json({ error: 'الدور غير موجود' }, { status: 404 });
    }
    // Company roles may only be duplicated within the same company.
    if (source.companyId !== null && source.companyId !== admin.companyId) {
      return NextResponse.json({ error: 'الدور غير موجود' }, { status: 404 });
    }

    const targetCompanyId = admin.companyId ?? source.companyId;
    let newName = `${source.name} (نسخة)`;
    // Ensure name uniqueness within the tenant.
    let suffix = 2;
    while (await db.role.findFirst({ where: { companyId: targetCompanyId, name: newName }, select: { id: true } })) {
      newName = `${source.name} (نسخة ${suffix++})`;
    }

    const copy = await db.$transaction(async (tx) => {
      return tx.role.create({
        data: {
          companyId: targetCompanyId,
          name: newName,
          isSystem: false,
          permissions: {
            create: source.permissions.map((p) => ({
              permission: p.permission,
              scope: p.scope,
              scopeIds: p.scopeIds ?? undefined,
            })),
          },
        },
        include: { permissions: true },
      });
    });

    await logAudit({
      companyId: targetCompanyId ?? 'platform',
      userId: admin.id,
      action: 'ROLE_DUPLICATED',
      entity: 'Role',
      entityId: copy.id,
      previousData: { sourceRoleId: source.id, sourceName: source.name },
      newData: { name: copy.name, permissionsCount: copy.permissions.length },
    });

    return NextResponse.json({ success: true, role: copy }, { status: 201 });
  } catch (error: unknown) {
    return apiErrorResponse(error);
  }
}
