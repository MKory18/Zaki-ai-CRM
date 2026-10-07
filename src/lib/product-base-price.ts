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
 * The shape is the one `finance/route.ts` uses for an expense amount —
 * parse, then refuse what is not a finite number instead of coping with it
 * downstream (`57eb1d6`: a bad value is refused at the door it enters by).
 *
 * ONE DELIBERATE DIFFERENCE FROM THAT DOOR, and it is about a price:
 *
 *   · **Zero is allowed.** An expense of 0 is not an expense — the expense
 *     door refuses it by name, and `Expense.amount` has no `@default` to
 *     nominate it. A product at 0 is a sample, a gift or a price not set
 *     yet, and the column's own default IS `0.0`. A typed zero is a real
 *     value here, so it is stored as typed — never replaced by a fallback.
 *
 * `Number` RATHER THAN `parseFloat` WAS THE SECOND DIFFERENCE AND IS NOT
 * ONE ANY MORE. `parseFloat('3,5')` is `3` and `parseFloat('12abc')` is
 * `12`, so a decimal comma from an Arabic keyboard stored a wrong price
 * silently; `Number('3,5')` is `NaN` and is refused, which is an answer a
 * person can act on. `finance/route.ts` carried the `parseFloat` weakness
 * until it was closed there too — it now reads its amount through
 * `numeric-input.ts`, which is stricter than `Number` as well: it refuses
 * `'0x10'`, which `Number` reads as **16**. THIS READER STILL DOES NOT, and
 * that is a known gap recorded here rather than a decision — see
 * `a-column-has-one-rule.test.ts`, where `'0x10'` is the one hostile string
 * the price tests do not list.
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
