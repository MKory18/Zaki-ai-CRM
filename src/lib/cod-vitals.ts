import { rateOf } from './order-state';
import type { SettlementStatus } from './finance-workflow';

/**
 * THE FEW NUMBERS A CASH-ON-DELIVERY SHOP LIVES OR DIES BY — AND WHETHER
 * THE DATA IS ALLOWED TO SAY THEM OUT LOUD.
 *
 * This file exists because of one measurement. On the live database, the
 * store that has actually traded (صحة بلس, 165 orders) reports a net margin
 * of 76.93%. No cash-on-delivery shop in the region earns that, and the
 * reason it appears is arithmetic, not trade: cost of goods is recorded on
 * 4 of 119 delivered orders — 41.38 against 2461.50 of revenue — and the
 * expenses table is empty. The margin is not wrong by a little. It is
 * revenue wearing the word «ربح», and every product row on the performance
 * screen printed a margin between 76% and 82% because of it.
 *
 * That uniformity is the exact shape of the failure that killed the
 * intelligence layer in this product: a grade that comes out the same for
 * everybody is not a grade, it is a missing input with a number drawn over
 * it. So this file's central idea is not a new metric. It is a GATE:
 *
 *   A FIGURE MAY ONLY BE STATED WHEN ITS INPUTS WERE ACTUALLY RECORDED.
 *
 * `health.ts` already refuses to judge a rate computed over too few
 * observations — that is SAMPLE SIZE, «هل عددُ المشاهدات يكفي». This is the
 * other question, and nothing asked it: «هل الحقلُ الذي يقوم عليه الرقم
 * مكتوبٌ أصلاً». A hundred and nineteen delivered orders is a fine sample.
 * Four of them carrying a cost is not a fine input. The two gates are
 * independent and both are needed, which is why this is a second function
 * and not an extra argument to `health`.
 *
 * The other two sections are the numbers the screens were missing, both
 * measured before they were chosen:
 *
 *   THE DOOR'S VERDICT. 34 of 153 parcels that reached a verdict came back
 *   — 22%, against a bar of 8% good and 15% acceptable. A return is the one
 *   loss in this trade that is billed twice, outbound and back, and neither
 *   the dashboard nor the performance screen showed it anywhere.
 *
 *   THE MONEY STILL OUT THERE. 119 delivered orders, 2461.50, every single
 *   one of them PENDING_COLLECTION — which is to say the whole of the
 *   revenue the dashboard reports as earned is sitting with couriers. A
 *   screen that prints «إيراد» and never prints «لم يُحصَّل» is describing a
 *   business that has been paid.
 */

// ─────────────────────────────────────────────────────
// 1. WHAT THE DOOR DECIDED
// ─────────────────────────────────────────────────────

/**
 * A parcel that came back, or is on its way back.
 *
 * RETURN_REQUESTED is counted with RETURNED rather than held aside as
 * «pending»: the customer has already refused it, the outbound fee is
 * already spent and the return fee is already owed. Waiting for the parcel
 * to physically arrive before admitting the loss would make the figure
 * lag the money by however long the courier takes.
 */
export const DOOR_RETURNED_SHIPPING = ['RETURN_REQUESTED', 'RETURNED'] as const;

/** An attempt that failed at the door without a return yet decided. */
export const DOOR_FAILED_SHIPPING = ['FAILED_DELIVERY'] as const;

export interface DoorCounts {
  /** DELIVERED + PARTIALLY_DELIVERED — `DELIVERED_SHIPPING` in order-state. */
  delivered: number;
  failed: number;
  returned: number;
}

export interface DoorOutcome {
  /** Parcels the door has actually finished with. Never the order total. */
  decided: number;
  /** Whole-number percentage, or null when the door decided nothing. */
  returnRate: number | null;
  failureRate: number | null;
}

/** Negative and non-finite counts are a caller's bug, not a negative rate. */
const count = (n: number): number => (Number.isFinite(n) && n > 0 ? Math.floor(n) : 0);

/**
 * THE DENOMINATOR OF A RETURN RATE IS WHAT THE DOOR DECIDED.
 *
 * Not orders created, and not orders confirmed. An order still in a van has
 * not yet failed, and dividing by it makes the return rate fall every time
 * intake speeds up — the same defect the confirmation rate had before it was
 * moved onto «decided», measuring the size of the queue instead of the
 * quality of the work.
 *
 * These are the same three sets `/api/orders/shipping/performance` divides
 * by for each courier, named here once so the company-wide figure on the
 * dashboard and the per-courier rows on the performance screen cannot come
 * to mean different things.
 */
export function doorOutcome(counts: DoorCounts): DoorOutcome {
  const delivered = count(counts.delivered);
  const failed = count(counts.failed);
  const returned = count(counts.returned);
  const decided = delivered + failed + returned;
  return {
    decided,
    returnRate: rateOf(returned, decided),
    failureRate: rateOf(failed, decided),
  };
}

// ─────────────────────────────────────────────────────
// 2. WHERE THE MONEY IS
// ─────────────────────────────────────────────────────

/**
 * Delivered, and the cash has not reached us.
 *
 * Only the states that POSITIVELY say money is owed. NOT_APPLICABLE is left
 * out on purpose — it means the question does not apply to this order — but
 * a DELIVERED order sitting on NOT_APPLICABLE is a hole in the record
 * rather than a settled sale, so the route counts those separately and the
 * screen names them. Folding them in here would have turned a missing
 * record into a confident debt.
 */
