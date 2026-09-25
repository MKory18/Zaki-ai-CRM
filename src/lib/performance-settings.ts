import { updateCompanySettings } from './company-settings';
import { db } from './db';

/**
 * WHAT THE OWNER MAY SET, AND WHAT THEY MAY NOT.
 *
 * They may not touch a weight. The weights live in performance-score.ts
 * because a score whose weights move cannot be compared with last month's,
 * and comparing with last month is the only thing anybody ever does with a
 * score.
 *
 * What they set is the BAR — what this business calls an acceptable
 * delivery rate, how many entry problems it will tolerate, how small a
 * sample it refuses to judge anybody on, and whether it looks at a week or
 * a month. A bar is a judgement about this shop. A weight is a definition
 * of the measurement itself.
 *
 * The thresholds deliberately do not enter the arithmetic. They colour the
 * line and they answer "is this person below the bar" — which is a question
 * with a yes and a no, not a question with points.
 */

export type ScorePeriod = 'WEEKLY' | 'MONTHLY';

export interface PerformanceSettings {
  /** Below this, the delivery band is marked as under the bar. 0..1 */
  deliveryRateBar: number;
  /** Above this, the issues band is marked as over the bar. 0..1 */
  issuesRateBar: number;
  /**
   * Fewer orders than this and no score is produced at all.
   *
   * Not the same number as a commission rule's `minSampleOrders`: that one
   * sits on a rule and gates MONEY for that rule alone. This gates a
   * measurement, for everybody, and an owner may reasonably want a lower
   * bar to talk to somebody than to pay them.
   */
  minSample: number;
  /** The window the score is computed over. */
  period: ScorePeriod;
}

export const DEFAULT_PERFORMANCE: PerformanceSettings = {
  deliveryRateBar: 0.6,
  issuesRateBar: 0.1,
  minSample: 10,
  period: 'MONTHLY',
};

const between = (n: unknown, lo: number, hi: number, fallback: number): number =>
  typeof n === 'number' && Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;

/**
 * A stored block as this build understands it.
 *
 * A value out of range is clamped rather than refused: these arrive from a
 * form, and a settings row that throws takes every performance card in the
 * company down with it.
 */
export function parsePerformance(raw: unknown): PerformanceSettings {
  const o = (raw ?? {}) as Record<string, unknown>;
  return {
    deliveryRateBar: between(o.deliveryRateBar, 0, 1, DEFAULT_PERFORMANCE.deliveryRateBar),
    issuesRateBar: between(o.issuesRateBar, 0, 1, DEFAULT_PERFORMANCE.issuesRateBar),
    minSample: Math.round(between(o.minSample, 1, 1000, DEFAULT_PERFORMANCE.minSample)),
    period: o.period === 'WEEKLY' ? 'WEEKLY' : DEFAULT_PERFORMANCE.period,
  };
}

export async function performanceSettings(companyId: string): Promise<PerformanceSettings> {
  const company = await db.company.findUnique({ where: { id: companyId }, select: { settings: true } });
  try {
    return parsePerformance((company?.settings ? JSON.parse(company.settings) : {}).performance);
  } catch {
    // A broken settings blob must not take the performance card down.
    return { ...DEFAULT_PERFORMANCE };
  }
}

export async function savePerformanceSettings(
  companyId: string,
  input: unknown
): Promise<PerformanceSettings> {
  const next = parsePerformance(input);
  // Only this key, under a row lock — never the whole document from a read
  // that another save may already have overtaken.
  await updateCompanySettings<PerformanceSettings>(companyId, 'performance', () => next);
  return next;
}
