/**
 * SALESFLOW — Centralized Server-Side RBAC Engine
 *
 * Every protected API must authorize through this module.
 * Frontend permission checks are UX only — never security.
 *
 * Enforcement chain for sensitive operations:
 *   authenticate → company tenant → role → permission
 *   → order scope (assignment) → lock ownership → version
 */

import { db } from './db';
import type { Permission, SessionUser, UserRole } from '@/types/auth';
import { ROLE_PERMISSIONS } from '@/types/auth';

/**
 * Permission checks live in './authorization' (single source of truth).
 * Re-exported here for backward compatibility — do not re-implement.
 */
import { can as _can, requirePermission as _requirePermission, getPermissionScope } from './authorization';
export const can: (user: SessionUser, permission: Permission) => boolean = _can;
export const requirePermission: (permission: Permission) => Promise<SessionUser> = _requirePermission;

// ─────────────────────────────────────────────────────
// Permission checks (pure, no DB) — implemented in './authorization'
// ─────────────────────────────────────────────────────

/**
 * Order visibility — driven by the Permission Engine scope of `orders.view`:
 *   ALL_COMPANY → all company orders (SHARED COMPANY VISIBILITY default)
 *   ASSIGNED    → assigned/claimed/owned + claimable queue (agents)
 *   OWN         → orders the user entered (moderatorId)
 *   none        → no orders
 * `companyId` remains the tenant boundary (applied by the caller).
 */
export function orderVisibilityWhere(user: SessionUser): Record<string, unknown> {
  const scope = getPermissionScope(user, 'orders.view');
  if (!scope) return { id: '__no_access__' };

  if (scope.scope === 'ALL_COMPANY') return {};

  if (scope.scope === 'ASSIGNED') {
    return {
      OR: [
        // 1. Assigned specifically to me
        { assignedToId: user.id },
        { claimedById: user.id },
        { currentOwnerId: user.id },
        // Orders I entered as a moderator (legacy compat)
        { moderatorId: user.id },
        // ─── Claimable queue: unclaimed orders in the workflow intake stage ───
        {
          claimedById: null,
          signatureStatus: 'UNSIGNED',
          confirmationStatus: 'NEW',
          // lock-free only
          OR: [{ lockedById: null }, { lockExpiresAt: null }, { lockExpiresAt: { lte: new Date() } }],
        },
      ],
    };
  }

  if (scope.scope === 'OWN') {
    return { moderatorId: user.id };
  }

  // CATEGORY / SPECIFIC are not meaningful for orders
  return { id: '__no_access__' };
}

/**
 * Explicit queue filters (Step 3). Backend-enforced — the frontend may only
 * REQUEST a queue; the server decides which queues the role may see.
 */
export type OrderQueue = 'available' | 'assigned_to_me' | 'my_orders' | 'processing' | 'all_company';

export function applyQueueFilter(
  user: SessionUser,
  where: Record<string, any>,
  queue: string | null
): Record<string, any> {
  switch (queue) {
    case 'available': {
      // Unclaimed + workflow-intake eligible; scoped by engine visibility
      const claimable = {
        claimedById: null,
        signatureStatus: 'UNSIGNED',
      };
      const scope = getPermissionScope(user, 'orders.view');
      if (scope?.scope === 'ALL_COMPANY') {
        return { ...where, AND: [...(where.AND ?? []), claimable] };
      }
      if (scope?.scope === 'ASSIGNED') {
        return {
          ...where,
          AND: [...(where.AND ?? []), claimable, { confirmationStatus: 'NEW' }],
        };
      }
      return { ...where, id: '__no_access__' };
    }
    case 'assigned_to_me':
      return { ...where, assignedToId: user.id };
    case 'my_orders':
      return { ...where, claimedById: user.id };
    case 'processing':
      return { ...where, currentOwnerId: user.id };
    case 'all_company': {
      // Queue is available to any user with company-wide order visibility
      if (getPermissionScope(user, 'orders.view')?.scope !== 'ALL_COMPANY') {
        return { ...where, id: '__no_access__' };
      }
      return where;
    }
    default: {
      // No explicit queue → apply the role's default visibility envelope.
      // Always merge via AND so an existing search `OR` is never clobbered
      // by the spread of orderVisibilityWhere (which also contains an OR).
      const visibility = orderVisibilityWhere(user);
      if (Object.keys(visibility).length === 0) return where;
      return { AND: [where, visibility] };
    }
  }
}

