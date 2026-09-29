import { DELIVERED_SHIPPING, RETURNED_SHIPPING } from './order-state';

/**
 * WHEN IS AN ORDER FINISHED? — TWO STAGES, AND BOTH HAVE TO LAND.
 *
 * The owner asked it as three questions on one page: «إذا الطلب تم استلام
 * المبلغ ← مغلق؟ كيف ح اخليه مغلق بالمطابقة؟ طيب إذا استلم جزء وجزء رجع…
 * كيف يتم الإغلاق؟ ← الكاش / ← المرتجع». And then ruled it: two stages, the
 * cash on its own and the returned goods on their own — **and the partly
 * delivered order goes through both.**
 *
 * ── WHY IT IS NOT THE ZONE ──
 *
 * `getZone` already puts a delivered order in `CLOSED`, and that is right
 * for what it answers: nobody in operations is working on it any more. It is
 * the wrong answer to this question. A delivered parcel whose money is still
 * in a courier's pocket is not finished — it is the single largest thing a
 * COD shop is owed — and a partly delivered one is not finished twice over:
 * the money for what was kept has not arrived AND the refused units have not
 * been counted back onto the shelf.
 *
 * So closing is its own reading, beside the zone, and neither overrides the
 * other. The zone says where the work is. This says what the business is
 * still waiting for.
 *
 * ── THE TWO STAGES ──
 *
 *   CASH  — applies the moment the door took money: a delivery, whole or
 *           partial. It is DONE only when settlement says SETTLED. Not when
 *           the courier says he collected: `COLLECTED` means the money is in
 *           HIS hands, which is the state this shop has 0 orders in and
 *           thousands of dinars behind.
 *   GOODS — applies the moment something is coming back: a return, a failed
 *           delivery, or the refused half of a partial. It is DONE when the
 *           counting desk has received it — a receipt exists — and not when
 *           a status was typed. «تم إرجاعها» is the courier's word for goods
 *           that may still be on his van.
 *
 * A stage that does not apply is NONE, never DONE. The difference matters:
 * DONE on a stage that never ran would close an order that is still owed
 * money, and this is the one figure a COD shop cannot afford to round up.
 */

export type StageState = 'DONE' | 'PENDING' | 'NONE';

export interface ClosingSource {
  shippingStatus: string;
  settlementStatus: string;
  /** A return receipt exists: somebody counted the goods back in. */
  returnReceived: boolean;
}

export interface ClosingStages {
  cash: StageState;
  goods: StageState;
  /** Both applicable stages done, and the order actually reached a door. */
  closed: boolean;
  /** What it is still waiting for, in words. */
  why: string;
}

/** The one settlement word that means the money reached us. */
export const CASH_DONE = 'SETTLED';

/** Goods are on their way back to us from these. */
export const GOODS_COMING_BACK = [...RETURNED_SHIPPING, 'FAILED_DELIVERY'] as const;

const PARTIAL = 'PARTIALLY_DELIVERED';

/** Nothing is owed and nothing is coming back from these. */
const NO_DOOR = ['CANCELLED'];

export function closingStages(o: ClosingSource): ClosingStages {
  const delivered = (DELIVERED_SHIPPING as readonly string[]).includes(o.shippingStatus);
  const partial = o.shippingStatus === PARTIAL;
  const comingBack = (GOODS_COMING_BACK as readonly string[]).includes(o.shippingStatus) || partial;
  const cancelled = NO_DOOR.includes(o.shippingStatus);

  const cash: StageState = delivered ? (o.settlementStatus === CASH_DONE ? 'DONE' : 'PENDING') : 'NONE';
  const goods: StageState = comingBack ? (o.returnReceived ? 'DONE' : 'PENDING') : 'NONE';

  // An order still on its way to a door is not "closed with nothing owed" —
  // it has simply not started either stage. Saying `closed` about it would
  // put every shipped parcel in the finished pile.
  const reachedADoor = delivered || comingBack || cancelled;
  const closed = reachedADoor && cash !== 'PENDING' && goods !== 'PENDING';

  return { cash, goods, closed, why: reason({ cash, goods, closed, reachedADoor, partial }) };
}

function reason(s: {
  cash: StageState;
  goods: StageState;
  closed: boolean;
  reachedADoor: boolean;
  partial: boolean;
}): string {
  if (!s.reachedADoor) return 'لم يصل البابَ بعد — لا مرحلةَ إغلاقٍ بدأت';
  const waiting: string[] = [];
  if (s.cash === 'PENDING') waiting.push('المال لم يصل إلينا بعد');
  if (s.goods === 'PENDING') waiting.push('البضاعة الراجعة لم تُستلَم بعد');
  if (waiting.length === 0) {
    return s.partial ? 'مغلق: المال وصل والبضاعة الراجعة استُلمت' : 'مغلق';
  }
  const head = s.partial ? 'تسليم جزئي — ' : '';
  return head + waiting.join('، و');
}

/** Both stages, named for a screen that lists them side by side. */
export const STAGE_AR: Record<'cash' | 'goods', string> = {
  cash: 'الكاش',
  goods: 'المرتجع',
};

export const STAGE_STATE_AR: Record<StageState, string> = {
  DONE: 'تمّ',
  PENDING: 'بانتظاره',
  NONE: 'لا ينطبق',
};
