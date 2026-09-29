import { HEALTH_AR, type HealthTone } from './health';
import { CONFIRMATION_REFUSED } from './order-state';

/**
 * «البنات جابوا طلبات أكثر» — AND WHY THAT SENTENCE IS NOT A MEASUREMENT.
 *
 * The owner's note, verbatim: «العمولات: AI + Score. أفضل نظام عمولة كاضافة:
 * البنات جابوا طلبات أكثر. بس بدك تاخد بعين الاعتبار التمويل أي فترة من
 * الشهر، لأنو مثلاً تحويل عالي، طلبات أعلى بداية الشهر والراتب… إلخ».
 *
 * He has diagnosed the problem exactly. Ranking agents by how many orders
 * they brought rewards THE CALENDAR, not the person. Salaries land at the
 * start of the month, conversion is higher while people have money, and
 * whoever happened to work those shifts tops the table — so a tiered
 * commission pays a band that the roster handed out rather than one anybody
 * earned. Three things move an agent's raw count that have nothing to do
 * with how well they work:
 *
 *   HOW MANY days they worked. Twenty shifts beats ten at any skill level.
 *   WHICH days they worked. Payday week beats the lean end of the month.
 *   HOW MUCH the queue gave them. A quiet Tuesday has fewer calls in it.
 *
 * THE FIX DOES NOT NEED A SEASONAL MODEL, which is the whole point of the
 * design. Instead of predicting how rich a day should have been — which
 * needs years of history nobody here has — each agent is compared ONLY with
 * the colleagues who worked THE SAME DAYS. If payday inflates the numbers it
 * inflates everybody's on that day, so the ratio between them is untouched.
 * The calendar cancels out instead of being estimated.
 *
 * For each day, an «even share» is that day's total divided by the number of
 * agents who worked it. An agent's index is what they actually did over the
 * even share of the same days. 1.0 is a fair share of the traffic they were
 * present for; 1.6 is sixty per cent more than the colleagues beside them
 * managed on the very same days.
 *
 * DAYS WORKED ALONE CARRY NO COMPARISON AND ARE DROPPED. On a day with one
 * agent the even share IS their count, so the index is 1.0 by arithmetic
 * rather than by performance — and an agent who always works alone would
 * come out exactly average forever. Measured on this database: 5 of 6
 * confirmation days had a single agent working.
 *
 * NOTHING HERE COMPUTES MONEY. `commission-rules.earnedBy` is the one
 * function that turns a count into an amount and it is not touched: this
 * file explains the count that function is handed. A second arithmetic path
 * to a commission figure is the exact failure `commission-one-source.test.ts`
 * exists to prevent.
 *
 * AND NO MODEL IS CALLED. «Score» here is a weighted sum of two measured
 * facts whose every step is printed beside the answer.
 */

// ─── PART ONE: A CANCELLED ORDER NEVER COUNTS ───

/**
 * The owner's second note, verbatim: «استرجاع الملغي: عمولة كاملة إذا اتسلم،
 * وما في عمولة (إذا لأ). قاعدة عمولة صحيح ما بظهر ولا طلب ملغي سواء قبل
 * التأكيد او بعد التأكيد».
 *
 * Two sentences, two different places:
 *
 *   THE MONEY is already right. `commission.accrueForOrder` refuses anything
 *   whose shipping status is not DELIVERED, so a cancelled order cannot
 *   accrue; `assertCancellable` refuses to cancel an order that has left the
 *   warehouse, so a delivered order cannot be cancelled behind the ledger's
 *   back; and a delivered order that comes back goes through the returns path
 *   into `reverseForOrder`. A recovered order — the winback flow — is a NEW
 *   order, so it earns in full when it is delivered and nothing when it is
 *   not, which is the rule he asked for, already.
 *
 *   THE COUNT is not. `commission-metrics.sourcedCount` counted every order a
 *   moderator brought in during the span with no status filter at all, so a
 *   cancelled order sat in the base a tiered rule bands on and in the money a
 *   PERCENT rule multiplies. Measured on this database: 1 of the 150 orders in
 *   that base, carrying 20.00 of sale value. Small here only because this
 *   record holds 7 cancellations in total; in a live COD shop the refusal rate
 *   is nothing like 0.7%.
 *
 * So the predicate lives here, once, and both the metric readers and the
 * fairness measure ask it rather than each writing the list out.
 *
 * BOTH COLUMNS ARE CHECKED, because «قبل التأكيد او بعد التأكيد» lands in
 * different ones. Cancelling before or at confirmation writes
 * `confirmationStatus`; a shipping-side cancel writes `shippingStatus`. A
 * predicate reading only the first would let the second through, and the
 * order would be counted by the very rule meant to exclude it.
 */