export const UNCOLLECTED_SETTLEMENT: readonly SettlementStatus[] = [
  'PENDING',
  'PENDING_COLLECTION',
  'PARTIALLY_SETTLED',
  'UNSETTLED',
];

/** Delivered, and nobody wrote down whether the money came back. */
export const UNRECORDED_SETTLEMENT: readonly SettlementStatus[] = ['NOT_APPLICABLE'];

// ─────────────────────────────────────────────────────
// 3. MAY THIS FIGURE BE SAID AT ALL?
// ─────────────────────────────────────────────────────

export const TRUST_LEVELS = ['STATED', 'PARTIAL', 'WITHHELD'] as const;
export type TrustLevel = (typeof TRUST_LEVELS)[number];

/**
 * The two lines, as shares of the population, plus the floor under both.
 *
 * `state` and `partial` are fractions (0..1) and not percentages, because
 * they are compared against a ratio of two counts and converting once at
 * the edge beats converting at every comparison.
 */
export interface TrustBars {
  /** At or above this share of the population recorded: the figure is printed. */
  state: number;
  /** At or above this: printed, with the gap named beside it. */
  partial: number;
  /** Below this many observations, no coverage judgement is made at all. */
  minPopulation: number;
}

/**
 * THE BARS FOR A COST-DERIVED FIGURE — profit, margin, «الأكثر ربحاً».
 *
 * Strict on purpose, and the strictness is the point rather than a taste.
 * A margin is a ratio, so a missing cost does not shave it a little: every
 * order with no recorded cost enters the numerator as pure profit. At 50%
 * coverage the margin is roughly double the truth, which is still a number
 * somebody would act on. So «PARTIAL» is a narrow band that exists to say
 * «هذا الرقم على نقص» for a shop most of the way there, not a licence.
 *
 * Five is the floor: below five delivered orders the coverage share is 0%,
 * 20%, 40% and nothing in between, and a gate that swings on one order is
 * a coin toss with a reason attached.
 */
export const COST_TRUST: TrustBars = { state: 0.9, partial: 0.5, minPopulation: 5 };

export interface Trust {
  level: TrustLevel;
  /** Observations whose input was actually recorded. */
  present: number;
  population: number;
  /** Whole-number percentage of the population, or null with nothing to measure. */
  share: number | null;
  /** Why it says that, in one sentence, with Western digits. Never inferred. */
  ar: string;
}

export interface TrustInput {
  present: number;
  population: number;
  /**
   * The missing thing, named — «كلفة البضاعة», «سبب الإرجاع». The sentence
   * has to name it or the reader is told a number is unsafe and not told
   * which field to go and fill in.
   */
  subject: string;
}

/**
 * WHETHER A FIGURE BUILT ON A FIELD MAY BE PRINTED, GIVEN HOW OFTEN THAT
 * FIELD IS ACTUALLY WRITTEN.
 *
 * `present` is clamped to `population` rather than trusted. A caller that
 * counts its two halves with slightly different filters — which is how
 * every rate in this file's history went over 100% — gets a share of 100%
 * and a printed figure, never 113% and a reader who stops believing the
 * screen.
 */
export function trustOf(input: TrustInput, bars: TrustBars = COST_TRUST): Trust {
  const population = count(input.population);
  const present = Math.min(count(input.present), population);
  const subject = input.subject;

  if (population === 0) {
    return {
      level: 'WITHHELD',
      present: 0,
      population: 0,
      share: null,
      ar: `لا طلبات في هذه المدة — ${subject} لا تُقاس على فراغ.`,
    };
  }

  const share = rateOf(present, population) ?? 0;

  if (population < bars.minPopulation) {
    return {
      level: 'WITHHELD',
      present,
      population,
      share,
      ar: `${population} من الطلبات فقط — تحت ${bars.minPopulation}، والحكم على عيّنةٍ بهذا الصغر تخمين.`,
    };
  }

  // Compared as a ratio, not as the rounded percentage above: 89.6% rounds
  // to 90 and would pass a 90% bar it did not actually reach.
  const ratio = present / population;

  if (ratio >= bars.state) {
    return {
      level: 'STATED',
      present,
      population,
      share,
      ar: `${subject} مسجَّلة على ${present} من ${population} طلب — الرقم صالح.`,
    };
  }
  if (ratio >= bars.partial) {
    return {
      level: 'PARTIAL',
      present,
      population,
      share,
      ar: `${subject} ناقصة على ${population - present} من ${population} طلب — الرقم مأخوذٌ على نقص.`,
    };
  }
  return {
    level: 'WITHHELD',
    present,
    population,
    share,
    ar: `${subject} مسجَّلة على ${present} من ${population} طلب فقط (${share}%) — الرقم لا يُقال.`,
  };
}

/**
 * ONE ROW OF A PROFIT TABLE, ASKED THE SAME QUESTION.
 *
 * The table-wide gate answers «is this shop's cost data usable». It cannot
 * answer «is THIS product's margin usable», and on the measured data those
 * two differ: 5 of the 7 products that sold have no cost at all while 2
 * have one. A table gated only at the top would blank the two rows that
 * are true, and a table gated nowhere prints 82% against five products
 * whose cost nobody has typed.
 *
 * Revenue with no cost against it is the whole test. A row with no revenue
 * is not a lie — there is simply no margin to state either way.
 */
export function rowCostStated(row: { revenue: number; cogs: number }): boolean {
  const revenue = Number(row.revenue);
  const cogs = Number(row.cogs);
  if (!Number.isFinite(revenue) || !Number.isFinite(cogs)) return false;
  if (revenue <= 0) return false;
  return cogs > 0;
}
