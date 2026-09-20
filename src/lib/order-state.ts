/**
 * ORDER STATE — one core state machine over the three stored status fields.
 *
 * The repository stores confirmationStatus, shippingStatus and
 * settlementStatus separately (delivery, settlement and collection must stay
 * three separate fields). The CORE state is DERIVED from them, exactly like
 * the zone: deriving keeps one source of truth instead of a fourth column
 * that can drift.
 *
 * Zone is derived from the state — `getZone(state)` — and is never stored.
 */

export const CORE_STATES = [
  'NEW', 'CLAIMED', 'CONFIRMED', 'PREPARING', 'READY_TO_SHIP', 'SHIPPED',
  'DELIVERED', 'PARTIALLY_DELIVERED', 'WAITING_RETURN',
  'NO_ANSWER', 'POSTPONED', 'IN_TRANSFER', 'RETURNED', 'CANCELLED',
  'NEEDS_REVIEW', 'VOIDED',
] as const;
export type CoreState = (typeof CORE_STATES)[number];

/** Work zones. Derived from the state, never stored (contract invariant 1). */
export type Zone = 'INTAKE' | 'CONFIRMATION' | 'WAREHOUSE' | 'TRANSIT' | 'CLOSED';

const ZONES: Record<CoreState, Zone> = {
  NEW: 'INTAKE',
  NEEDS_REVIEW: 'INTAKE',
  CLAIMED: 'CONFIRMATION',
  NO_ANSWER: 'CONFIRMATION',
  POSTPONED: 'CONFIRMATION',
  CONFIRMED: 'WAREHOUSE',
  PREPARING: 'WAREHOUSE',
  READY_TO_SHIP: 'WAREHOUSE',
  SHIPPED: 'TRANSIT',
  IN_TRANSFER: 'TRANSIT',
  WAITING_RETURN: 'TRANSIT',
  DELIVERED: 'CLOSED',
  PARTIALLY_DELIVERED: 'CLOSED',
  RETURNED: 'CLOSED',
  CANCELLED: 'CLOSED',
  VOIDED: 'CLOSED',
};

export function getZone(state: CoreState): Zone {
  return ZONES[state];
}

/** Shape needed to derive the state — any order row satisfies it. */
export interface StateSource {
  confirmationStatus: string;
  shippingStatus: string;
  claimedById?: string | null;
  shippedAt?: Date | string | null;
}

const SHIPPING_TO_CORE: Record<string, CoreState> = {
  PACKING: 'PREPARING',
  READY_FOR_SHIPPING: 'READY_TO_SHIP',
  READY_FOR_PICKUP: 'READY_TO_SHIP',
  SHIPPED: 'SHIPPED',
  OUT_FOR_DELIVERY: 'SHIPPED',
  DELIVERED: 'DELIVERED',
  FAILED_DELIVERY: 'WAITING_RETURN',
  RETURN_REQUESTED: 'WAITING_RETURN',
  RETURNED: 'RETURNED',
  CANCELLED: 'CANCELLED',
};

const CONFIRMATION_TO_CORE: Record<string, CoreState> = {
  NEW: 'NEW',
  IN_PROGRESS: 'CLAIMED',
  NO_ANSWER: 'NO_ANSWER',
  FOLLOW_UP_REQUIRED: 'NO_ANSWER',
  POSTPONED: 'POSTPONED',
  CONFIRMED: 'CONFIRMED',
  REJECTED: 'CANCELLED',
  CANCELLED: 'CANCELLED',
};

/** The single core state of an order. Shipping wins once it has started. */
export function deriveCoreState(order: StateSource): CoreState {
  const shipping = SHIPPING_TO_CORE[order.shippingStatus];
  if (shipping && order.shippingStatus !== 'NOT_READY' && order.shippingStatus !== 'CANCELLED') {
    return shipping;
  }
  if (order.shippingStatus === 'CANCELLED') return 'CANCELLED';

  const confirmation = CONFIRMATION_TO_CORE[order.confirmationStatus];
  if (confirmation === 'NEW' && order.claimedById) return 'CLAIMED';
  return confirmation ?? 'NEW';
}

/** Age is time in the CURRENT state; created_at is for reporting only. */
export function stateAgeMinutes(enteredAt: Date | string | null | undefined, now: Date = new Date()): number | null {
  if (!enteredAt) return null;
  const entered = new Date(enteredAt).getTime();
  if (Number.isNaN(entered)) return null;
  return Math.max(0, Math.floor((now.getTime() - entered) / 60_000));
}

// ─────────────────────────────────────────────────────
// Guards — every one of them has a negative test
// ─────────────────────────────────────────────────────

export interface GuardResult {
  allowed: boolean;
  /** Stable code for the API response; never a raw message. */
  code?: 'ALREADY_SHIPPED' | 'CANCEL_AFTER_SHIPPED' | 'UNRESERVED_LINES' | 'NOT_CONFIRMED';
  message?: string;
}

const SHIPPED_ONWARDS = new Set([
  'SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'FAILED_DELIVERY', 'RETURN_REQUESTED', 'RETURNED',
]);

/** Has this order ever left the warehouse? (shippedAt is authoritative) */
export function hasEverShipped(order: StateSource): boolean {
  return !!order.shippedAt || SHIPPED_ONWARDS.has(order.shippingStatus);
}

/**
 * Cancellation after SHIPPED is refused — it becomes a cancel request and
 * ends as RETURNED with a reason (contract invariant 4).
 */
export function assertCancellable(order: StateSource): GuardResult {
  if (hasEverShipped(order)) {
    return {
      allowed: false,
      code: 'CANCEL_AFTER_SHIPPED',
      message: 'لا يمكن إلغاء طلب تم شحنه — يُسجَّل كطلب إلغاء وينتهي كمرتجع بسبب',
    };
  }
  return { allowed: true };
}

/** VOID is refused for any order that has ever reached SHIPPED (invariant 9). */
export function assertVoidable(order: StateSource): GuardResult {
  if (hasEverShipped(order)) {
    return { allowed: false, code: 'ALREADY_SHIPPED', message: 'لا يمكن إبطال طلب وصل إلى الشحن' };
  }
  return { allowed: true };
}

export interface LineReservation {
  quantity: number;
  freeQuantity?: number;
  reservedQty: number;
}

/**
 * READY_TO_SHIP requires every line reserved in full, gift units included:
 * one unreserved line blocks the whole order (contract, inventory section).
 */
export function assertReadyToShip(order: StateSource, lines: LineReservation[]): GuardResult {
  if (order.confirmationStatus !== 'CONFIRMED') {
    return { allowed: false, code: 'NOT_CONFIRMED', message: 'الشحن يتطلب طلباً مؤكداً' };
  }
  if (lines.length === 0) {
    return { allowed: false, code: 'UNRESERVED_LINES', message: 'الطلب بلا أسطر — لا يمكن تجهيزه' };
  }
  const short = lines.filter((l) => l.reservedQty < l.quantity + (l.freeQuantity ?? 0));
  if (short.length > 0) {
    return {
      allowed: false,
      code: 'UNRESERVED_LINES',
      message: `لا يمكن التجهيز: ${short.length} سطر غير محجوز بالكامل`,
    };
  }
  return { allowed: true };
}