export const CANCELLED_SHIPPING = 'CANCELLED';

export interface CountableOrder {
  confirmationStatus: string;
  shippingStatus: string;
}

/** True when this order may appear in any commission base at all. */
export function countsTowardCommission(order: CountableOrder): boolean {
  if ((CONFIRMATION_REFUSED as readonly string[]).includes(order.confirmationStatus)) return false;
  if (order.shippingStatus === CANCELLED_SHIPPING) return false;
  return true;
}

/**
 * The same rule as a Prisma clause, so a query and an in-memory check cannot
 * disagree. Spread into a `where`, never rewritten at a call site.
 */
export const whereCountsTowardCommission = () => ({
  confirmationStatus: { notIn: [...CONFIRMATION_REFUSED] },
  shippingStatus: { not: CANCELLED_SHIPPING },
});

// ─── PART TWO: THE FLOORS ───

/**
 * Days on which this agent AND at least one colleague both worked. Fewer
 * than this and no index is given.
 *
 * A working week of overlap is the least that can distinguish a person from
 * a shift. One shared day is one roster accident: on this database the single
 * comparable confirmation day has two agents on it at 4 orders against 1, and
 * declaring one of them 60% better than the other from that would be exactly
 * the unfairness the owner is complaining about, wearing a fairer name.
 *
 * MEASURED, 2026-09-29: the best-covered agent has **1** comparable day. So
 * every agent is ungraded today. That is the honest reading of a record with
 * 6 working days in it, and it is reported as such rather than softened.
 */
export const MIN_COMPARABLE_DAYS = 5;

/**
 * Orders of their own, on those comparable days, before a ratio is stated.
 * An index built on two orders is a coin toss with a decimal point.
 * MEASURED: the best-covered agent has 4.
 */
export const MIN_COUNTED_ORDERS = 10;

/** A day is comparable only with someone to compare against. Definitional. */
export const MIN_PEERS_PER_DAY = 2;

/** At or above this share of the day's even split: they beat the room. */
export const ABOVE_INDEX = 1.25;
/** Below this they are behind the colleagues who worked the same days. */
export const BELOW_INDEX = 0.8;

// ─── PART THREE: CAN THE CALENDAR EFFECT BE MEASURED AT ALL? ───

/** Distinct calendar months the record must span before a month-phase curve is fitted. */
export const MIN_MONTHS_FOR_CALENDAR = 3;
/** Distinct days-of-month that must carry orders, out of 31. */
export const MIN_DAYS_OF_MONTH_COVERED = 20;
/** No single calendar day may hold more than this share of all the orders. */
export const MAX_SINGLE_DAY_SHARE = 0.4;

export interface CalendarReadiness {
  ready: boolean;
  months: number;
  daysOfMonthCovered: number;
  /** The share of every order sitting on the single busiest calendar day. */
  busiestDayShare: number;
  /** Said plainly, with the measured numbers in it. */
  why: string;
}

/**
 * WHETHER THE OWNER'S «أي فترة من الشهر» CAN BE HONOURED YET.
 *
 * He is right that the phase of the month matters. Fitting a curve to it
 * needs a record that has actually seen several months from end to end, and
 * this one has not. Rather than quietly ignoring the request or inventing a
 * payday coefficient, the precondition is stated as a function: the screen
 * can print exactly why the adjustment is not applied, and the same function
 * will say it IS possible the day it becomes true.
 *
 * MEASURED, 2026-09-29: 2 months, 8 of 31 days-of-month carrying any order,
 * and 149 of 171 orders (87%) sitting on one single day. All three fail. The
 * day-controlled index above needs none of this, which is why it is the
 * deliverable and this is only a note.
 */
