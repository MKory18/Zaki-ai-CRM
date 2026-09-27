import { REJECTION_REASONS } from './confirmation-workflow';

/**
 * A SECOND CALL, WEEKS LATER, WITH SOMETHING NEW TO SAY.
 *
 * Some orders are lost for a reason that stops being true. «السعر مرتفع» is
 * answered by a lower price. «غيّر رأيه» is answered by time. Three calls
 * that nobody picked up is not a refusal at all — we never reached them.
 *
 * MOST ARE NOT, and calling them anyway is worse than leaving them alone:
 *
 *   a DUPLICATE was never a lost sale — the customer has the goods, and
 *   ringing to offer them again says nobody here reads their own records;
 *
 *   a REFUSAL is an answer. «لا أريد المنتج» is the customer telling us,
 *   and a discount on a thing somebody does not want is a discount on
 *   nothing. Calling back to haggle is how a shop earns a reputation;
 *
 *   BAD DATA reaches nobody. A wrong number, a fake order, an entry error —
 *   there is no person at the other end of a second call either;
 *
 *   OUT OF COVERAGE has not changed. Offering a discount for a place we
 *   still cannot deliver to is a promise we would have to break;
 *
 *   «أخرى» we do not know. A blanket re-approach on the one code that means
 *   «none of these» is a guess, and it would be the largest bucket.
 *
 * AND NEVER AFTER IT SHIPPED. A parcel that went out and came back is a
 * return: it has a courier fee against it, goods that travelled, and a
 * customer who saw the thing and sent it away. That is a different
 * conversation, and it is not this one.
 *
 * Its listing and its offer are both gated on `confirmation.supervise`,
 * because the discount is money and an agent does not set it alone.
 */

/** The three a second call makes sense for, named one by one rather than as a subtraction. */
export const WINBACK_REASONS = ['PRICE_TOO_HIGH', 'CUSTOMER_CHANGED_MIND', 'NO_ANSWER_3_ATTEMPTS'] as const;
export type WinbackReason = (typeof WINBACK_REASONS)[number];

/** And why each of the others is left alone — in the reader's language, on the screen. */
export const NOT_WINBACK_AR: Record<string, string> = {
  CUSTOMER_DOES_NOT_WANT_PRODUCT: 'رفضٌ صريح — الخصم على شيءٍ لا يريده ليس عرضاً',
  DUPLICATE_ORDER: 'مكرَّر — البضاعة عنده أصلاً',
  WRONG_NUMBER: 'بياناتٌ خاطئة — لا أحد على الطرف الآخر',
  FAKE_ORDER: 'بياناتٌ خاطئة — لا أحد على الطرف الآخر',
  MODERATOR_DATA_ERROR: 'بياناتٌ خاطئة — لا أحد على الطرف الآخر',
  OUT_OF_SERVICE_AREA: 'خارج التغطية — ولم يتغيّر شيء',
  OTHER: 'السبب غير محدَّد — لا نعرف ماذا نعرض',
};

/**
 * HOW LONG BEFORE WE ASK AGAIN.
 *
 * Long enough that the call is a new conversation rather than the same one
 * continued after a pause — somebody rung back on Thursday about the Tuesday
 * they said no has been pestered, not won back. Short enough that the
 * customer still remembers the product and the price still stands.
 *
 * Fourteen days, the same shape as `POSTPONE_LEAD_DAYS` and `NO_ANSWER_LIMIT`:
 * one named number with its reason beside it, not a setting nobody will tune.
 */
export const WINBACK_COOLING_DAYS = 14;

/** The most of the price that may be given away to win one back. */
export const WINBACK_MAX_DISCOUNT_SHARE = 0.25;

export interface WinbackSource {
  confirmationStatus: string;
  rejectionReason: string | null;
  /** When it was closed. Null falls back to nothing — an order with no date is not due. */
  rejectedAt: Date | string | null;
  /** Anything non-null means the parcel left; this is a return, not a lost call. */
  shippedAt: Date | string | null;
  /** The replacement it already has. A customer asked twice has answered twice. */
  replacedByOrderNumber: string | null;
  /**
   * The order this one was raised to win back, if it is itself a second
   * chance. Null for an ordinary order.
   */
  replacesOrderNumber: string | null;
  sellingPrice: number;
  discountAmount: number;
}

