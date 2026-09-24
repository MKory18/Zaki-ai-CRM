/**
 * AN EDIT MADE ON COMPANY-WIDE AUTHORITY SAYS WHY.
 *
 * Two doors lead into an order that is not yours to work.
 *
 * One is the change request: somebody asks, somebody with the reach decides,
 * and the request carries its own reason and its own decision note. That
 * door already writes why into the audit.
 *
 * The other is a direct edit by whoever holds orders.edit company-wide — the
 * owner on an order of his own, the super admin on anybody's. It is the door
 * that exists precisely so a real business is not stuck behind its own
 * process, and until now it recorded WHO changed WHAT and never WHY. A
 * month later the audit says the owner raised a discount by 40 and no
 * living person can say what the customer had said on the phone.
 *
 * So: an edit whose authority is company-wide, not carried by an approved
 * request, that moves money, the customer's identity, where the parcel goes
 * or what state the order is in, must state a reason. The reason is stored
 * with the audit entry and on the order's own timeline.
 *
 * What is deliberately NOT covered: an agent working an order assigned to
 * her, a moderator correcting the order he just entered (their scope is
 * ASSIGNED or OWN, never ALL_COMPANY), and an internal note by anyone. A
 * reason asked for everything is a reason nobody reads.
 *
 * Pure and client-safe: the edit screen asks the same question this module
 * answers, so the seller is asked before the save rather than refused after.
 */

/** The fields whose change is substantive enough to be worth a why. */
export const REASON_FIELDS = [
  // Money
  'sellingPrice', 'quantity', 'discountAmount', 'shippingCost', 'items',
  // What is being sold
  'productId',
  // Who it is for, and where it goes
  'customerName', 'customerPhone', 'customerAltPhone', 'customerAddress', 'regionId',
  // Where it stands
  'status', 'confirmationStatus', 'shippingStatus',
] as const;

export type ReasonField = (typeof REASON_FIELDS)[number];

const REASON_FIELD_SET: ReadonlySet<string> = new Set(REASON_FIELDS);

export const MIN_REASON = 5;
export const MAX_REASON = 300;

/** Which of the submitted fields are the substantive ones. */
export function substantiveFields(fields: readonly string[]): string[] {
  return fields.filter((f) => REASON_FIELD_SET.has(f));
}

export interface ReasonCheck {
  /** True when the actor's orders.edit grant reaches the whole company. */
  companyWideAuthority: boolean;
  /** True when an approved change request is carrying this edit. */
  viaChangeRequest: boolean;
  /** The field names this request actually changes. */
  changedFields: readonly string[];
}

/**
 * Whether this edit must carry a reason.
 *
 * Note the order of the tests: a change request is exempt even when the
 * actor is the owner, because the request's own reason is already in the
 * audit and asking twice would only produce "as approved".
 */
export function needsReason(check: ReasonCheck): boolean {
  if (check.viaChangeRequest) return false;
  if (!check.companyWideAuthority) return false;
  return substantiveFields(check.changedFields).length > 0;
}

export const REASON_REQUIRED_AR =
  'هذا تعديل بصلاحية على مستوى الشركة — اكتب سبب التعديل ليُحفظ في سجل التدقيق.';

export const REASON_TOO_SHORT_AR = `سبب التعديل قصير — اكتب ${MIN_REASON} أحرف على الأقل.`;

/**
 * Validate a submitted reason for an edit that needs one.
 * Returns null when the edit may proceed, or the Arabic refusal.
 */
export function reasonRefusal(check: ReasonCheck, reason: string | undefined | null): string | null {
  if (!needsReason(check)) return null;
  const trimmed = (reason ?? '').trim();
  if (!trimmed) return REASON_REQUIRED_AR;
  if (trimmed.length < MIN_REASON) return REASON_TOO_SHORT_AR;
  return null;
}
