import { HEALTH_AR, type HealthTone } from './health';

/**
 * IS THIS CUSTOMER WORTH SHIPPING TO?
 *
 * In a cash-on-delivery business that is not a soft question. Every parcel
 * that goes out and comes back costs the fee out, the fee back, and a
 * fortnight of a product sitting in a van instead of on a shelf. A customer
 * who has taken delivery eight times out of eight and one who has refused
 * four out of five look identical on every screen in this product, and the
 * agent ringing them has no way to tell.
 *
 * NOTHING IS STORED. The score is derived, every time, from the counters
 * the customer row already keeps — `totalOrders`, `deliveredOrders`,
 * `cancelledOrders`, `totalPurchaseValue`, `lastOrderDate`. A stored score
 * is a number that was true in March: it goes stale the moment an order
 * moves, and then two screens disagree about the same person.
 *
 * AND IT IS NOT A CREDIT RATING. It says what this customer has DONE with
 * us. Three orders is not a pattern, and below the floor the answer is
 * «عميل جديد» — said plainly, never dressed as a middling grade, because a
 * reader who cannot tell «average» from «we do not know yet» will act on
 * the first and refuse a good customer their first parcel.
 */

export const CUSTOMER_GRADES = ['loyal', 'good', 'watch', 'risky', 'new'] as const;
export type CustomerGrade = (typeof CUSTOMER_GRADES)[number];

export const GRADE_AR: Record<CustomerGrade, string> = {
  loyal: 'وفيّ',
  good: HEALTH_AR.good,
  watch: 'يحتاج انتباهاً',
  risky: 'مخاطرة',
  new: 'عميل جديد',
};

/** The chip's colour, from the one vocabulary the whole product paints with. */
export const GRADE_TONE: Record<CustomerGrade, HealthTone> = {
  loyal: 'good',
  good: 'good',
  watch: 'ok',
  risky: 'bad',
  new: 'unknown',
};

/** Fewer decided orders than this and no grade is given at all. */
export const MIN_HISTORY = 3;

/** Taken delivery of at least this share, and it is a good record. */
export const GOOD_DELIVERY = 0.7;
/** Below this it is a risk, whatever else is true. */
export const RISKY_DELIVERY = 0.4;
/** This many delivered orders and the customer is more than merely reliable. */
export const LOYAL_ORDERS = 4;
/** No order in this long and «وفيّ» becomes a thing that used to be true. */
export const DORMANT_DAYS = 180;

export interface CustomerHistory {
  totalOrders: number;
  deliveredOrders: number;
  cancelledOrders: number;
  totalPurchaseValue: number;
  lastOrderDate: Date | string | null;
}

export interface CustomerScore {
  grade: CustomerGrade;
  label: string;
  tone: HealthTone;
  /** Why it says that — never left to be inferred from a colour. */
  why: string;
  /** Delivered as a share of decided orders, 0..100, or null below the floor. */
  deliveryRate: number | null;
  /** Days since the last order, or null if they have never ordered. */
  daysQuiet: number | null;
  dormant: boolean;
}

const asDate = (v: Date | string | null): Date | null => {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return isNaN(d.getTime()) ? null : d;
};

/**
 * THE GRADE.
 *
 * `now` is passed rather than read, so the same history always produces the
 * same answer in a test and the boundary cannot shift under a reader
 * mid-render.
 *
 * DECIDED ORDERS, not all orders. An order still being called is not
 * evidence of anything, and counting it as «not delivered» would grade a
 * customer down for our own queue.
 */
export function scoreCustomer(h: CustomerHistory, now: Date): CustomerScore {
  const decided = Math.max(0, (h.deliveredOrders ?? 0) + (h.cancelledOrders ?? 0));
  const last = asDate(h.lastOrderDate);
  const daysQuiet = last ? Math.floor((now.getTime() - last.getTime()) / 86_400_000) : null;
  const dormant = daysQuiet !== null && daysQuiet >= DORMANT_DAYS;

  if (decided < MIN_HISTORY) {
    return {
      grade: 'new',
      label: GRADE_AR.new,
      tone: GRADE_TONE.new,
      why:
        decided === 0
          ? 'لا طلبَ محسوماً بعد — لا شيءَ نحكم عليه.'
          : `${decided} من ${MIN_HISTORY} طلباتٍ محسومة — أقلُّ من أن يكون نمطاً.`,
      deliveryRate: null,
      daysQuiet,
      dormant,
    };
  }

  const rate = h.deliveredOrders / decided;
  const pct = Math.round(rate * 1000) / 10;

  const base = (): { grade: CustomerGrade; why: string } => {
    if (rate < RISKY_DELIVERY) {
      return {
        grade: 'risky',
        why: `استلم ${h.deliveredOrders} من ${decided} — ${pct}%. كلُّ طردٍ يرجع يكلّف أجرتَي ذهابٍ وإياب.`,
      };
    }
    if (rate < GOOD_DELIVERY) {
      return { grade: 'watch', why: `استلم ${h.deliveredOrders} من ${decided} — ${pct}%، ورجع ${h.cancelledOrders}.` };
    }
    if (h.deliveredOrders >= LOYAL_ORDERS) {
      return { grade: 'loyal', why: `استلم ${h.deliveredOrders} من ${decided} — ${pct}%، وبقيمة ${Math.round(h.totalPurchaseValue)}.` };
    }
    return { grade: 'good', why: `استلم ${h.deliveredOrders} من ${decided} — ${pct}%.` };
  };

  const { grade, why } = base();

  /**
   * AND «وفيّ» IS PRESENT TENSE.
   *
   * Somebody who took six parcels and has not ordered since last winter is
   * a customer worth winning back, not a customer worth relying on — and an
   * agent who reads «وفيّ» beside a name nobody has heard from in a year
   * learns not to trust the word.
   */
  if (dormant && (grade === 'loyal' || grade === 'good')) {
    return {
      grade: 'watch',
      label: GRADE_AR.watch,
      tone: GRADE_TONE.watch,
      why: `${why} لكن آخر طلبٍ قبل ${daysQuiet} يوماً.`,
      deliveryRate: pct,
      daysQuiet,
      dormant,
    };
  }

  return { grade, label: GRADE_AR[grade], tone: GRADE_TONE[grade], why, deliveryRate: pct, daysQuiet, dormant };
}

/** The order a list is most useful in: the risk first, the dormant after. */
export const GRADE_RANK: Record<CustomerGrade, number> = {
  risky: 0,
  watch: 1,
  loyal: 2,
  good: 3,
  new: 4,
};