export type WinbackVerdict =
  | { eligible: true; dueAt: Date; maxDiscount: number }
  | { eligible: false; code: string; reason: string; dueAt?: Date };

const asDate = (v: Date | string | null): Date | null => {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return isNaN(d.getTime()) ? null : d;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * CAN THIS ONE BE ASKED AGAIN, AND FOR HOW MUCH AT MOST?
 *
 * Pure, and it refuses in words rather than with a boolean: the screen lists
 * the ones it turned down beside the ones it did not, so a supervisor reading
 * «مكرَّر — البضاعة عنده أصلاً» learns the rule instead of wondering where an
 * order went.
 */
export function winbackVerdict(order: WinbackSource, now: Date): WinbackVerdict {
  if (order.confirmationStatus !== 'REJECTED') {
    return { eligible: false, code: 'NOT_REJECTED', reason: 'هذا الطلب ليس ملغى' };
  }
  if (asDate(order.shippedAt)) {
    return {
      eligible: false,
      code: 'ALREADY_SHIPPED',
      reason: 'شُحن ثمّ عاد — هذا إرجاع، وله حسابه الخاصّ',
    };
  }
  if (order.replacedByOrderNumber) {
    return {
      eligible: false,
      code: 'ALREADY_OFFERED',
      reason: `عُرض عليه مرّةً بالفعل (${order.replacedByOrderNumber}) — ومن قال لا مرّتين قال لا`,
    };
  }

  /**
   * ONE SECOND CHANCE, NOT A CHAIN OF THEM.
   *
   * The database stops the ORIGINAL order being offered twice —
   * `replacesOrderId` is unique, so it can carry at most one replacement.
   * It says nothing about the replacement itself, and this verdict only
   * looked at «has anybody offered on THIS order», never at «is this order
   * already somebody's second chance».
   *
   * So order A was won back as B; B was rejected; fourteen days later B
   * appeared in the list looking like an ordinary lost sale, was offered a
   * discount, became C — and so on, each round cheaper than the last, to a
   * customer who had now said no three times. The rule this screen exists to
   * apply is «من قال لا مرّتين قال لا», and it was applying it to one order
   * rather than to one customer's answer.
   */
  if (order.replacesOrderNumber) {
    return {
      eligible: false,
      code: 'ALREADY_A_SECOND_CHANCE',
      reason: `هذا نفسه محاولةُ استرجاعٍ لـ${order.replacesOrderNumber} ورُفض — ومن قال لا مرّتين قال لا`,
    };
  }

  const reason = order.rejectionReason;
  if (!reason || !(WINBACK_REASONS as readonly string[]).includes(reason)) {
    return {
      eligible: false,
      code: 'REASON_NOT_WINBACK',
      reason: reason ? (NOT_WINBACK_AR[reason] ?? 'سببُ الإلغاء لا يُعاد عليه') : 'أُلغي بلا سببٍ مُسجَّل',
    };
  }

  const closed = asDate(order.rejectedAt);
  if (!closed) {
    return { eligible: false, code: 'NO_DATE', reason: 'لا تاريخَ لإلغائه — لا يمكن حساب المهلة' };
  }
  const dueAt = new Date(closed.getTime() + WINBACK_COOLING_DAYS * 86_400_000);
  if (now.getTime() < dueAt.getTime()) {
    return {
      eligible: false,
      code: 'COOLING',
      reason: `ما زال في مهلة الـ${WINBACK_COOLING_DAYS} يوماً`,
      dueAt,
    };
  }

  return { eligible: true, dueAt, maxDiscount: maxWinbackDiscount(order) };
}

/**
 * THE CEILING, AND IT COUNTS WHAT WAS ALREADY GIVEN.
 *
 * An order that was rejected at «السعر مرتفع» after five had already come
 * off the price does not get a fresh quarter on top: the discount the
 * customer is offered is the whole of it, not the second helping. Without
 * this an order could be discounted twice over by two people who each
 * thought they were within the rule.
 */
export function maxWinbackDiscount(order: Pick<WinbackSource, 'sellingPrice' | 'discountAmount'>): number {
  const ceiling = (order.sellingPrice || 0) * WINBACK_MAX_DISCOUNT_SHARE;
  return round2(Math.max(0, ceiling - (order.discountAmount || 0)));
}
