import { CORE_STATES, deriveCoreState, type CoreState } from './order-state';
import { deliveryWindowAr, type DeliveryWindow } from './delivery-time';

/**
 * WHERE IS MY ORDER — ASKED BY SOMEBODY WITH NO ACCOUNT.
 *
 * A stranger types a phone number and a reference and is told one thing:
 * how far along the order is. Not the address it is going to, not the name
 * on it, not what was ordered, not what it cost. Whoever guesses a pair
 * learns a status and nothing they could use.
 *
 * THE CUSTOMER'S WORDS ARE NOT THE OPERATOR'S. `STATE_LABEL_AR` is what
 * staff read — «مُبطَل» and «بانتظار الإرجاع» are the operations floor's
 * vocabulary, and a customer reading «مُبطَل» about their own order
 * has been told nothing and alarmed anyway. So there is a second wording
 * here, and it is a PROJECTION of the first rather than a rival to it:
 * every core state must have one, a test says so, and a state added to the
 * system cannot reach a customer unlabelled.
 *
 * AND SEVERAL STATES ARE ONE STEP. «قيد التجهيز» and «جاهز للشحن» are the
 * same fact to the person waiting — the parcel has not left. Collapsing
 * them is not hiding anything; it is refusing to narrate a warehouse to
 * somebody who asked when their parcel arrives.
 */

/** The four things a customer is ever told, in the order they happen. */
export const TRACKING_STEPS = ['received', 'confirmed', 'onTheWay', 'done'] as const;
export type TrackingStep = (typeof TRACKING_STEPS)[number];

export const STEP_LABEL_AR: Record<TrackingStep, string> = {
  received: 'استلمنا الطلب',
  confirmed: 'تم تأكيد الطلب',
  onTheWay: 'الطلب في الطريق',
  done: 'انتهى',
};

/**
 * What the customer is told, for every state the system can be in.
 *
 * `step` is where the progress line stands. `null` is a state with no place
 * on that line — an order that ended somewhere other than a doorstep — and
 * the page shows the sentence without pretending it is progress.
 */
export const CUSTOMER_STATE: Record<CoreState, { ar: string; step: TrackingStep | null }> = {
  NEW: { ar: 'استلمنا طلبك وسنتصل بك للتأكيد', step: 'received' },
  CLAIMED: { ar: 'نحاول الوصول إليك لتأكيد الطلب', step: 'received' },
  NO_ANSWER: { ar: 'اتصلنا ولم نصل إليك — سنحاول ثانية', step: 'received' },
  POSTPONED: { ar: 'الطلب مؤجّل بطلبك', step: 'received' },
  CONFIRMED: { ar: 'تم تأكيد الطلب ويُجهَّز الآن', step: 'confirmed' },
  // One fact to whoever is waiting: the parcel has not left yet.
  PREPARING: { ar: 'تم تأكيد الطلب ويُجهَّز الآن', step: 'confirmed' },
  READY_TO_SHIP: { ar: 'تم تأكيد الطلب ويُجهَّز الآن', step: 'confirmed' },
  SHIPPED: { ar: 'الطلب مع المندوب في الطريق إليك', step: 'onTheWay' },
  DELIVERED: { ar: 'تم التسليم — شكراً لك', step: 'done' },
  PARTIALLY_DELIVERED: { ar: 'تم تسليم جزء من الطلب', step: 'done' },
  WAITING_RETURN: { ar: 'تعذّر التسليم والطلب في طريق العودة', step: null },
  RETURNED: { ar: 'عاد الطلب إلينا', step: null },
  CANCELLED: { ar: 'أُلغي الطلب', step: null },
  // An internal word. True, and useless to alarm somebody with.
  VOIDED: { ar: 'أُلغي الطلب', step: null },
};

/**
 * EVERY FIELD A STRANGER MAY BE HANDED.
 *
 * Written out so a guard can compare it against what the builder actually
 * returns, in both directions. A field added to the payload and forgotten
 * here fails; a field listed here and never sent fails too. That is the
 * whole defence against an address arriving in a tracking response because
 * somebody widened a `select`.
 */
export const TRACKING_FIELDS = [
  'orderNumber',
  'placedAt',
  'state',
  'stateAr',
  'step',
  'stepLabelAr',
  'eta',
  'finished',
] as const;

export interface PublicTracking {
  orderNumber: string;
  /** The day it was placed. A date, never a timestamp with a clock on it. */
  placedAt: string;
  state: CoreState;
  stateAr: string;
  step: TrackingStep | null;
  stepLabelAr: string | null;
  /** «يوصلك خلال ٢–٤ أيام», or null when nothing measured supports one. */
  eta: string | null;
  finished: boolean;
}

/** An order ends at the door, or on the way back from it. */
const FINISHED: readonly CoreState[] = ['DELIVERED', 'PARTIALLY_DELIVERED', 'RETURNED', 'CANCELLED', 'VOIDED'];

export interface TrackableOrder {
  orderNumber: string;
  createdAt: Date;
  shippingStatus: string;
  confirmationStatus: string;
  claimedById: string | null;
}

/**
 * What to tell whoever asked.
 *
 * `window` is this region's measured delivery time, or null. It is passed
 * in rather than read here so this stays pure — and so the caller cannot
 * accidentally quote a window from a different governorate.
 *
 * An ETA is offered only while it is still an answer: once the parcel has
 * arrived or turned back, «يوصلك خلال ٢–٤ أيام» is a sentence about a
 * future that already happened.
 */
export function trackingView(order: TrackableOrder, window: DeliveryWindow | null): PublicTracking {
  const state = deriveCoreState(order);
  const told = CUSTOMER_STATE[state];
  const finished = FINISHED.includes(state);

  return {
    orderNumber: order.orderNumber,
    // The DAY, not the minute: the hour an order was placed is a detail
    // about the customer's evening and it buys the reader nothing.
    placedAt: order.createdAt.toISOString().slice(0, 10),
    state,
    stateAr: told.ar,
    step: told.step,
    stepLabelAr: told.step ? STEP_LABEL_AR[told.step] : null,
    eta: finished ? null : deliveryWindowAr(window),
    finished,
  };
}

/**
 * THE ONE ANSWER FOR EVERY FAILURE.
 *
 * A wrong reference, a wrong phone, a reference from another shop and a
 * reference that never existed all answer this, word for word. Any
 * difference between them — a different sentence, a different status code,
 * a measurably different response time — is a way to ask «does this order
 * exist» one guess at a time.
 */
export const TRACKING_NOT_FOUND = 'لا يوجد طلب بهذا الرقم على هذا الهاتف. تأكّد من الرقمين.';

/**
 * WHAT HAPPENS NEXT — the same sentences on the thank-you page and here.
 *
 * Written once because they are the same promise. A thank-you page that
 * says «سنتصل خلال ساعة» and a tracking page that says «خلال يوم» is one
 * shop contradicting itself between two screens the same customer opens
 * four minutes apart.
 */
export const WHAT_HAPPENS_NEXT_AR: readonly string[] = [
  'سنتصل بك لتأكيد الطلب قبل الشحن.',
  'الدفع عند الاستلام — لا شيء يُدفع الآن.',
  'تقدر تتابع طلبك برقم الطلب ورقم هاتفك.',
];

/** Every state the system has is a state a customer can be told about. */
export function everyStateIsSpoken(): boolean {
  return CORE_STATES.every((s) => Boolean(CUSTOMER_STATE[s]?.ar));
}