export function calendarReadiness(dates: readonly Date[]): CalendarReadiness {
  if (dates.length === 0) {
    return { ready: false, months: 0, daysOfMonthCovered: 0, busiestDayShare: 0, why: 'لا طلبَ في السجل بعد.' };
  }

  const months = new Set(dates.map((d) => d.toISOString().slice(0, 7))).size;
  const daysOfMonthCovered = new Set(dates.map((d) => d.getUTCDate())).size;

  const perDay = new Map<string, number>();
  for (const d of dates) {
    const key = d.toISOString().slice(0, 10);
    perDay.set(key, (perDay.get(key) ?? 0) + 1);
  }
  const busiest = Math.max(...perDay.values());
  const busiestDayShare = busiest / dates.length;

  const missing: string[] = [];
  if (months < MIN_MONTHS_FOR_CALENDAR) missing.push(`${months} شهراً فقط من ${MIN_MONTHS_FOR_CALENDAR}`);
  if (daysOfMonthCovered < MIN_DAYS_OF_MONTH_COVERED) {
    missing.push(`${daysOfMonthCovered} يوماً من أيام الشهر فيها طلبات، والمطلوب ${MIN_DAYS_OF_MONTH_COVERED}`);
  }
  if (busiestDayShare > MAX_SINGLE_DAY_SHARE) {
    missing.push(`${Math.round(busiestDayShare * 100)}% من الطلبات في يومٍ واحد`);
  }

  if (missing.length === 0) {
    return {
      ready: true,
      months,
      daysOfMonthCovered,
      busiestDayShare,
      why: `${months} أشهر و${daysOfMonthCovered} يوماً من أيام الشهر — يكفي لقياس أثر فترة الشهر.`,
    };
  }
  return {
    ready: false,
    months,
    daysOfMonthCovered,
    busiestDayShare,
    why:
      `لا يمكن قياس أثر «فترة الشهر» بعد: ${missing.join('، ')}. ` +
      'ولذلك المقارنة تجري بين مَن عمل الأيامَ نفسها — وهذا يُلغي أثرَ التقويم بلا حاجةٍ لقياسه.',
  };
}

// ─── PART FOUR: THE DAY-CONTROLLED INDEX ───

/** One agent's countable work on one day. The only input the measure needs. */
export interface DayWork {
  /** A calendar day key, YYYY-MM-DD. The caller decides the clock. */
  day: string;
  userId: string;
  /** Countable orders only — `countsTowardCommission` has already been applied. */
  count: number;
}

export interface FairBand {
  key: 'level' | 'consistency';
  ar: string;
  weight: number;
  earned: number;
  why: string;
}

export interface FairAgent {
  userId: string;
  /**
   * Every countable order across every day they worked — THE NUMBER THE RAW
   * LEADERBOARD USED. Kept beside the fair one on purpose: the gap between
   * them is the owner's complaint, made visible.
   */
  rawCount: number;
  /** Days they worked at all. */
  daysWorked: number;
  /** Of those, the days a colleague worked too — the only ones that compare. */
  comparableDays: number;
  /** Their orders on the comparable days. */
  counted: number;
  /** What an even split of those same days' traffic would have given them. */
  evenShare: number;
  /** counted / evenShare. Null below the floors — never a guessed 1.0. */
  index: number | null;
  /** counted − evenShare: orders above (or below) a fair share of the same days. */
  surplus: number | null;
  /** Comparable days on which they met or beat the even share. */
  winDays: number;
  /** 0..100. Null whenever the index is. */
  score: number | null;
  bands: FairBand[];
  tone: HealthTone;
  label: string;
  why: string;
}

const LEVEL_WEIGHT = 70;
const CONSISTENCY_WEIGHT = 30;

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * THE MEASURE.
 *
 * Pure: give it the day/agent/count grid and it answers. It does not know
 * what a confirmation is, which metric a rule counts, or what a day boundary
 * means in this company's timezone — all three are the caller's, because all
 * three are decisions this file has no business making twice.
 */
