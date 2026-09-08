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
import { can as _can, requirePermission as _requirePermission } from './authorization';
export const can: (user: SessionUser, permission: Permission) => boolean = _can;
export const requirePermission: (permission: Permission) => Promise<SessionUser> = _requirePermission;

// ─────────────────────────────────────────────────────
// Permission checks (pure, no DB) — implemented in './authorization'
// ─────────────────────────────────────────────────────

/**
 * Roles that can see ALL orders in their company.
 * Everyone else sees only what is assigned/created by them (DB-level WHERE).
 */
const ORDER_GLOBAL_VIEW_ROLES: UserRole[] = [
  'SUPER_ADMIN',
  'COMPANY_ADMIN',
  'MANAGER',
  'DELIVERY_MANAGER',
  'SETTLEMENT_OFFICER',
  'ACCOUNTANT',
];

/**
 * Roles restricted to their own assigned/claimed orders.
 * These map to `assignedToId` / `claimedById` / `currentOwnerId` filters.
 */
const ORDER_SELF_SCOPED_ROLES: UserRole[] = ['CONFIRMATION_AGENT', 'FOLLOW_UP_AGENT', 'MODERATOR'];

// ─────────────────────────────────────────────────────
// Permission checks (pure, no DB)
// ─────────────────────────────────────────────────────

/**
 * Resolve the effective WHERE clause for order visibility per role.
 * MUST be used by every order-listing query — never filter in the frontend.
 *
 * Model (Step 2):
 *  - Global-view roles: company scope only (applied by caller).
 *  - Self-scoped roles: own orders + CLAIMABLE QUEUE (unclaimed orders
 *    eligible for their workflow stage) — never another employee's private orders.
 */
export function orderVisibilityWhere(user: SessionUser): Record<string, unknown> {
  // SUPER_ADMIN / global-view roles: no extra restriction (company scope applied by caller)
  if (ORDER_GLOBAL_VIEW_ROLES.includes(user.role)) return {};

  // Self-scoped roles: own orders + unclaimed queue items they may claim
  if (ORDER_SELF_SCOPED_ROLES.includes(user.role)) {
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

  // Unknown/default: deny all orders
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
      // Unclaimed + workflow-intake eligible; scoped by role visibility
      const scope = orderVisibilityWhere(user);
      const claimable = {
        claimedById: null,
        signatureStatus: 'UNSIGNED',
      };
      if (ORDER_GLOBAL_VIEW_ROLES.includes(user.role)) {
        return { ...where, AND: [...(where.AND ?? []), claimable] };
      }
      if (ORDER_SELF_SCOPED_ROLES.includes(user.role)) {
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
      // Only global-view roles may use this queue
      if (!ORDER_GLOBAL_VIEW_ROLES.includes(user.role)) {
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

/** Does this role see all orders company-wide (vs. only their own)? */
export function hasGlobalOrderView(user: SessionUser): boolean {
  return ORDER_GLOBAL_VIEW_ROLES.includes(user.role);
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

  // Self-scoped roles: must be related to the user (DB-backed ownership check)
  if (ORDER_SELF_SCOPED_ROLES.includes(user.role)) {
    const mine =
      order.assignedToId === user.id ||
      order.claimedById === user.id ||
      order.currentOwnerId === user.id ||
      order.moderatorId === user.id;
    if (!mine) return { allowed: false, reason: 'NOT_ASSIGNED' };
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
