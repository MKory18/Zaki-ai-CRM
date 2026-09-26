/**
 * SALESFLOW — Phase D2: Shipping & Delivery Workflow Engine
 *
 * All shippingStatus transitions are controlled server-side.
 * Server sets every timestamp (shippedAt, deliveredAt, ...) — never the client.
 */

export const SHIPPING_STATUSES = [
  'NOT_READY', 'READY_FOR_SHIPPING', 'PACKING', 'READY_FOR_PICKUP',
  'SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'PARTIALLY_DELIVERED', 'FAILED_DELIVERY',
  'RETURN_REQUESTED', 'RETURNED', 'CANCELLED',
] as const;
export type ShippingStatus = (typeof SHIPPING_STATUSES)[number];

/**
 * Explicit allowed transitions. Anything not listed is rejected (409).
 * CANCELLED only via SUPER_ADMIN override path with reason.
 */
export const SHIPPING_TRANSITIONS: Record<ShippingStatus, ShippingStatus[]> = {
  NOT_READY: ['READY_FOR_SHIPPING'],
  READY_FOR_SHIPPING: ['PACKING'],
  PACKING: ['READY_FOR_PICKUP'],
  // A parcel can be labelled, handed over, and then cancelled by the
  // customer before it ever moves. Without a way back from here the only
  // route was to mark it SHIPPED and then failed — recording a journey that
  // never happened, and dating the stock movement to it.
  READY_FOR_PICKUP: ['SHIPPED', 'RETURN_REQUESTED'],
  SHIPPED: ['OUT_FOR_DELIVERY'],
  // A partial delivery is reached at the door, like a whole one.
  OUT_FOR_DELIVERY: ['DELIVERED', 'PARTIALLY_DELIVERED', 'FAILED_DELIVERY'],
  FAILED_DELIVERY: ['RETURN_REQUESTED', 'SHIPPED'], // SHIPPED = retry dispatch
  RETURN_REQUESTED: ['RETURNED'],
  RETURNED: [],               // terminal
  DELIVERED: [],              // terminal
  // Terminal too: what was taken is taken, and the refused lines come back
  // through the normal return receiving, not by reopening the order.
  PARTIALLY_DELIVERED: [],
  CANCELLED: [],              // terminal
};

export function isValidShippingTransition(from: string, to: string): boolean {
  const list = SHIPPING_TRANSITIONS[from as ShippingStatus];
  if (!list) return false;
  return list.includes(to as ShippingStatus);
}

/** Timestamp field each shipping status sets (server-controlled) */
export const STATUS_TIMESTAMP: Partial<Record<ShippingStatus, string>> = {
  SHIPPED: 'shippedAt',
  OUT_FOR_DELIVERY: 'outForDeliveryAt',
  DELIVERED: 'deliveredAt',
  // A partial delivery IS a delivery — the customer took part of the parcel
  // and paid for it. Without this it had no deliveredAt, so the courier
  // statement sweep (settlement.ts, which filters on deliveredAt) never saw
  // the money, and the parcel stayed on the courier's debt list for ever.
  PARTIALLY_DELIVERED: 'deliveredAt',
  FAILED_DELIVERY: 'failedAt',
  RETURNED: 'returnedAt',
};

/** Structured delivery-failure reasons */
export const DELIVERY_FAILURE_REASONS = [
  'CUSTOMER_NOT_AVAILABLE', 'PHONE_UNREACHABLE', 'WRONG_ADDRESS',
  'CUSTOMER_REFUSED', 'ADDRESS_NOT_FOUND', 'AREA_NOT_SERVICED',
  'CUSTOMER_REQUESTED_DELAY', 'OTHER',
] as const;

/** Structured return reasons */
export const RETURN_REASONS = [
  'CUSTOMER_REFUSED', 'FAILED_DELIVERY', 'DAMAGED_PRODUCT',
  'WRONG_PRODUCT', 'CUSTOMER_REQUEST', 'OTHER',
] as const;

/**
 * WHAT HAPPENED TO THE PARCEL — and, separately, why.
 *
 * This list used to carry `CUSTOMER_UNAVAILABLE` and `CUSTOMER_REFUSED`
 * beside `FAILED`, while `DELIVERY_FAILURE_REASONS` carried
 * `CUSTOMER_NOT_AVAILABLE` and `CUSTOMER_REFUSED`. Two vocabularies for one
 * event, and two spellings of it — which is precisely how the screen ended
 * up with a translation map that had `CUSTOMER_NOT_AVAILABLE` in it and
 * could not read a row that said `CUSTOMER_UNAVAILABLE`.
 *
 * So a result says what became of the parcel and nothing else. A `FAILED`
 * result carries its reason in `failureReason`, from the eight-value list
 * above, which the endpoint already REQUIRES — so nothing is lost by the
 * result no longer guessing at it.
 *
 * `PARTIALLY_DELIVERED` is new here and was always missing: the domain
 * produces that outcome (`recordPartialDelivery`), the screen already knew
 * the word for it, and the only place it could not be written was the
 * column meant to record it.
 */
export const DELIVERY_ATTEMPT_RESULTS = [
  'DELIVERED', 'PARTIALLY_DELIVERED', 'FAILED', 'RESCHEDULED', 'OTHER',
] as const;
export type DeliveryAttemptResult = (typeof DELIVERY_ATTEMPT_RESULTS)[number];

/**
 * Readable in Arabic — including the two codes no longer offered.
 *
 * `delivery_attempts` measured 0 rows here, so narrowing the writable list
 * costs nothing on this database. But this is a dev database and I cannot
 * see production, so the two retired codes keep their words: an old row
 * must still read as a sentence rather than as an English constant.
 */
export const ATTEMPT_RESULT_AR: Record<string, string> = {
  DELIVERED: 'سُلّم',
  PARTIALLY_DELIVERED: 'سُلّم جزئياً',
  FAILED: 'فشل',
  RESCHEDULED: 'أُعيدت جدولته',
  OTHER: 'أخرى',
  // Retired, still readable.
  CUSTOMER_UNAVAILABLE: 'العميل غير متواجد',
  CUSTOMER_REFUSED: 'العميل رفض الاستلام',
};

/**
 * THE ATTEMPT A STATUS CHANGE IMPLIES, IF ANY.
 *
 * An order does not arrive at DELIVERED by itself — somebody stood at a
 * door. That knock is what `delivery_attempts` is for, and until now only
 * the failures were written there: the table's name said «attempts» and its
 * contents were failures, so «delivered on the first try» was not a
 * measurable thing.
 *
 * RETURNED is deliberately absent. It follows RETURN_REQUESTED and happens
 * at a warehouse, not at a door — a parcel coming back is not a further
 * attempt to hand it over. The door-side refusal is recorded by
 * `recordPartialDelivery`, which knows it was a refusal.
 */
export function attemptForShippingStatus(
  status: string,
  opts: { failureReason?: string | null } = {}
): { result: DeliveryAttemptResult; failureReason: string | null } | null {
  if (status === 'DELIVERED') return { result: 'DELIVERED', failureReason: null };
  if (status === 'PARTIALLY_DELIVERED') return { result: 'PARTIALLY_DELIVERED', failureReason: null };
  if (status === 'FAILED_DELIVERY') return { result: 'FAILED', failureReason: opts.failureReason ?? 'OTHER' };
  return null;
}

/**
 * Confirmation dependency (Section 4): shipping may only start on CONFIRMED orders.
 * Entering READY_FOR_SHIPPING requires confirmationStatus === 'CONFIRMED'.
 */
export function canEnterShipping(confirmationStatus: string): boolean {
  return confirmationStatus === 'CONFIRMED';
}
