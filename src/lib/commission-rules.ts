import { roundMinor } from './money';

/**
 * WHAT A COMMISSION RULE CAN SAY.
 *
 * A rule used to be one number: a percent of the sale, or a fixed amount,
 * paid on every delivered order. That is one arrangement out of the six the
 * owner actually uses, and the other five could not be written down at all —
 * so they lived in somebody's head and were paid by hand.
 *
 * A rule now says three things:
 *
 *   metric — WHAT is counted. Orders delivered, orders confirmed, orders a
 *            moderator brought in, the delivery rate itself, or the units
 *            added during a call.
 *   period — over WHAT SPAN. PER_ORDER pays as it happens, the way it always
 *            did. DAILY, WEEKLY and MONTHLY cannot be known until the span
 *            closes — "150 confirmed in a day" is not a fact about any one
 *            order — so they are accrued once, afterwards, by the scheduler.
 *   tiers  — the BANDS. "100–149 pays x, 150–199 pays y, 200+ pays z", or a
 *            single bonus once a threshold is passed.
 *
 * Nothing here holds a number of its own: every amount, band and threshold
 * comes from the rule the owner wrote. A commission figure written into this
 * file would be a rate nobody agreed to.
 */

/** What a rule counts. */
export const COMMISSION_METRICS = [
  /** Orders delivered to the customer — the original behaviour. */
  'ORDER_DELIVERED',
  /** Orders this person confirmed. */
  'CONFIRMED_COUNT',
  /** Orders this moderator brought in. */
  'SOURCED_COUNT',
  /** Delivered ÷ ever-confirmed, as a percentage. */
  'DELIVERY_RATE',
  /**
   * Extra units this person ADDED during the call — the confirmation agent's
   * cross-sell. An order that arrived multi-unit from a landing page offer
   * is not theirs; the page sold it.
   */
  'CROSS_SELL_UNITS',
  /**
   * Orders this moderator brought that arrived with more than one unit — the
   * moderator's cross-sell, and deliberately NOT the same measure. Merging
   * the two would pay one person for the other's work.
   */
  'MULTI_UNIT_ORDERS',
] as const;
export type CommissionMetric = (typeof COMMISSION_METRICS)[number];

/** Over what span the metric is counted. */
export const COMMISSION_PERIODS = ['PER_ORDER', 'DAILY', 'WEEKLY', 'MONTHLY'] as const;
export type CommissionPeriod = (typeof COMMISSION_PERIODS)[number];

/** How the value turns into money. */
export const COMMISSION_TYPES = [
  /** A percentage of the sale value. */
  'PERCENT',
  /** One fixed amount, however many orders are in the band. */
  'FIXED',
  /** A fixed amount for EACH counted order. */
  'PER_ORDER',
] as const;
export type CommissionType = (typeof COMMISSION_TYPES)[number];

export const METRIC_LABEL_AR: Record<CommissionMetric, string> = {
  ORDER_DELIVERED: 'كل طلب مسلَّم',
  CONFIRMED_COUNT: 'عدد الطلبات المؤكَّدة',
  SOURCED_COUNT: 'عدد الطلبات التي جلبها',
  DELIVERY_RATE: 'نسبة التسليم',
  CROSS_SELL_UNITS: 'القطع التي أضافها بالمكالمة',
  MULTI_UNIT_ORDERS: 'طلبات وصلت بأكثر من قطعة',
};

export const PERIOD_LABEL_AR: Record<CommissionPeriod, string> = {
  PER_ORDER: 'مع كل طلب',
  DAILY: 'يومي',
  WEEKLY: 'أسبوعي',
  MONTHLY: 'شهري',
};

export const TYPE_LABEL_AR: Record<CommissionType, string> = {
  PERCENT: 'نسبة من قيمة البيع',
  FIXED: 'مبلغ ثابت',
  PER_ORDER: 'مبلغ لكل طلب',
};

/**
 * One band of a rule.
 *
 * `to` null means "and upwards". `label` is the seller's own words for the
 * band, kept on the entry so a figure on a payslip can be read back.
 */
export interface Tier {
  from: number;
  to: number | null;
  value: number;
  label?: string;
}

