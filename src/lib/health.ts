/**
 * «جيّد» و«سيّئ» — ومعناهما واحدٌ في كلّ شاشة.
 *
 * A screen full of percentages asks every reader to carry the bar in their
 * head: is 62% confirmation good? Is a 14% margin? The owner knows; the
 * agent who opened the screen this morning does not, and neither does the
 * owner at the end of a long day. So every figure that has a bar says which
 * side of it it is on, in one word, in the same word everywhere.
 *
 * ONE VERDICT ENGINE, NOT ONE PER SCREEN. If «جيّد» on the dashboard and
 * «جيّد» on the couriers screen come from two pieces of arithmetic, they
 * stop meaning the same thing the first time either is touched — and a
 * verdict that means something different in two places is worse than no
 * verdict, because it is believed.
 *
 * THE BAR IS THE OWNER'S, THE SHAPE IS NOT. This is the rule
 * `performance-settings.ts` already set for people, and it is right for the
 * business too: what counts as an acceptable delivery rate is a judgement
 * about this shop, and whether «below the bar» means red is not.
 *
 * AND A VERDICT WITHOUT A SAMPLE IS A GUESS. Three orders cannot tell you
 * whether a courier is good. Below the floor the answer is «لا يكفي» — said
 * out loud, never dressed up as a grey «متوسط».
 */

export const HEALTH_TONES = ['good', 'ok', 'bad', 'unknown'] as const;
export type HealthTone = (typeof HEALTH_TONES)[number];

export const HEALTH_AR: Record<HealthTone, string> = {
  good: 'جيّد',
  ok: 'مقبول',
  bad: 'ضعيف',
  unknown: 'لا يكفي',
};

export interface Health {
  tone: HealthTone;
  /** The one word, for the chip. */
  label: string;
  /** Why it says that, for the line under it — never left to be inferred. */
  why: string;
}

/**
 * A metric with a bar: what it is called, which way is better, and where
 * the two lines sit.
 *
 * `good` and `ok` are the two lines, always in the metric's own unit — a
 * percentage as 0..100, money as money, days as days. Whether higher or
 * lower is better is the metric's own fact, not the caller's to remember.
 */
export interface Metric {
  key: string;
  ar: string;
  /** Lower values are better — days late, rejection rate, cost. */
  lowerIsBetter?: boolean;
  /** At or past this: جيّد. */
  good: number;
  /** At or past this: مقبول. Short of it: ضعيف. */
  ok: number;
  /** How to say the value back in the reason. */
  unit: 'percent' | 'count' | 'days' | 'money';
  /** Fewer observations than this and no verdict is given at all. */
  minSample?: number;
}

/**
 * THE BARS, IN ONE PLACE.
 *
 * Defaults, not laws: `METRICS` is what a shop starts with, and the owner's
 * own numbers override the two lines through `withBars` below. They are set
 * where every business already has an opinion and nowhere else — inventing
 * a bar for a figure nobody has a target for would be a verdict dressed as
 * a measurement.
 */
export const METRICS: readonly Metric[] = [
  { key: 'confirmationRate', ar: 'نسبة التأكيد', good: 70, ok: 50, unit: 'percent', minSample: 10 },
  { key: 'deliveryRate', ar: 'نسبة التسليم', good: 80, ok: 60, unit: 'percent', minSample: 10 },
  { key: 'profitMargin', ar: 'هامش الربح', good: 25, ok: 12, unit: 'percent' },
  { key: 'rejectionRate', ar: 'نسبة الرفض', lowerIsBetter: true, good: 15, ok: 30, unit: 'percent', minSample: 10 },
  { key: 'returnRate', ar: 'نسبة الإرجاع', lowerIsBetter: true, good: 8, ok: 15, unit: 'percent', minSample: 10 },
  { key: 'lateRate', ar: 'نسبة التأخير', lowerIsBetter: true, good: 10, ok: 20, unit: 'percent', minSample: 10 },
  { key: 'daysInTransit', ar: 'أيام الطريق', lowerIsBetter: true, good: 3, ok: 5, unit: 'days', minSample: 5 },
  { key: 'discountShare', ar: 'نسبة الخصم من السعر', lowerIsBetter: true, good: 5, ok: 12, unit: 'percent' },
  { key: 'roas', ar: 'عائد الإنفاق الإعلاني', good: 3, ok: 1.5, unit: 'count', minSample: 5 },
];

