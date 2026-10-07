/**
 * ONE READING OF A TYPED PRICE — for both product doors.
 *
 * `POST /api/products` and `PATCH /api/products/[id]` both wrote
 *
 *     basePrice: parseFloat(basePrice) || 0
 *
 * so a price box containing anything that is not a number stored a **free
 * product** and answered 200. Nobody is told. And `basePrice` does not stay
 * on the product card: it is the fallback price in the AI intake
 * (`orders/ai-intake`), it is the price a landing page shows a shopper, and
 * `ProductOffers` multiplies it to propose the offer ladder. A zero written
 * by a typo propagates into all three.
 *
 * The shape is the one `finance/route.ts` already uses for an expense
 * amount — parse, then refuse what is not a finite number instead of coping
 * with it downstream (`57eb1d6`: a bad value is refused at the door it
 * enters by).
 *
 * TWO DELIBERATE DIFFERENCES FROM THAT DOOR, both about a price:
 *
 *   · **Zero is allowed.** An expense of 0 is not an expense; a product at 0
 *     is a sample, a gift or a price not set yet, and the column's own
 *     default is `0.0`. A typed zero is a real value, so it is stored as
 *     typed — never replaced by a fallback.
 *   · **`Number`, not `parseFloat`.** `parseFloat('3,5')` is `3`, and
 *     `parseFloat('12abc')` is `12` — a price box holding a decimal comma
 *     would silently store a wrong price, which is the same defect wearing
 *     the other shoe. `Number('3,5')` is `NaN` and is refused, which is the
 *     answer a person can act on.
 */

/** What the person is told when what they typed is not a price. */
export const BASE_PRICE_NOT_A_NUMBER =
  'السعر الأساسي رقمٌ صفر أو أكثر. اكتبه بالأرقام.';

/**
 * The price as it arrives in a request body, or `null` when what arrived is
 * not a price at all — the caller answers 400 with `BASE_PRICE_NOT_A_NUMBER`
 * and writes nothing.
 *
 * `null` is the refusal and not «no price», because this function is only
 * ever called with a value that was PRESENT in the body. A key that is
 * absent is the caller's own case: creating leaves the column at 0, editing
 * leaves the stored price alone. That distinction cannot live in a return
 * value that doubles as the refusal.
 */
export function readBasePrice(raw: unknown): number | null {
  const value =
    typeof raw === 'number'
      ? raw
      : typeof raw === 'string' && raw.trim() !== ''
        ? Number(raw.trim())
        : NaN;
  // Finite rules out NaN and ±Infinity; a negative price is not a discount,
  // it is a typo with a minus in front of it.
  return Number.isFinite(value) && value >= 0 ? value : null;
}
