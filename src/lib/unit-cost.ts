/**
 * WHAT A NEW BATCH OF STOCK COSTS — one rule, for every door that opens one.
 *
 * Cost is captured the moment stock arrives and is never corrected later,
 * because the cost of a sold unit was read at the moment it sold. So a batch
 * that enters at zero reports every unit out of it as pure profit, for ever,
 * and no report downstream can tell that from a genuinely free sample.
 *
 * FOR A PURCHASED PRODUCT THIS IS THE ONLY PLACE ITS COST EXISTS. `Product`
 * carries `basePrice`, which is what we SELL it for; there is no cost column
 * on the product at all. A manufactured one has its breakdown on the
 * production run. A bought one has this field and nothing else.
 *
 * THREE DOORS OPEN A BATCH, AND THEY DID NOT AGREE:
 *
 *   the opening count refused a zero unless somebody wrote why;
 *   the recount entered a surplus at the cost of the stock already there —
 *     and at ZERO when there was none;
 *   receiving purchased goods called the cost «(اختياري)» and turned a blank
 *     field into a zero without a word.
 *
 * Measured on this database before changing anything: ZERO of 108 batches
 * carry a zero unit cost. So this is a trap that has not sprung, not a wound
 * — said plainly because a comment claiming damage that is not there is a
 * comment nobody will trust the next time. What it takes to spring it is one
 * person leaving a field marked «(اختياري)» empty, and the reasoning for
 * refusing that was already written, twice, in the comments of the other two
 * doors. This file is that reasoning as code, so the three cannot drift
 * apart again.
 */

export const ZERO_COST_CODE = 'ZERO_COST_UNEXPLAINED';
export const NO_COST_CODE = 'UNIT_COST_REQUIRED';

export const ZERO_COST_MESSAGE =
  'كلفة وحدةٍ بصفر تجعل كلَّ ما يُباع منها ربحاً صافياً إلى الأبد، والكلفة تُلتقط لحظة الدخول ' +
  'فلا تصحيح بعدها. إن كانت صفراً حقّاً — عيّنة أو هديّة — فاكتب السبب.';

export const NO_COST_MESSAGE =
  'اكتب كلفة الوحدة في هذه الدفعة. لا كلفة سابقة لهذا المنتج تُبنى عليها، ' +
  'وتركُها فارغةً يُدخلها بصفر فيظهر كلُّ ما يُباع منها ربحاً صافياً.';

/** The shortest sentence that counts as an explanation rather than a keystroke. */
export const MIN_ZERO_COST_REASON = 5;

export type UnitCostVerdict =
  | { ok: true; unitCost: number; source: 'TYPED' | 'CARRIED' | 'EXPLAINED_ZERO' }
  | { ok: false; code: string; message: string };

/**
 * THE COST THIS BATCH ENTERS AT.
 *
 *   a figure typed          → that figure;
 *   a typed zero            → only with a sentence saying why;
 *   nothing typed, and the
 *     product has costed
 *     stock already         → that cost, carried forward. This is what the
 *                             recount door already did, and it is right: a
 *                             delivery of the same thing at an unknown price
 *                             is far likelier to have cost what the last one
 *                             cost than to have been free;
 *   nothing typed, and no
 *     previous cost         → refused. There is nothing to carry and nothing
 *                             to guess, and a zero here is the silent one.
 *
 * Pure: no database, no clock. The doors read the previous cost themselves —
 * each knows its own scope — and hand it in.
 */
export function resolveUnitCost(input: {
  /** What the person typed. `null`/`undefined` is an empty field, which is not a zero. */
  given: number | null | undefined;
  /** The unit cost of this product's newest costed stock, or null if it has none. */
  previous: number | null;
  /** Why a zero is real. Only ever read when `given` is zero. */
  zeroCostReason?: string | null;
}): UnitCostVerdict {
  const { given, previous, zeroCostReason } = input;

  if (given === null || given === undefined) {
    if (previous !== null && previous > 0) return { ok: true, unitCost: previous, source: 'CARRIED' };
    return { ok: false, code: NO_COST_CODE, message: NO_COST_MESSAGE };
  }

  if (!Number.isFinite(given) || given < 0) {
    return { ok: false, code: NO_COST_CODE, message: 'كلفة الوحدة رقمٌ لا يقلّ عن صفر.' };
  }

  if (given === 0) {
    if ((zeroCostReason?.trim().length ?? 0) < MIN_ZERO_COST_REASON) {
      return { ok: false, code: ZERO_COST_CODE, message: ZERO_COST_MESSAGE };
    }
    return { ok: true, unitCost: 0, source: 'EXPLAINED_ZERO' };
  }

  return { ok: true, unitCost: given, source: 'TYPED' };
}