/** Does this user see all orders company-wide (vs. only their own)? */
export function hasGlobalOrderView(user: SessionUser): boolean {
  return getPermissionScope(user, 'orders.view')?.scope === 'ALL_COMPANY';
}

// ─────────────────────────────────────────────────────
// Order-scoped authorization (DB-verified)
// ─────────────────────────────────────────────────────

export type OrderAccessResult =
  | { allowed: true; order: Record<string, any> }
  | { allowed: false; reason: 'NOT_FOUND' | 'WRONG_COMPANY' | 'NOT_ASSIGNED' };

/**
 * Verify the authenticated user may access this order:
 * 1. Order exists
 * 2. Belongs to the user's company (multi-tenant isolation)
 * 3. Role-specific assignment (agents only see their own)
 */
export async function assertOrderAccess(
  orderId: string,
  user: SessionUser,
  companyId: string,
  permission?: Permission
): Promise<OrderAccessResult> {
  if (permission && !can(user, permission)) {
    throw new Error(`Forbidden: missing required permission ${permission}`);
  }

  const order = await db.order.findUnique({ where: { id: orderId } });
  if (!order) return { allowed: false, reason: 'NOT_FOUND' };
  if (order.companyId !== companyId) return { allowed: false, reason: 'WRONG_COMPANY' };

  // Scope-driven detail access (Permission Engine):
  //   ALL_COMPANY → tenant check alone; ASSIGNED → ownership check;
  //   OWN → creator check; denied scope → NOT_ASSIGNED.
  const viewScope = getPermissionScope(user, 'orders.view');
  if (viewScope?.scope === 'ASSIGNED') {
    const mine =
      order.assignedToId === user.id ||
      order.claimedById === user.id ||
      order.currentOwnerId === user.id ||
      order.moderatorId === user.id;
    if (!mine) return { allowed: false, reason: 'NOT_ASSIGNED' };
  } else if (viewScope?.scope === 'OWN') {
    if (order.moderatorId !== user.id) return { allowed: false, reason: 'NOT_ASSIGNED' };
  } else if (!viewScope) {
    return { allowed: false, reason: 'NOT_ASSIGNED' };
  }

  return { allowed: true, order };
}

// ─────────────────────────────────────────────────────
// Role helpers
// ─────────────────────────────────────────────────────

/** Permissions granted to a role (used by /roles matrix + user management) */
export function permissionsForRole(role: UserRole): Permission[] {
  return ROLE_PERMISSIONS[role] ?? [];
}

/** Default role for new registrations — never administrative */
export const DEFAULT_REGISTRATION_ROLE: UserRole = 'PENDING_USER';

/** Roles with financial authority (for separation-of-duties checks) */
export const FINANCE_HOLDING_ROLES: UserRole[] = [
  'ACCOUNTANT',
  'SUPER_ADMIN',
  'COMPANY_ADMIN',
];

/**
 * System-wide configurable lock settings (Decision 2).
 * Values are defaults; later loaded/overridden from Company.settings
 * by SUPER_ADMIN only via the settings API.
 */
export const LOCK_CONFIG_DEFAULTS = {
  /** Edit-lock TTL in ms */
  lockDurationMs: 5 * 60 * 1000,
  /** Heartbeat renewal interval in ms (client sends; server caps renewals to lockDuration) */
  heartbeatIntervalMs: 45 * 1000,
} as const;

export type LockConfig = typeof LOCK_CONFIG_DEFAULTS;

