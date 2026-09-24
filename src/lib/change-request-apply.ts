import type { SessionUser } from '@/types/auth';
import { BEFORE_OPERATIONS, mayDecide } from './change-request-routing';
import { CHANGEABLE_FIELDS, changeFieldLabel, type ChangeValue } from './change-request-fields';

/**
 * APPLYING AN APPROVED CHANGE REQUEST.
 *
 * The missing last step. Once a waybill is printed, or the parcel is in a
 * handed-over batch, the order is SEALED: the address the driver holds and
 * the amount he collects are fixed somewhere we do not control. The seal
 * says so itself — "what was a direct edit becomes a change request:
 * somebody who can still reach the courier decides". Somebody did decide.
 * And then the edit that carried the decision out hit the same seal, and
 * was refused. An approved request on a sealed order could not be applied
 * by anyone.
 *
 * So an approved request is now the one authority that passes the seal —
 * and only as far as it was approved:
 *
 *   The browser sends the request's id and nothing else. The VALUES come
 *   from the approved request, on the server. There is no way to apply a
 *   quantity other than the one that was approved, or to slip a second
 *   field in beside it under the request's authority.
 *
 *   Once. An applied request cannot be applied again.
 *
 *   After confirmation only. Before it the order is still on somebody's
 *   call list and is edited in the ordinary way.
 *
 *   By somebody who could have decided it — the same rule as approving.
 *
 * The edit itself still runs through the order's own route, so quantity,
 * discount and product go through the money path exactly as a direct edit
 * would, and nothing here computes an amount.
 */

/**
 * Change-request fields and the order-edit field each one becomes.
 *
 * Two are missing on purpose, and the refusal names them: the order edit
 * has no city (the governorate — a region — is what it ships to) and no
 * offer. A request for either could be raised and approved but never
 * carried out; saying so is better than applying half of it.
 */
const APPLIES_AS: Partial<Record<(typeof CHANGEABLE_FIELDS)[number], string>> = {
  customerName: 'customerName',
  customerPhone: 'customerPhone',
  customerAltPhone: 'customerAltPhone',
  customerAddress: 'customerAddress',
  customerNotes: 'customerNotes',
  quantity: 'quantity',
  discountAmount: 'discountAmount',
  productId: 'productId',
};

export interface ApplySource {
  id: string;
  orderId: string;
  status: string;
  appliedAt: Date | string | null;
  changes: unknown;
}

export type Expansion =
  | { ok: true; fields: Record<string, ChangeValue> }
  | { ok: false; status: number; code: string; error: string };

/**
 * The order-edit fields an approved request stands for.
 *
 * Checked before anything else is read, so a request that can never be
 * applied is refused with its reason rather than half-way through an edit.
 */
export function expandApproved(request: ApplySource): Expansion {
  if (request.status !== 'APPROVED') {
    return { ok: false, status: 409, code: 'NOT_APPROVED', error: 'طلب التعديل غير معتمَد — لا يُطبَّق إلا بعد الاعتماد' };
  }
  if (request.appliedAt) {
    return { ok: false, status: 409, code: 'ALREADY_APPLIED', error: 'طُبّق هذا التعديل مسبقاً' };
  }

  const changes = (request.changes ?? {}) as Record<string, { to?: ChangeValue } | undefined>;
  const fields: Record<string, ChangeValue> = {};
  const cannot: string[] = [];

  for (const [field, change] of Object.entries(changes)) {
    if (!change || !('to' in change)) continue;
    const target = APPLIES_AS[field as keyof typeof APPLIES_AS];
    if (!target) {
      cannot.push(changeFieldLabel(field));
      continue;
    }
    fields[target] = change.to ?? null;
  }

  if (cannot.length > 0) {
    return {
      ok: false,
      status: 422,
      code: 'NOT_APPLICABLE',
      error: `لا يمكن تطبيق «${cannot.join('، ')}» من هنا — عدّلها يدوياً ثم أغلق الطلب.`,
    };
  }
  if (Object.keys(fields).length === 0) {
    return { ok: false, status: 422, code: 'NOTHING_TO_APPLY', error: 'لا حقول في طلب التعديل لتطبيقها' };
  }
  return { ok: true, fields };
}

/** The keys a request-authorised edit may carry besides the request id. */
const ALLOWED_ALONGSIDE = new Set(['changeRequestId', 'expectedVersion']);

/**
 * Anything in the body beyond the request id is refused.
 *
 * The request's authority passes the seal. Letting another field ride along
 * with it would make "an approved change of quantity" a way to change the
 * address of a parcel that has already left.
 */
export function strayFields(body: Record<string, unknown>): string[] {
  return Object.keys(body).filter((k) => body[k] !== undefined && !ALLOWED_ALONGSIDE.has(k));
}

export type OrderVerdict = { ok: true } | { ok: false; status: number; code: string; error: string };

/** The checks that need the order and the person, once both are loaded. */
export function mayApply(
  user: SessionUser,
  request: { orderId: string },
  order: { id: string; confirmationStatus: string; claimedById: string | null }
): OrderVerdict {
  if (request.orderId !== order.id) {
    return { ok: false, status: 404, code: 'WRONG_ORDER', error: 'طلب التعديل لا يخص هذا الطلب' };
  }
  if (BEFORE_OPERATIONS.includes(order.confirmationStatus)) {
    return {
      ok: false,
      status: 409,
      code: 'NOT_CONFIRMED',
      error: 'الطلب لم يُؤكَّد بعد — عدّله مباشرة من شاشته',
    };
  }
  const routing = mayDecide(user, order);
  if (!routing.allowed) {
    return { ok: false, status: 403, code: 'NOT_THE_DECIDER', error: routing.reason ?? 'لا تملك صلاحية تطبيق هذا التعديل' };
  }
  return { ok: true };
}
