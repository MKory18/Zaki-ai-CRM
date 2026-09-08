/**
 * SALESFLOW — Unified Authorization Engine (single source of truth)
 *
 * This module is the ONLY place permission checks are implemented.
 * `src/lib/auth.ts` and `src/lib/rbac.ts` re-export from here for
 * backward compatibility — never re-implement checks elsewhere.
 *
 * ─── MODEL ──────────────────────────────────────────────────────────
 * Roles:
 *   SUPER_ADMIN        — platform-wide, everything
 *   COMPANY_ADMIN      — full company scope, everything (see below)
 *   MANAGER            — broad operational oversight, no finance writes
 *   MODERATOR          — order intake, self-scoped
 *   CONFIRMATION_AGENT — confirmation workflow, self-scoped
 *   FOLLOW_UP_AGENT    — follow-up on assigned cases
 *   SETTLEMENT_OFFICER — shipping settlements only
 *   ACCOUNTANT         — finance only, no order status writes
 *   DELIVERY_MANAGER   — shipping/delivery workflow
 *   PENDING_USER       — no permissions (awaiting activation)
 *
 * Tenant isolation flow:
 *   requireCompanyTenant() [auth.ts — session/tenant concern]
 *     → assertOrderAccess() [rbac.ts — order scope + company check]
 *     → authorize() [here — generic resource + permission composition]
 *
 * Resource-level `authorize()` is scaffolding: routes should migrate
 * ad-hoc permission + tenant compositions to it over time. No granular
 * permissions exist yet by design.
 *
 * ─── ADMIN SEMANTICS (documented, do not change silently) ──────────
 * COMPANY_ADMIN is granted EVERYTHING by `can()` — identical to the
 * previous behavior of auth.hasPermission(), which is what live routes
 * enforce. COMPANY_ADMIN's ROLE_PERMISSIONS list is already
 * near-exhaustive, but it is NOT the enforcement source for admins.
 * Do NOT trim the ROLE_PERMISSIONS list to match `can()` — the list
 * still feeds UI matrices, user management, and permissionsForRole().
 *
 * PERMISSION DELTA — permissions granted by unified can() to
 * COMPANY_ADMIN but absent from its ROLE_PERMISSIONS list
 * (previously false under the old rbac.can; now true):
 *   - users.delete
 *   - orders.delete
 *   - orders.view_assigned
 *   - orders.view_own
 *   - customers.view_basic
 * Audit result: none of these are used in any live can() / requirePermission
 * check on its own in a way that changes a business outcome — the only
 * route referencing orders.view_assigned ('/api/orders/shipping') ORs it
 * with orders.view (already granted). No rule change in practice.
 * ────────────────────────────────────────────────────────────────────
 */

import type { Permission, SessionUser } from '@/types/auth';
import { requireAuth } from './auth';

/**
 * The ONLY permission check.
 * Rules (in order):
 *  1. User must be ACTIVE (PENDING/SUSPENDED/DISABLED → deny).
 *  2. SUPER_ADMIN → always allowed.
 *  3. COMPANY_ADMIN → always allowed (see ADMIN SEMANTICS above).
 *  4. Everyone else → their server-derived permission list.
 */
export function can(
  user: SessionUser,
  permission: Permission,
  // Reserved for future scoping (e.g. { companyId } for tenant-bound checks).
  // Intentionally unused today — do not build granular permissions yet.
  _opts?: { companyId?: string }
): boolean {
  if (user.status !== 'ACTIVE') return false;
  if (user.role === 'SUPER_ADMIN' || user.role === 'COMPANY_ADMIN') return true;
  return user.permissions.includes(permission);
}

/**
 * Server-side guard for API routes.
 * Throws 'Unauthorized' / 'ACCOUNT_*' (via requireAuth) or
 * 'Forbidden: missing required permission X' — same messages as before.
 */
export async function requirePermission(permission: Permission): Promise<SessionUser> {
  const user = await requireAuth();
  if (!can(user, permission)) {
    throw new Error(`Forbidden: missing required permission ${permission}`);
  }
  return user;
}

/**
 * Thin, generic resource-level check: composes a permission check with a
 * tenant (companyId) equality check on the resource. Scaffolding for later
 * adoption — no granular permissions, by design.
 *
 * Example: authorize('orders.edit', user, { resource: order, companyId })
 *   → { allowed: false, reason: 'PERMISSION' | 'WRONG_TENANT' }
 */
export function authorize(
  _resource: string,
  user: SessionUser,
  ctx: { permission: Permission; resource: { companyId?: string | null }; companyId: string }
): { allowed: boolean; reason?: 'PERMISSION' | 'WRONG_TENANT' } {
  if (!can(user, ctx.permission)) return { allowed: false, reason: 'PERMISSION' };
  if (ctx.resource?.companyId !== ctx.companyId) return { allowed: false, reason: 'WRONG_TENANT' };
  return { allowed: true };
}
