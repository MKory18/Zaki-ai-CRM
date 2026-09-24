import type { SessionUser } from '@/types/auth';
import { can } from './authorization';

/**
 * WHO DECIDES A CHANGE REQUEST.
 *
 * It depends on how far the order has travelled, because the only person
 * who can answer "can this still be changed?" is the person currently
 * holding it.
 *
 *   NOT YET CONFIRMED, and somebody has it — the agent holding it decides.
 *   She is on the phone with the customer; a moderator wanting to change a
 *   quantity is asking HER whether it is too late, and routing that to a
 *   supervisor who has never spoken to this customer adds a wait and
 *   subtracts the only informed opinion.
 *
 *   CONFIRMED AND INTO OPERATIONS — the supervisor decides. The order is no
 *   longer on anybody's call list; it is in a batch, or on a van, and the
 *   question is now whether the courier can still be reached. That is not
 *   the agent's authority and never was.
 *
 * A supervisor may decide either way. The agent might be off shift, the
 * request might be urgent, and an escalation path that stops working
 * because one person went home is not a path.
 *
 * Nobody decides their own request. That rule lives in the route and is
 * older than this file; it is named here only so the two are read together.
 */

/** Confirmation is the line: after it, the order belongs to operations. */
export const BEFORE_OPERATIONS = ['NEW', 'IN_PROGRESS', 'NO_ANSWER', 'FOLLOW_UP_REQUIRED', 'POSTPONED'];

export interface RoutingSource {
  confirmationStatus: string;
  /** The agent who pulled it from the pool, if anyone still holds it. */
  claimedById: string | null;
}

export type Decider =
  /** The agent holding the order, plus any supervisor. */
  | { kind: 'HOLDING_AGENT'; userId: string }
  /** Supervisors only. */
  | { kind: 'SUPERVISOR' };

export function deciderFor(order: RoutingSource): Decider {
  if (BEFORE_OPERATIONS.includes(order.confirmationStatus) && order.claimedById) {
    return { kind: 'HOLDING_AGENT', userId: order.claimedById };
  }
  return { kind: 'SUPERVISOR' };
}

export interface RoutingVerdict {
  allowed: boolean;
  decider: Decider;
  /** Why not, in Arabic, for a refusal somebody can act on. */
  reason?: string;
}

/**
 * The roles that may decide a change request whatever their permissions.
 * Exported so the people TOLD about a request are the people who may
 * decide it — the notification audience reads this same list.
 */
export const SUPERVISOR_ROLES = ['SUPER_ADMIN', 'COMPANY_ADMIN', 'MANAGER', 'CONFIRMATION_SUPERVISOR'] as const;

/** A supervisor by authority, not by job title. */
function isSupervisor(user: SessionUser): boolean {
  return can(user, 'control.change_requests') || (SUPERVISOR_ROLES as readonly string[]).includes(user.role);
}

export function mayDecide(user: SessionUser, order: RoutingSource): RoutingVerdict {
  const decider = deciderFor(order);

  // Always available, so an escalation path never depends on one person
  // being at their desk.
  if (isSupervisor(user)) return { allowed: true, decider };

  if (decider.kind === 'HOLDING_AGENT' && decider.userId === user.id) {
    return { allowed: true, decider };
  }

  return {
    allowed: false,
    decider,
    reason:
      decider.kind === 'HOLDING_AGENT'
        ? 'هذا الطلب بيد موظف التأكيد الذي يعمل عليه — هو أو المشرف يبتّ في التعديل.'
        : 'الطلب دخل مرحلة التشغيل — المشرف وحده يبتّ في التعديل.',
  };
}