/** A tier list, or null when the rule is a single value. */
export function parseTiers(raw: unknown): Tier[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const tiers: Tier[] = [];
  for (const t of raw) {
    if (!t || typeof t !== 'object') return null;
    const { from, to, value, label } = t as Record<string, unknown>;
    if (typeof from !== 'number' || typeof value !== 'number') return null;
    if (to !== null && to !== undefined && typeof to !== 'number') return null;
    tiers.push({ from, to: (to as number) ?? null, value, label: typeof label === 'string' ? label : undefined });
  }
  return tiers.sort((a, b) => a.from - b.from);
}

/**
 * Bands that cannot be read two ways.
 *
 * An overlap is not a formatting problem: "100–200 pays 1" and "150–250 pays
 * 2" means somebody at 160 earns whichever band the code happened to check
 * first, and the answer changes when the list is reordered.
 */
export function tiersProblem(tiers: Tier[]): string | null {
  if (tiers.length === 0) return 'أضف شريحة واحدة على الأقل';
  const sorted = [...tiers].sort((a, b) => a.from - b.from);
  for (let i = 0; i < sorted.length; i++) {
    const t = sorted[i];
    if (t.from < 0) return 'بداية الشريحة لا تكون سالبة';
    if (t.to !== null && t.to < t.from) return 'نهاية الشريحة قبل بدايتها';
    if (t.value < 0) return 'قيمة الشريحة لا تكون سالبة';
    const next = sorted[i + 1];
    if (!next) continue;
    if (t.to === null) return 'شريحة «فما فوق» يجب أن تكون الأخيرة';
    if (next.from <= t.to) return 'الشرائح متداخلة — لكل رقم شريحة واحدة';
  }
  return null;
}

/** The band a count falls in, or null when it reaches none of them. */
export function tierFor(tiers: Tier[], count: number): Tier | null {
  return tiers.find((t) => count >= t.from && (t.to === null || count <= t.to)) ?? null;
}

export interface EarnedInput {
  type: CommissionType;
  /** The rule's single value, used when it has no tiers. */
  value: number;
  tiers: Tier[] | null;
  /** What the tiers are matched against: orders, units, or a rate. */
  count: number;
  /**
   * How many ORDERS the figure rests on. For a delivery rate these are two
   * different numbers — the rate is 100 and the sample may be two orders —
   * and a minimum must be checked against the sample, never against the
   * rate, or "100% out of two" clears every threshold ever written.
   * Defaults to `count`, which is right for every other metric.
   */
  sample?: number;
  /** The money the percentage applies to. Ignored by the other two types. */
  amount?: number;
  minorUnit: number;
  /** Below this many counted orders the rule pays nothing. */
  minOrders?: number | null;
}

export interface Earned {
  amount: number;
  /** Which band paid it, for the entry — and for a human reading it later. */
  tierLabel: string | null;
  /** Why nothing was earned, when nothing was. */
  reason: 'BELOW_MINIMUM' | 'NO_TIER' | null;
}

/**
 * What a rule pays for a count.
 *
 * PERCENT is of the sale value; FIXED is one amount for reaching the band;
 * PER_ORDER multiplies by the count. A rule with no tiers keeps its single
 * value, which is how every rule written before today still behaves exactly
 * as it did.
 */
export function earnedBy(input: EarnedInput): Earned {
  const { type, tiers, count, amount = 0, minorUnit } = input;

  const sample = input.sample ?? count;
  if (input.minOrders != null && sample < input.minOrders) {
    return { amount: 0, tierLabel: null, reason: 'BELOW_MINIMUM' };
  }

  let value = input.value;
  let tierLabel: string | null = null;
  if (tiers && tiers.length > 0) {
    const tier = tierFor(tiers, count);
    if (!tier) return { amount: 0, tierLabel: null, reason: 'NO_TIER' };
    value = tier.value;
    tierLabel = tier.label ?? `${tier.from}${tier.to === null ? '+' : `–${tier.to}`}`;
  }

  const raw =
    type === 'PERCENT' ? (amount * value) / 100
    : type === 'PER_ORDER' ? value * count
    : value;

  return { amount: roundMinor(Math.max(0, raw), minorUnit), tierLabel, reason: null };
}
