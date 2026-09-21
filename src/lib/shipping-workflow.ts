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

/** Delivery attempt results */
export const DELIVERY_ATTEMPT_RESULTS = [
  'DELIVERED', 'FAILED', 'CUSTOMER_UNAVAILABLE', 'CUSTOMER_REFUSED', 'RESCHEDULED', 'OTHER',
] as const;

/**
 * Confirmation dependency (Section 4): shipping may only start on CONFIRMED orders.
 * Entering READY_FOR_SHIPPING requires confirmationStatus === 'CONFIRMED'.
 */
export function canEnterShipping(confirmationStatus: string): boolean {
  return confirmationStatus === 'CONFIRMED';
}
