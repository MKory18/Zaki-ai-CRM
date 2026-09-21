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
  /** When the waybill was printed — the moment the parcel is committed. */
  labelPrintedAt?: Date | string | null;
}

const SHIPPING_TO_CORE: Record<string, CoreState> = {
  PACKING: 'PREPARING',
  READY_FOR_SHIPPING: 'READY_TO_SHIP',
  READY_FOR_PICKUP: 'READY_TO_SHIP',
  SHIPPED: 'SHIPPED',
  OUT_FOR_DELIVERY: 'SHIPPED',
  DELIVERED: 'DELIVERED',
  // A door where some lines were taken and some refused. Without this line it
  // fell through to the confirmation mapping and read as CONFIRMED — a closed,
  // partly-collected order sitting in the warehouse zone waiting to be packed.
  PARTIALLY_DELIVERED: 'PARTIALLY_DELIVERED',
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
/**
 * A cancellation before the goods ever left, told apart from one after.
 *
 * NOT a new state — the contract keeps the core list closed and this is
 * derived from two columns we already have. But the difference is the whole
 * story of the order: cancelled before shipping costs nothing and the units
 * go straight back on the shelf; cancelled after shipping means a parcel is
 * out there, a courier will be paid, and the stock only returns when it is
 * received back through the returns door.
 *
 * A screen that shows both as "ملغى" is hiding the only part anybody needs.
 */
export function cancelledBeforeShipping(order: StateSource): boolean {
  return deriveCoreState(order) === 'CANCELLED' && !hasEverShipped(order);
}

export function hasEverShipped(order: StateSource): boolean {
  return !!order.shippedAt || SHIPPED_ONWARDS.has(order.shippingStatus);
}

/**
 * Is the parcel still ours to take back off the shelf?
 *
 * `hasEverShipped` starts at SHIPPED, but a parcel is packed, labelled and
 * handed to the courier a stage earlier. In that window the order could be
 * cancelled, its reservation dropped, and the units counted as available
 * again — while they were sitting in a van. Once the waybill is printed the
 * goods are committed: they come back through the returns door, counted,
 * or they do not come back at all.
 */
export function hasLeftWarehouse(order: StateSource): boolean {
  return (
    hasEverShipped(order) ||
    !!order.labelPrintedAt ||
    order.shippingStatus === 'READY_FOR_PICKUP'
  );
}

/**
 * Cancellation after SHIPPED is refused — it becomes a cancel request and
 * ends as RETURNED with a reason (contract invariant 4).
 */
export function assertCancellable(order: StateSource): GuardResult {
  if (hasLeftWarehouse(order)) {
    return {
      allowed: false,
      code: 'CANCEL_AFTER_SHIPPED',
      message:
        'الطرد سُلّم لشركة الشحن وطُبعت بوليصته — يُسجَّل كطلب إلغاء وتعود بضاعته للمخزون عند استلام المرتجع وعدّه',
    };
  }
  return { allowed: true };
}

/** VOID is refused for any order that has ever reached SHIPPED (invariant 9). */
export function assertVoidable(order: StateSource): GuardResult {
  if (hasLeftWarehouse(order)) {
    return { allowed: false, code: 'ALREADY_SHIPPED', message: 'لا يمكن إبطال طلب سُلّم لشركة الشحن' };
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

// ─────────────────────────────────────────────────────
// Filtering by the state the screens actually show
// ─────────────────────────────────────────────────────

/**
 * The stored rows that derive to a given core state.
 *
 * The orders list showed the derived state in one column and filtered on the
 * legacy `status` column, which the API's own comment admits "drifts from
 * confirmation/shipping status" — so picking CONFIRMED could return orders
 * the same screen was labelling SHIPPED, and miss ones it labelled CONFIRMED.
 *
 * This is deriveCoreState() read backwards, and the test holds the two to
 * each other: every row a clause matches must derive to that state, and no
 * row of that state may be missed.
 */
export function whereForState(state: CoreState): Record<string, unknown> | null {
  // Shipping decides once it has started — anything but NOT_READY/CANCELLED.
  const shippingKeys = Object.entries(SHIPPING_TO_CORE)
    .filter(([key, core]) => core === state && key !== 'CANCELLED')
    .map(([key]) => key);

  const confirmationKeys = Object.entries(CONFIRMATION_TO_CORE)
    .filter(([, core]) => core === state)
    .map(([key]) => key);

  // Shipping has not taken over: NOT_READY, or a value the map never knew.
  const shippingIdle = { shippingStatus: { notIn: Object.keys(SHIPPING_TO_CORE) } };

  const branches: Record<string, unknown>[] = [];

  if (shippingKeys.length) branches.push({ shippingStatus: { in: shippingKeys } });

  if (confirmationKeys.length) {
    // NEW splits on ownership: claimed by someone, it is CLAIMED instead.
    if (state === 'NEW') {
      branches.push({ ...shippingIdle, confirmationStatus: 'NEW', claimedById: null });
    } else if (state === 'CLAIMED') {
      branches.push({
        ...shippingIdle,
        OR: [
          { confirmationStatus: 'IN_PROGRESS' },
          { confirmationStatus: 'NEW', claimedById: { not: null } },
        ],
      });
    } else {
      branches.push({ ...shippingIdle, confirmationStatus: { in: confirmationKeys } });
    }
  }

  if (state === 'CANCELLED') {
    // A cancelled shipment is cancelled whatever the confirmation says.
    branches.push({ shippingStatus: 'CANCELLED' });
  }

  if (state === 'NEW') {
    // An unrecognised confirmation value falls back to NEW in the derivation,
    // so it has to fall back to NEW here too or those orders filter to nothing.
    branches.push({
      ...shippingIdle,
      confirmationStatus: { notIn: Object.keys(CONFIRMATION_TO_CORE) },
      claimedById: null,
    });
  }

  if (!branches.length) return null; // a state nothing can currently be in
  return branches.length === 1 ? branches[0] : { OR: branches };
}

/** The core states an order can actually be in today, for a filter dropdown. */
export const FILTERABLE_STATES: CoreState[] = CORE_STATES.filter((s) => whereForState(s) !== null);

export const STATE_LABEL_AR: Record<CoreState, string> = {
  NEW: 'جديد',
  CLAIMED: 'قيد التأكيد',
  CONFIRMED: 'مؤكد',
  PREPARING: 'قيد التجهيز',
  READY_TO_SHIP: 'جاهز للشحن',
  SHIPPED: 'مشحون',
  DELIVERED: 'مسلَّم',
  PARTIALLY_DELIVERED: 'مسلَّم جزئياً',
  WAITING_RETURN: 'بانتظار الإرجاع',
  NO_ANSWER: 'لا يرد',
  POSTPONED: 'مؤجل',
  IN_TRANSFER: 'قيد التحويل',
  RETURNED: 'مرتجع',
  CANCELLED: 'ملغي',
  NEEDS_REVIEW: 'يحتاج مراجعة',
  VOIDED: 'مُبطَل',
};