export function fairnessFor(rows: readonly DayWork[]): FairAgent[] {
  // The grid, day by day, so the even share of each day can be worked out
  // from who was actually present for it.
  const byDay = new Map<string, Map<string, number>>();
  for (const row of rows) {
    if (row.count <= 0) continue;
    let day = byDay.get(row.day);
    if (!day) {
      day = new Map();
      byDay.set(row.day, day);
    }
    day.set(row.userId, (day.get(row.userId) ?? 0) + row.count);
  }

  const agents = new Set<string>();
  for (const day of byDay.values()) for (const userId of day.keys()) agents.add(userId);

  return [...agents]
    .map((userId) => oneAgent(userId, byDay))
    .sort(byFairness);
}

function oneAgent(userId: string, byDay: Map<string, Map<string, number>>): FairAgent {
  let rawCount = 0;
  let daysWorked = 0;
  let comparableDays = 0;
  let counted = 0;
  let evenShare = 0;
  let winDays = 0;

  for (const day of byDay.values()) {
    const mine = day.get(userId);
    if (mine === undefined) continue;
    rawCount += mine;
    daysWorked++;

    // A day worked alone proves nothing: the even share IS the count, so the
    // ratio is 1.0 whatever happened. Counting it would let somebody who
    // always works alone sit at exactly average for ever.
    if (day.size < MIN_PEERS_PER_DAY) continue;

    let dayTotal = 0;
    for (const n of day.values()) dayTotal += n;
    const fair = dayTotal / day.size;

    comparableDays++;
    counted += mine;
    evenShare += fair;
    if (mine >= fair) winDays++;
  }

  const base = { userId, rawCount, daysWorked, comparableDays, counted, evenShare: round2(evenShare), winDays };

  if (comparableDays < MIN_COMPARABLE_DAYS) {
    return {
      ...base,
      index: null,
      surplus: null,
      score: null,
      bands: [],
      tone: 'unknown',
      label: HEALTH_AR.unknown,
      why:
        `${comparableDays} يوماً فقط عمِلها مع زميلٍ آخر، والمطلوب ${MIN_COMPARABLE_DAYS}. ` +
        'المقارنة تحتاج أياماً مشتركة — ومَن عمل وحده لا يوجد ما يُقاس به.',
    };
  }
  if (counted < MIN_COUNTED_ORDERS) {
    return {
      ...base,
      index: null,
      surplus: null,
      score: null,
      bands: [],
      tone: 'unknown',
      label: HEALTH_AR.unknown,
      why: `${counted} طلباً فقط في الأيام المشتركة، وتحت ${MIN_COUNTED_ORDERS} تكون النسبةُ ضجيجاً لا قياساً.`,
    };
  }
  // Guarded by the two floors above: reaching here means comparable days and
  // counted orders both exist, so the even share is a positive number.
  if (evenShare <= 0) {
    return {
      ...base,
      index: null,
      surplus: null,
      score: null,
      bands: [],
      tone: 'unknown',
      label: HEALTH_AR.unknown,
      why: 'لا نصيبَ متوسّطاً يُقسَم عليه في الأيام المشتركة.',
    };
  }

  const index = counted / evenShare;
  const surplus = counted - evenShare;
  const bands = [levelBand(index, counted, evenShare), consistencyBand(winDays, comparableDays)];
  const verdict = verdictOf(index, surplus, counted, comparableDays);

  return {
    ...base,
    index: round2(index),
    surplus: round2(surplus),
    score: Math.round(bands.reduce((sum, b) => sum + b.earned, 0)),
    bands,
    ...verdict,
  };
}

function verdictOf(
  index: number,
  surplus: number,
  counted: number,
  comparableDays: number
): { tone: HealthTone; label: string; why: string } {
  // The reason always carries the two raw numbers the ratio came from, so it
  // can be checked by hand. «فوق نصيبه» on its own is a claim; «14 طلباً
  // مقابل نصيبٍ متوسّط 9» is a claim somebody can audit.
  const sign = surplus >= 0 ? '+' : '';
  const shared = `${counted} طلباً في ${comparableDays} يوماً مشتركاً، ونصيبُ الأيام نفسها ${round2(counted - surplus)} — ${sign}${round2(surplus)}`;

  if (index >= ABOVE_INDEX) {
    return { tone: 'good', label: 'فوق نصيبه من اليوم', why: `${shared}. أي ${round2(index)} ضعف نصيبه.` };
  }
  if (index >= BELOW_INDEX) {
    return { tone: 'ok', label: 'بقدر نصيبه', why: `${shared}. أي ${round2(index)} من نصيبه — قريبٌ من العدل.` };
  }
  return { tone: 'bad', label: 'تحت نصيبه', why: `${shared}. أي ${round2(index)} من نصيبه.` };
}

