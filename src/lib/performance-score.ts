/**
 * THE SCORE IS A MEASURING TOOL, NOT A FINANCIAL CONTRACT.
 *
 * The weights are FIXED, here, in code, and are never shown as editable
 * fields. That is the whole point: a number whose weights move is a number
 * that cannot be compared with last month's, and the first thing anybody
 * does with a score is compare it with last month's. What the owner may set
 * is the THRESHOLDS — the bar this business considers acceptable — and a
 * threshold deliberately does not enter the arithmetic.
 *
 * Nothing here is ever displayed as one opaque figure. Every band says what
 * it measured, what it was measured against, and what it earned:
 *
 *     نسبة تسليمك ٧٨٪ ← ٢٧ من ٣٥ نقطة
 *
 * A person told "your score is 71" can do nothing with it. A person told
 * which band cost them the points can.
 *
 * And the bands a role cannot possibly earn are not scored at all, rather
 * than scored as zero: a moderator does not work a confirmation queue, and
 * charging them ten points for a response time they never had is a lie the
 * number would carry forever. The card says "out of 90" and means it —
 * which is also why the rank is within a ROLE and never across them.
 */

export type BandKey =
  | 'delivery_rate'
  | 'confirmed_volume'
  | 'issues_rate'
  | 'discount_use'
  | 'response_time'
  | 'cross_sell';

export interface Band {
  key: BandKey;
  ar: string;
  /** Fixed. Not a setting, not a column, not a field on any screen. */
  weight: number;
  /** Less is better. */
  negative?: boolean;
  /** What the raw number is, said plainly under the band in the card. */
  unit: 'rate' | 'count' | 'minutes' | 'share';
}

export const BANDS: Band[] = [
  { key: 'delivery_rate', ar: 'نسبة التسليم', weight: 35, unit: 'rate' },
  { key: 'confirmed_volume', ar: 'حجم المؤكَّد', weight: 20, unit: 'count' },
  { key: 'issues_rate', ar: 'نسبة الإشكالات', weight: 15, negative: true, unit: 'rate' },
  { key: 'discount_use', ar: 'استخدام الخصم', weight: 10, negative: true, unit: 'share' },
  { key: 'response_time', ar: 'زمن الاستجابة', weight: 10, unit: 'minutes' },
  { key: 'cross_sell', ar: 'قطع الكروس سيل', weight: 10, unit: 'count' },
];

export function bandInfo(key: BandKey): Band {
  return BANDS.find((b) => b.key === key)!;
}

/**
 * Which bands a role can actually earn.
 *
 * A confirmation agent does not enter orders, so an entry issue is not
 * theirs — it is raised BY them, against somebody else's work. A moderator
 * never claims from the queue, so there is no claim-to-first-action clock
 * to run. Scoring either as zero would be inventing a failure.
 */
export const BANDS_FOR: Record<string, BandKey[]> = {
  CONFIRMATION_AGENT: ['delivery_rate', 'confirmed_volume', 'discount_use', 'response_time', 'cross_sell'],
  CONFIRMATION_SUPERVISOR: ['delivery_rate', 'confirmed_volume', 'discount_use', 'response_time', 'cross_sell'],
  MODERATOR: ['delivery_rate', 'confirmed_volume', 'issues_rate', 'discount_use', 'cross_sell'],
};

/** A role nobody scored yet earns nothing rather than earning by accident. */
export function bandsForRole(role: string): BandKey[] {
  return BANDS_FOR[role] ?? [];
}

/**
 * The response-time scale, fixed like the weights.
 *
 * In BUSINESS minutes — the ones the company's own calendar counts — so a
 * night, a weekend or a holiday between the claim and the call costs
 * nobody anything. (The confirmation performance route still measures this
 * in wall-clock hours and therefore disagrees; that is an older reading and
 * not the one the score is built on.)
 */
export const FAST_MINUTES = 15;
export const SLOW_MINUTES = 120;

/**
 * How far above the team's own average a person's discounting may drift
 * before the band is spent. Twice the team's habit, not twice some number
 * we invented: what counts as heavy discounting is a fact about this shop.
 */