export function metric(key: string): Metric | undefined {
  return METRICS.find((m) => m.key === key);
}

/** The owner's bars over the defaults, for the metrics they have set. */
export function withBars(m: Metric, bars?: Record<string, { good?: number; ok?: number }> | null): Metric {
  const set = bars?.[m.key];
  if (!set) return m;
  return {
    ...m,
    good: typeof set.good === 'number' && Number.isFinite(set.good) ? set.good : m.good,
    ok: typeof set.ok === 'number' && Number.isFinite(set.ok) ? set.ok : m.ok,
  };
}

const say = (value: number, unit: Metric['unit']): string => {
  const n = Math.round(value * 10) / 10;
  if (unit === 'percent') return `${n}%`;
  if (unit === 'days') return `${n} يوماً`;
  return String(n);
};

/**
 * THE VERDICT.
 *
 * `sample` is how many observations the value was computed over, and it is
 * the caller's job to pass it honestly: a delivery rate over three parcels
 * is not a delivery rate. Passing nothing means «this figure has no sample»
 * — a margin, a ratio of money — and those are judged without one.
 */
export function health(m: Metric, value: number | null | undefined, sample?: number): Health {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return { tone: 'unknown', label: HEALTH_AR.unknown, why: 'لا رقم لهذه المدّة.' };
  }
  if (m.minSample !== undefined && sample !== undefined && sample < m.minSample) {
    return {
      tone: 'unknown',
      label: HEALTH_AR.unknown,
      why: `${sample} فقط — تحت ${m.minSample}، والحكم على عيّنةٍ بهذا الصغر تخمين.`,
    };
  }

  const better = (a: number, b: number) => (m.lowerIsBetter ? a <= b : a >= b);
  const dir = m.lowerIsBetter ? 'لا يتجاوز' : 'لا يقلّ عن';

  if (better(value, m.good)) {
    return { tone: 'good', label: HEALTH_AR.good, why: `${say(value, m.unit)} — والبار ${dir} ${say(m.good, m.unit)}.` };
  }
  if (better(value, m.ok)) {
    return { tone: 'ok', label: HEALTH_AR.ok, why: `${say(value, m.unit)} — فوق حدّ المقبول ${say(m.ok, m.unit)} ودون ${say(m.good, m.unit)}.` };
  }
  return { tone: 'bad', label: HEALTH_AR.bad, why: `${say(value, m.unit)} — وحدّ المقبول ${dir} ${say(m.ok, m.unit)}.` };
}

/** The same, by key, for a caller that has a name and a number and nothing else. */
export function healthOf(
  key: string,
  value: number | null | undefined,
  sample?: number,
  bars?: Record<string, { good?: number; ok?: number }> | null
): Health {
  const m = metric(key);
  if (!m) return { tone: 'unknown', label: HEALTH_AR.unknown, why: 'لا بار لهذا المؤشّر.' };
  return health(withBars(m, bars), value, sample);
}

/**
 * THE WORST THING ON A SCREEN, WHICH IS THE ONLY ONE WORTH LEADING WITH.
 *
 * A row of six chips is six things to read. What somebody wants on opening
 * a screen is the one that is wrong — and «كلّها جيّدة» when none is.
 */
export function worst(items: readonly { ar: string; health: Health }[]): { ar: string; health: Health } | null {
  const rank: Record<HealthTone, number> = { bad: 0, ok: 1, unknown: 2, good: 3 };
  const sorted = [...items].sort((a, b) => rank[a.health.tone] - rank[b.health.tone]);
  return sorted[0] ?? null;
}