/**
 * HOW FAR ABOVE A FAIR SHARE — the level.
 *
 * An even share earns the middle of the band, not the top: being exactly
 * average is neither a failure nor an achievement, and a scale that gave 1.0
 * full marks would have nothing left to say about the person doing twice the
 * work beside them.
 */
function levelBand(index: number, counted: number, evenShare: number): FairBand {
  const scaled = LEVEL_WEIGHT * Math.min(1, index / 2);
  return {
    key: 'level',
    ar: 'مقابل نصيب اليوم',
    weight: LEVEL_WEIGHT,
    earned: Math.max(0, Math.min(LEVEL_WEIGHT, scaled)),
    why: `${counted} مقابل نصيبٍ متوسّط ${round2(evenShare)} — النسبة ${round2(index)}، والعدلُ عند 1 ونهايةُ السلّم عند 2.`,
  };
}

/**
 * HOW OFTEN, NOT JUST HOW MUCH — the consistency.
 *
 * This band exists because level alone repeats the owner's own mistake one
 * level down. An index of 2.0 earned on a single enormous day and one earned
 * across ten steady days are the same number and not the same worker, and it
 * is the first that a payday shift produces. Counting the DAYS they beat the
 * room is a different fact from the size of the margin, which is why it gets
 * its own weight rather than being folded into the ratio.
 */
function consistencyBand(winDays: number, comparableDays: number): FairBand {
  const share = comparableDays > 0 ? winDays / comparableDays : 0;
  return {
    key: 'consistency',
    ar: 'ثبات النتيجة',
    weight: CONSISTENCY_WEIGHT,
    earned: Math.max(0, Math.min(CONSISTENCY_WEIGHT, CONSISTENCY_WEIGHT * share)),
    why: `تجاوز نصيبَ اليوم في ${winDays} من ${comparableDays} يوماً مشتركاً، أي ${Math.round(share * 100)}%.`,
  };
}

/**
 * BEST FIRST, and the ungraded last rather than at the bottom of the scale.
 *
 * «We cannot tell yet» is not last place. An agent with four comparable
 * orders placed below a measured under-performer would be read as worse than
 * them, which is a verdict nobody computed.
 */
export function byFairness(a: FairAgent, b: FairAgent): number {
  if (a.index === null && b.index === null) return b.rawCount - a.rawCount;
  if (a.index === null) return 1;
  if (b.index === null) return -1;
  return b.index - a.index;
}

/**
 * WHERE THE RAW TABLE AND THE FAIR TABLE DISAGREE.
 *
 * The single most useful output, and the reason the whole file exists. If
 * ranking by raw count and ranking by the day-controlled index produce the
 * same order, the calendar was not distorting anything and the owner can pay
 * on volume with a clear conscience. When they differ, the pairs that swapped
 * are named — that is the evidence for changing how commission is banded,
 * and without it the change is just another opinion.
 *
 * Only graded agents take part: an ungraded one has no fair rank to compare.
 */
export function rankDisagreements(agents: readonly FairAgent[]): {
  compared: number;
  swaps: { aheadOnVolume: string; aheadOnFairness: string }[];
} {
  const graded = agents.filter((a) => a.index !== null);
  const swaps: { aheadOnVolume: string; aheadOnFairness: string }[] = [];

  for (let i = 0; i < graded.length; i++) {
    for (let j = i + 1; j < graded.length; j++) {
      const a = graded[i];
      const b = graded[j];
      const volume = a.rawCount - b.rawCount;
      const fair = (a.index as number) - (b.index as number);
      // Only a genuine reversal counts. A tie on either measure is not a
      // disagreement, and reporting it as one would cry wolf.
      if (volume > 0 && fair < 0) swaps.push({ aheadOnVolume: a.userId, aheadOnFairness: b.userId });
      else if (volume < 0 && fair > 0) swaps.push({ aheadOnVolume: b.userId, aheadOnFairness: a.userId });
    }
  }
  return { compared: graded.length, swaps };
}
