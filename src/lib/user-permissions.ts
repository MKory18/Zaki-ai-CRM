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
import { ROLE_PERMISSIONS, SessionUser, UserRole } from '../types/auth';
import { getPermissionScope } from './authorization';
import { legacyEffectiveKeys, catalogExtensionKeys } from './permissions-core';

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

export function superAdminOverrideGuard(target: { role: string }): NextResponse | null {
  if (target.role === 'SUPER_ADMIN') {
    return NextResponse.json(
      { error: 'حساب SUPER_ADMIN وصول كامل ولا يقبل الاستثناءات' },
      { status: 400 }
    );
  }
  return null;
}

/**
 * Granter-must-hold rule for ROLE-MATRIX writes (POST /roles, PATCH /roles/:id):
 * the actor may only place a permission into a role if they themselves hold
 * that key, and only at a scope they hold at equal strength or ALL_COMPANY
 * (ALL_COMPANY holders can grant any narrower scope; OWN/ASSIGNED/CATEGORY/
 * SPECIFIC holders can only grant their exact scope). SUPER_ADMIN holds
 * everything by engine precedence and keeps the existing bypass.
 * Returns the Arabic 403 error message, or null when every grant is allowed.
 */
export function granterHoldsAll(
  actor: SessionUser,
  grants: Array<{ permission: string; scope?: string }>
): string | null {
  // Visibility-tier coverage: holding a broader view tier covers its narrower
  // tier (customers.view ⊇ customers.view_basic) — conferring a role that
  // carries the narrower tier to someone when you hold the broader one is a
  // downgrade, not an escalation.
  const COVERAGE: Record<string, string> = { 'customers.view_basic': 'customers.view' };
  for (const g of grants) {
    const requested = g.scope ?? 'ALL_COMPANY';
    let held = getPermissionScope(actor, g.permission);
    if (!held && COVERAGE[g.permission]) {
      held = getPermissionScope(actor, COVERAGE[g.permission]);
    }
    const ok =
      !!held &&
      (held.scope === 'ALL_COMPANY' ||
        (requested !== 'ALL_COMPANY' && held.scope === requested));
    if (!ok) {
      return 'لا يمكنك منح صلاحية لا تملكها بنطاق كامل';
    }
  }
  return null;
}

/**
 * Canonical (permission, scope) grants a role would CONFER onto a user.
 * DB roles resolve from their RolePermission rows; legacy roles (no rows)
 * resolve through the parity mapping (legacyEffectiveKeys + catalogExtensionKeys)
 * at ALL_COMPANY scope. Returns null when the role name is unknown (fail closed).
 */
export async function roleConferralGrants(
  role: { id?: string | null; name: string }
): Promise<Array<{ permission: string; scope: string }> | null> {
  if (role.id) {
    const rows = await db.rolePermission.findMany({
      where: { roleId: role.id },
      select: { permission: true, scope: true },
    });
    return rows.map((r) => ({ permission: r.permission, scope: (r.scope as string) ?? 'ALL_COMPANY' }));
  }
  const legacy = (ROLE_PERMISSIONS as Record<string, string[]>)[role.name];
  if (!legacy) return null;
  if (legacy.length === 0) return []; // PENDING_USER — confers nothing
  const keys = catalogExtensionKeys(new Set(legacyEffectiveKeys(role.name as UserRole)));
  return [...keys]
    .filter((k) => k !== 'dashboard.view')
    .map((permission) => ({ permission, scope: 'ALL_COMPANY' }));
}

/**
 * Conferral policy — the SINGLE gate for granting a role to a user in ANY
 * path (POST /users, PATCH /users/:id roleId + legacy string, role deletion
 * replacement, role duplication). SUPER_ADMIN bypasses (existing precedence).
 * Everything else resolves the role to its canonical effective grants and
 * enforces granter-must-hold — role NAME is never a security authority.
 */
export async function canConferRole(
  actor: SessionUser,
  role: { id?: string | null; name: string }
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  if (actor.role === 'SUPER_ADMIN') return { ok: true };
  const grants = await roleConferralGrants(role);
  if (grants === null) {
    return { ok: false, error: 'الدور غير معروف', status: 400 };
  }
  const err = granterHoldsAll(actor, grants);
  return err ? { ok: false, error: err, status: 403 } : { ok: true };
}
