import { numeric } from './numeric-input';

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
 * `Number` RATHER THAN `parseFloat` WAS A SECOND DIFFERENCE, AND IT WAS NOT
 * ENOUGH. `parseFloat('3,5')` is `3` and `parseFloat('12abc')` is `12`, so a
 * decimal comma from an Arabic keyboard stored a wrong price silently;
 * `Number('3,5')` is `NaN` and is refused, which is an answer a person can
 * act on. That reasoning was right. What it did not close is the other road
 * into the same defect — **`Number` reads base prefixes**, measured here:
 *
 *     Number('0x10') → 16        Number('0b11') → 3
 *     Number('0o17') → 15        Number('0X10') → 16   (and 0B, 0O)
 *
 * so `readBasePrice('0x10')` returned **16**: a wrong price, stored
 * silently, answering 200 — the exact class of defect this file exists to
 * prevent, one notation over. `Number` closed the comma road and left the
 * base-prefix road open, and a reader that is strict about one notation and
 * generous about another is not a strict reader.
 *
 * SO THE NOTATION IS NOT DECIDED HERE ANY MORE. It is decided by
 * `numeric-input.ts`, the one strict reader the money and stock doors
 * already use: a number, or a string written the way a decimal number is
 * written (sign, digits, decimal point, decimal exponent) and nothing else.
 * A twelfth hand-rolled variant is how the eleven before it diverged.
 *
 * WHAT THIS FILE STILL DECIDES, and what it borrows:
 *
 *   · **Borrowed from `numeric()`:** the notation, and finiteness. `'0x10'`,
 *     `'2,500'`, `'12abc'`, `'١٢٣'`, `''`, `'   '`, `null`, `[]`, `['5']`,
 *     `{valueOf}` and `true` all fail its schema; `'Infinity'` and `'1e400'`
 *     fail `z.number()`, which is finite in zod 4. THIS FUNCTION NO LONGER
 *     CHECKS FINITENESS ITSELF — that would be a guard that cannot fire, and
 *     this audit has already caught ten of those. The dependency is pinned
 *     by assertion instead, in `a-column-has-one-rule.test.ts`: if `numeric()`
 *     ever lets `Infinity` through, that suite fails.
 *   · **Decided here:** that zero is a price and a negative number is not.
 *
 * NO CEILING IS DECLARED, and that is reported rather than decided:
 * `'1e308'` is a plain decimal, is finite, and is stored. See the note in
 * `a-column-has-one-rule.test.ts`.
 */

/** What the person is told when what they typed is not a price. */
export const BASE_PRICE_NOT_A_NUMBER =
  'السعر الأساسي رقمٌ صفر أو أكثر. اكتبه بالأرقام.';

/**
 * The one notation a price may be written in — the shared strict reader,
 * built once rather than per call.
 */
const PRICE = numeric();

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
  const read = PRICE.safeParse(raw);
  if (!read.success) return null;
  // A negative price is not a discount, it is a typo with a minus in front
  // of it. This is the only bound this file adds to the shared reader.
  return read.data >= 0 ? read.data : null;
}