export const DISCOUNT_TOLERANCE = 2;

export interface BandInput {
  /** The raw number in the band's own unit. Null = nothing was measurable. */
  value: number | null;
  /**
   * What it is measured against, for the bands that need one: the top
   * performer of the same role for a volume, the team average for a share.
   */
  reference?: number | null;
}

export type ScoreInput = Partial<Record<BandKey, BandInput>>;

export interface ScoredBand {
  key: BandKey;
  ar: string;
  weight: number;
  /** Null when this band had nothing to measure — NOT zero. */
  points: number | null;
  value: number | null;
  reference: number | null;
  unit: Band['unit'];
}

export interface ScoreResult {
  /** Null when the sample is too small for any of this to mean anything. */
  total: number | null;
  /** The weights that actually applied. The card says "out of" this. */
  possible: number;
  bands: ScoredBand[];
  sample: number;
  minSample: number;
  reason: 'BELOW_MINIMUM' | null;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/**
 * One band's points, or null when it could not be measured.
 *
 * Every mapping here is linear and every constant is above, because a band
 * whose curve nobody can restate in a sentence is a band an employee cannot
 * argue with — and being able to argue with it is most of what makes a
 * score fair.
 */
function pointsFor(key: BandKey, input: BandInput | undefined, weight: number): number | null {
  if (!input || input.value === null || !Number.isFinite(input.value)) return null;
  const value = input.value;
  const reference = input.reference ?? null;

  switch (key) {
    // The rate IS the fraction of the band: 78% of 35 is 27.
    case 'delivery_rate':
      return clamp(value, 0, 1) * weight;

    // Nothing left unresolved is full marks.
    case 'issues_rate':
      return (1 - clamp(value, 0, 1)) * weight;

    // A volume has no natural ceiling, so it is read against the best in
    // the same role and store. Alone in a role, you are the best — which is
    // true, and harmless in a measuring tool.
    case 'confirmed_volume':
    case 'cross_sell':
      if (reference === null || reference <= 0) return value > 0 ? weight : null;
      return clamp(value / reference, 0, 1) * weight;

    // At or below the team's own habit is full marks; twice it is nothing.
    case 'discount_use': {
      if (reference === null || reference <= 0) return value > 0 ? 0 : weight;
      return clamp(DISCOUNT_TOLERANCE - value / reference, 0, 1) * weight;
    }

    case 'response_time': {
      if (value <= FAST_MINUTES) return weight;
      if (value >= SLOW_MINUTES) return 0;
      return ((SLOW_MINUTES - value) / (SLOW_MINUTES - FAST_MINUTES)) * weight;
    }
  }
}

/**
 * The score, band by band.
 *
 * The total is the sum of the ROUNDED bands, not the rounded sum: a card
 * whose lines do not add up to its headline is a card nobody believes,
 * and being believed is the entire job of this number.
 */
export function scoreOf(
  role: string,
  input: ScoreInput,
  opts: { sample: number; minSample: number }
): ScoreResult {
  const keys = bandsForRole(role);
  const bands: ScoredBand[] = keys.map((key) => {
    const band = bandInfo(key);
    const raw = pointsFor(key, input[key], band.weight);
    return {
      key,
      ar: band.ar,
      weight: band.weight,
      points: raw === null ? null : Math.round(raw),
      value: input[key]?.value ?? null,
      reference: input[key]?.reference ?? null,
      unit: band.unit,
    };
  });

  // Below the bar, no number at all. A delivery rate out of four orders is
  // noise, and a noisy score shown once is believed for a month.
  if (opts.sample < opts.minSample) {
    return { total: null, possible: 0, bands, sample: opts.sample, minSample: opts.minSample, reason: 'BELOW_MINIMUM' };
  }

  const scored = bands.filter((b) => b.points !== null);
  return {
    total: scored.reduce((s, b) => s + (b.points ?? 0), 0),
    possible: scored.reduce((s, b) => s + b.weight, 0),
    bands,
    sample: opts.sample,
    minSample: opts.minSample,
    reason: null,
  };
}
