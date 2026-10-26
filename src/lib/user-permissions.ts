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
import { catalogItem } from './permission-catalog';

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
 * The keys of doing a shift's work, which grant no power over anyone — so
 * they are conferrable without being held (see granterHoldsAll). The
 * per-person exception door applies the same exemption: a supervisor who
 * may hire an agent may also give one agent «سحب الطلب التالي».
 */
export const OPERATIONAL_KEYS: ReadonlySet<string> = new Set([
  'confirmation.pull',   // take the next order from the pool
  'confirmation.work',   // work the orders you are holding
  'confirmation.issues', // flag a problem on one of them
]);

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
  grants: Array<{ permission: string; scope?: string; scopeIds?: unknown }>
): string | null {
  // Visibility-tier coverage: holding a broader view tier covers its narrower
  // tier (customers.view ⊇ customers.view_basic) — conferring a role that
  // carries the narrower tier to someone when you hold the broader one is a
  // downgrade, not an escalation.
  const COVERAGE: Record<string, string> = { 'customers.view_basic': 'customers.view' };

  // ── Hiring somebody is not the same as doing their job ──
  //
  // The rule above is sound for AUTHORITY: you must not hand out a power you
  // do not hold. It was wrong for the keys below, which grant no power over
  // anyone — they are the act of doing a shift's work. A company admin does
  // not work the confirmation queue on purpose (the contract keeps that desk
  // separate), and the result was an outcome nobody would defend: the person
  // who runs the company could create ANOTHER COMPANY ADMIN — a strictly more
  // powerful account — but could not hire a confirmation agent.
  //
  // So these keys are conferrable without holding them. Everything else still
  // obeys the granter-must-hold rule: no key that reaches money, settings,
  // other people's accounts, or a decision over somebody else's work is here.
  for (const g of grants) {
    if (OPERATIONAL_KEYS.has(g.permission)) continue;
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
    /*
     * AND NOT WIDER THAN THE IDS YOU HOLD.
     *
     * A CATEGORY or SPECIFIC grant passed when the scope's NAME matched, so
     * somebody who may edit the products of one category could place «every
     * category» — any ids at all — into a role. Below full scope, the ids
     * asked for must be among the ids held.
     */
    if (held && held.scope !== 'ALL_COMPANY' && (requested === 'CATEGORY' || requested === 'SPECIFIC')) {
      const mine = new Set(idsOf(held.scopeIds));
      if (!idsOf(g.scopeIds).every((id) => mine.has(id))) {
        return 'لا يمكنك منح نطاق أوسع من نطاقك — بعض الأصناف أو المنتجات ليست ضمن صلاحيتك';
      }
    }
  }
  return null;
}

/** The ids of a CATEGORY/SPECIFIC scope, as strings; anything else is none. */
function idsOf(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : [];
}

/**
 * A ROLE'S SCOPE IDS, CHECKED AS THE EXCEPTION DOOR CHECKS THEM.
 *
 * The roles doors stored `scopeIds` as they came: not checked against the
 * company's own categories and products, and a scope a key does not even
 * offer (CATEGORY on a key that knows only ALL and OWN) was written as
 * readily as one it does. The per-person exception door already refused
 * both; the role doors now say the same. Returns the Arabic refusal, or null.
 */
export async function roleScopeRefusal(
  companyId: string | null,
  grants: Array<{ permission: string; scope?: string; scopeIds?: unknown }>
): Promise<string | null> {
  for (const g of grants) {
    const scope = g.scope ?? 'ALL_COMPANY';
    const offered = catalogItem(g.permission)?.scopes;
    if (offered && scope !== 'ALL_COMPANY' && !(offered as readonly string[]).includes(scope)) {
      return `النطاق غير متاح لهذه الصلاحية: ${catalogItem(g.permission)?.ar ?? g.permission}`;
    }
    if (scope !== 'CATEGORY' && scope !== 'SPECIFIC') continue;
    const ids = idsOf(g.scopeIds);
    if (ids.length === 0) continue;
    if (!companyId) return 'نطاق يحتوي موارد من شركة أخرى';
    const found =
      scope === 'CATEGORY'
        ? await db.category.count({ where: { id: { in: ids }, companyId } })
        : await db.product.count({ where: { id: { in: ids }, companyId } });
    if (found !== new Set(ids).size) return 'نطاق يحتوي موارد من شركة أخرى';
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
): Promise<Array<{ permission: string; scope: string; scopeIds?: unknown }> | null> {
  if (role.id) {
    const rows = await db.rolePermission.findMany({
      where: { roleId: role.id },
      select: { permission: true, scope: true, scopeIds: true },
    });
    // The ids travel with the scope, so conferring a role cannot hand out
    // categories or products the person conferring it does not hold.
    return rows.map((r) => ({ permission: r.permission, scope: (r.scope as string) ?? 'ALL_COMPANY', scopeIds: r.scopeIds }));
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

/**
 * The role a user's grants actually come from — the same lookup the engine
 * makes (permissions-core: `roleRows`): their role row when they have one,
 * otherwise the SYSTEM template of that name, otherwise the in-code matrix.
 */
export async function roleRefOf(user: { roleId?: string | null; role: string }): Promise<{ id: string | null; name: string }> {
  if (user.roleId) return { id: user.roleId, name: user.role };
  const system = await db.role.findFirst({ where: { companyId: null, name: user.role }, select: { id: true } });
  return { id: system?.id ?? null, name: user.role };
}

/**
 * MAY THIS PERSON ACT ON THAT ACCOUNT AT ALL.
 *
 * `users.edit` let its holder suspend, disable, re-activate, sign out,
 * delete, re-role or re-permission ANY account in the company; the only one
 * protected was a SUPER_ADMIN. So a manager could suspend the company admin,
 * or DENY them «المالية», and nothing asked whether the manager held the
 * powers they were taking away.
 *
 * The rule is the conferral rule, read the other way: you may act on an
 * account only if you could have given it its role — that is, you hold every
 * key the role carries (the shift-work keys aside). Acting on yourself is
 * governed by each action's own self-guard, not by this.
 */
export async function canActOnUser(
  actor: SessionUser,
  target: { id: string; roleId?: string | null; role: string }
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  if (actor.role === 'SUPER_ADMIN') return { ok: true };
  if (target.id === actor.id) return { ok: true };
  const conferral = await canConferRole(actor, await roleRefOf(target));
  if (conferral.ok) return conferral;
  return {
    ok: false,
    status: 403,
    error: 'لا يمكنك إدارة حساب دوره أوسع من صلاحياتك — هذا لمن يملك كل صلاحيات دوره.',
  };
}

/**
 * REMOVING A «منع» IS GRANTING.
 *
 * A DENY takes a key away from what the role gives; deleting the DENY gives
 * it back. The exception door checked only the ALLOW rows it was writing, so
 * a full replacement that simply left a DENY out — or the single-row delete,
 * which checked nothing — handed the key back without asking whether the
 * person doing it held it. The same granter-must-hold rule as an ALLOW.
 * Returns the Arabic refusal, or null.
 */
export function denyRemovalRefusal(actor: SessionUser, removedDenyKeys: readonly string[]): string | null {
  for (const key of removedDenyKeys) {
    if (OPERATIONAL_KEYS.has(key)) continue;
    const held = getPermissionScope(actor, key);
    if (!held || held.scope !== 'ALL_COMPANY') {
      return 'إزالة «منع» تعني منح الصلاحية من جديد — لا يمكنك منح صلاحية لا تملكها بنطاق كامل';
    }
  }
  return null;
}
