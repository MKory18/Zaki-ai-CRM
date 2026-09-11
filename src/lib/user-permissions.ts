/**
 * Shared guards for the per-user permission override APIs (Phase 5).
 *
 * Used by /api/users/:id/permissions (GET, PUT) and
 * /api/users/:id/permissions/[permission] (DELETE) so the tenant boundary and
 * privilege-escalation rules stay identical across all three handlers:
 *
 * - Target must exist and belong to the admin's company (404 otherwise).
 *   Only a platform-level SUPER_ADMIN (companyId null) may act on
 *   platform-level accounts — UserPermission overrides on companyId:null
 *   accounts are a SUPER_ADMIN-exclusive operation.
 * - Only SUPER_ADMIN may manage SUPER_ADMIN accounts (403 otherwise).
 *
 * The "SUPER_ADMIN accounts accept no overrides" rule is enforced separately
 * by superAdminOverrideGuard() in the mutating handlers (PUT/DELETE) only —
 * viewing a SUPER_ADMIN's effective permissions is harmless and allowed.
 */
import { NextResponse } from 'next/server';
import { db } from './db';
import { SessionUser } from '../types/auth';

/** Shape of the target user needed by the permission override routes. */
export interface PermissionTargetUser {
  id: string;
  companyId: string | null;
  role: string;
  name: string;
  email: string;
  roleId: string | null;
  permissionsVersion: number;
}

export const PERMISSION_TARGET_SELECT = {
  id: true,
  companyId: true,
  role: true,
  name: true,
  email: true,
  roleId: true,
  permissionsVersion: true,
} as const;

export type PermissionTargetResult =
  | { ok: true; user: PermissionTargetUser }
  | { ok: false; response: NextResponse };

/** Load the target user through the tenant boundary + privilege guards. */
export async function loadPermissionTarget(
  targetId: string,
  admin: SessionUser
): Promise<PermissionTargetResult> {
  const target = await db.user.findUnique({
    where: { id: targetId },
    select: PERMISSION_TARGET_SELECT,
  });
  if (!target) {
    return { ok: false, response: NextResponse.json({ error: 'المستخدم غير موجود' }, { status: 404 }) };
  }

  // ── Multi-tenant isolation (same rule as PATCH /api/users/:id): admins may
  // only act on users inside their own company. Platform-level accounts
  // (companyId null) are manageable ONLY by a platform SUPER_ADMIN — a
  // company admin must never create/edit/delete overrides on them. ──
  const isPlatformSuper = admin.role === 'SUPER_ADMIN' && !admin.companyId;
  if (!isPlatformSuper) {
    const sameCompany = !!admin.companyId && target.companyId === admin.companyId;
    if (!sameCompany) {
      return { ok: false, response: NextResponse.json({ error: 'المستخدم غير موجود' }, { status: 404 }) };
    }
  }

  // ── Privilege-escalation guard: only SUPER_ADMIN manages SUPER_ADMINs ──
  if (target.role === 'SUPER_ADMIN' && admin.role !== 'SUPER_ADMIN') {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'فقط المدير الأعلى يمكنه إدارة حسابات المدراء الأعلى' },
        { status: 403 }
      ),
    };
  }

  return { ok: true, user: target };
}

/**
 * SUPER_ADMIN accounts are full-access by engine precedence (permissions-core)
 * — they never accept overrides. Mutating handlers (PUT/DELETE) must call this.
 */
export function superAdminOverrideGuard(target: { role: string }): NextResponse | null {
  if (target.role === 'SUPER_ADMIN') {
    return NextResponse.json(
      { error: 'حساب SUPER_ADMIN وصول كامل ولا يقبل الاستثناءات' },
      { status: 400 }
    );
  }
  return null;
}
