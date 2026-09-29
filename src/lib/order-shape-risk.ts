import type { RiskTier } from './customer-risk';

/**
 * WHY THIS SHAPE OF ORDER COMES BACK — and which of its parts can still change.
 *
 * ── WHAT THIS EXISTS FOR ──
 *
 * The courier's statements for صحة بلس over 23/08→26/09/2026 hold **4543
 * shipments in 28 statements**, and they say something the order screens do
 * not: **1353 of them came back — 29.8%.** Nothing in this system was
 * measuring why, so nobody could act on it at the one moment it is still
 * cheap to act: while the agent is on the phone, before a waybill exists.
 *
 * ── WHAT THE MEASUREMENT SAID, AND WHAT IT DID NOT ──
 *
 * Measured from those 4543 rows:
 *
 *   units on the order   1 unit  → 33.1% back (3488 shipments)
 *                        2 units → 25.4% back (193)
 *                        3 units → 17.8% back (850)
 *   payment              cash      → 31.2% back (4338)
 *                        شام كاش   →  0.0% back (195, not one of them)
 *   product              كريم إزالة الندبات → 39.0% back (1529)
 *                        ماء الكمأ          → 23.0% back (1784)
 *   governorate          القنيطرة → 57% (14) · درعا → 35.3% (235)
 *                        طرطوس   → 18.7% (187)
 *
 * The units effect **holds inside a single product**, so it is not the
 * product mix wearing a disguise: ماء الكمأ returns 27.7% as one unit and
 * 17.2% as three; كريم إزالة الندبات returns 40.8% as one and 22.0% as
 * three. That is the largest lever in the file and the report does not
 * mention it.
 *
 * ── WHY IT DOES NOT MULTIPLY THEM TOGETHER ──
 *
 * A joint model over product × units × governorate × payment needs a sample
 * per cell, and the cells run out fast: the biggest three-way cell in 4543
 * rows holds fewer than 200 shipments and most hold single digits. So this
 * does not invent a combined probability. It reports each DIMENSION on its
 * own against the shop's own rate, says which ones are worse, and refuses
 * any dimension whose sample cannot carry it. A number built by multiplying
 * four rates measured on overlapping populations is a guess wearing four
 * decimal places.
 *
 * ── AND IT ONLY SPEAKS WHEN THE DIFFERENCE IS REAL ──
 *
 * Every claim goes through a two-proportion z test. «حمص» returning 33.7%
 * against a shop rate of 29.8% is 43 shipments' worth of noise on a bad
 * week; «شام كاش» returning 0 of 195 against 31.2% is not. One formula
 * decides, and it is tested against the real figures.
 *
 * Pure: no database, no clock, no I/O. It is handed counts and returns
 * sentences. The route does the counting, so no screen can compute a
 * return rate of its own beside this one.
 */

/** A counted segment: how many shipments, and how many came back. */
export interface SegmentOutcome {
  shipments: number;
  returned: number;
}

/**
 * THE FLOOR UNDER A RATE THAT CHANGES WHAT SOMEBODY SAYS TO A CUSTOMER.
 *
 * The repo's usual floor is 10 (`health.ts`), and 10 is right for a figure
 * a manager reads on a dashboard. It is not enough for a sentence an agent
 * repeats to a customer on the phone: at 10 shipments a 30% rate cannot be
 * told apart from a 60% one. 30 is the point at which the measured segments
 * start separating — the smallest pair worth acting on in the real data is
 * كريم إزالة الندبات at three units, 50 shipments, 22.0% against 40.8%.
 */
export const MIN_SEGMENT_SHIPMENTS = 30;

/** A lever is advice, so it carries a heavier floor than an observation. */
export const MIN_LEVER_SHIPMENTS = 50;

/** Below this many shipments shop-wide there is no shop rate to compare to. */
export const MIN_SHOP_SHIPMENTS = 100;

/**
 * TWO PROPORTIONS, AND WHETHER THEY ARE ACTUALLY DIFFERENT.
 *
 * The pooled two-proportion z. Returns null when either side is empty —
 * there is nothing to compare, which is not the same as «no difference».
 */
export function separation(a: SegmentOutcome, b: SegmentOutcome): number | null {
  if (a.shipments <= 0 || b.shipments <= 0) return null;
  const p1 = a.returned / a.shipments;
  const p2 = b.returned / b.shipments;
  const pooled = (a.returned + b.returned) / (a.shipments + b.shipments);
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / a.shipments + 1 / b.shipments));
  if (se === 0) return null;
  return (p1 - p2) / se;
}

/** Two standard errors: the usual bar, and the one this rule is tested at. */
export const MIN_Z = 2;

/** True when the two rates differ by more than noise. */
export function differs(a: SegmentOutcome, b: SegmentOutcome): boolean {
  const z = separation(a, b);
  return z !== null && Math.abs(z) >= MIN_Z;
}

/** The dimensions of an order that can be measured against the shop. */
export type ShapeDimension = 'product' | 'units' | 'region' | 'payment';

export const DIMENSION_AR: Record<ShapeDimension, string> = {
  product: 'المنتج',
  units: 'عدد القطع',
  region: 'المحافظة',
  payment: 'طريقة الدفع',
};

export interface Driver {
  dimension: ShapeDimension;
  /** What this order's value of that dimension is, in words. */
  label: string;
  rate: number;
  shipments: number;
  /** Positive when this shape comes back MORE often than the shop does. */
  points: number;
  z: number;
  /** One sentence, ready to print. */
  why: string;
}

export interface Lever {
  dimension: ShapeDimension;
  /** From this value of the dimension, to that one. */
  from: string;
  to: string;
  rateFrom: number;
  rateTo: number;
  /** How many points of return rate the change is worth. Always positive. */
  points: number;
  z: number;
  why: string;
}

export interface ShapeRisk {
  /** Null when the record cannot carry a verdict at all. */
  verdict: RiskTier | null;
  /** The shop's own return rate over the same window, or null. */
  shopRate: number | null;
  shopShipments: number;
  /** Every dimension that differs from the shop, worst first. */
  drivers: Driver[];
  /** Changes still available on this order, biggest gain first. */
  levers: Lever[];
  /** Why there is no verdict, when there is none. */
  why: string;
}

const pct = (r: number) => `${Math.round(r * 1000) / 10}%`;

/**
 * A FRACTION, NOT `rateOf`.
 *
 * `order-state.rateOf` is the shop's display rounder: it answers a whole
 * percent, which is right on a dashboard and wrong here. Rounding 33.06% to
 * 33 before a z test throws away the very difference the test is measuring,
 * and a 0.4-point gap would vanish entirely. So this lib works in fractions
 * throughout and rounds once, at the sentence. It keeps `rateOf`'s one
 * decision, though: **null when nothing shipped**, because «no shipments»
 * and «nothing came back» are different facts and a zero would merge them.
 */
function fraction(part: number, whole: number): number | null {
  return whole > 0 ? part / whole : null;
}

export interface DimensionValue {
  /** The value this order has on that dimension, e.g. «3 قطع». */
  label: string;
  outcome: SegmentOutcome;
  /** The other values of the same dimension, for the levers. */
  alternatives?: { label: string; outcome: SegmentOutcome }[];
}

/** What the caller hands in: one entry per dimension it could measure. */
export type ShapeInput = Partial<Record<ShapeDimension, DimensionValue>>;

/**
 * A DRIVER IS A DIMENSION THAT IS WORSE THAN THE SHOP, PROVABLY.
 *
 * Better-than-shop dimensions are reported too, with a negative `points`,
 * because «هذا المنتج أفضل من المعدّل» is why an agent trusts the line that
 * says the next one is worse.
 */
export function driversFor(shape: ShapeInput, shop: SegmentOutcome): Driver[] {
  const shopRate = fraction(shop.returned, shop.shipments);
  if (shopRate === null || shop.shipments < MIN_SHOP_SHIPMENTS) return [];
  const out: Driver[] = [];
  for (const dim of Object.keys(shape) as ShapeDimension[]) {
    const v = shape[dim];
    if (!v || v.outcome.shipments < MIN_SEGMENT_SHIPMENTS) continue;
    /**
     * AGAINST THE REST OF THE SHOP, NOT AGAINST THE SHOP.
     *
     * A segment is INSIDE the shop total, so testing it against that total
     * compares a sample with itself and understates every difference — the
     * more of the shop the segment is, the more it flatters it. Cash is
     * 4338 of 4543 shipments here: measured against the whole it looks a
     * point and a half off, and against the 205 shipments that are not
     * cash it is the difference between 31% coming back and none.
     */
    const rest: SegmentOutcome = {
      shipments: shop.shipments - v.outcome.shipments,
      returned: shop.returned - v.outcome.returned,
    };
    if (rest.shipments < MIN_SEGMENT_SHIPMENTS || rest.returned < 0) continue;
    const z = separation(v.outcome, rest);
    if (z === null || Math.abs(z) < MIN_Z) continue;
    const rate = v.outcome.returned / v.outcome.shipments;
    const restRate = rest.returned / rest.shipments;
    const points = Math.round((rate - restRate) * 1000) / 10;
    out.push({
      dimension: dim,
      label: v.label,
      rate,
      shipments: v.outcome.shipments,
      points,
      z,
      why:
        points > 0
          ? `${v.label}: يرجع ${pct(rate)} من ${v.outcome.shipments} شحنة — مقابل ${pct(restRate)} لبقيّة المتجر`
          : `${v.label}: يرجع ${pct(rate)} من ${v.outcome.shipments} شحنة — أقلّ من ${pct(restRate)} لبقيّة المتجر`,
    });
  }
  return out.sort((a, b) => b.points - a.points);
}

/**
 * A LEVER IS A CHANGE THIS ORDER CAN STILL MAKE, WORTH MEASURED POINTS.
 *
 * Only downward: an alternative that returns MORE often is not advice. And
 * only where both sides clear the lever floor and separate — otherwise the
 * agent is told to change something on the strength of a coin toss.
 */
export function leversFor(shape: ShapeInput): Lever[] {
  const out: Lever[] = [];
  for (const dim of Object.keys(shape) as ShapeDimension[]) {
    const v = shape[dim];
    if (!v || !v.alternatives?.length) continue;
    if (v.outcome.shipments < MIN_LEVER_SHIPMENTS) continue;
    const rateFrom = v.outcome.returned / v.outcome.shipments;
    for (const alt of v.alternatives) {
      if (alt.outcome.shipments < MIN_LEVER_SHIPMENTS) continue;
      const rateTo = alt.outcome.returned / alt.outcome.shipments;
      if (rateTo >= rateFrom) continue;
      const z = separation(v.outcome, alt.outcome);
      if (z === null || Math.abs(z) < MIN_Z) continue;
      out.push({
        dimension: dim,
        from: v.label,
        to: alt.label,
        rateFrom,
        rateTo,
        points: Math.round((rateFrom - rateTo) * 1000) / 10,
        z,
        why: `${alt.label} بدل ${v.label}: يرجع ${pct(rateTo)} من ${alt.outcome.shipments} شحنة مقابل ${pct(rateFrom)}`,
      });
    }
  }
  return out.sort((a, b) => b.points - a.points);
}

/**
 * THE VERDICT, AND THE THREE WAYS IT STAYS SILENT.
 *
 * Silence is the commonest correct answer on a young shop, and it is said
 * in words rather than as a green chip that means «we have no idea».
 */
export function shapeRisk(shape: ShapeInput, shop: SegmentOutcome): ShapeRisk {
  const shopRate = fraction(shop.returned, shop.shipments);
  const base: Omit<ShapeRisk, 'verdict' | 'why'> = {
    shopRate,
    shopShipments: shop.shipments,
    drivers: [],
    levers: [],
  };
  if (shopRate === null || shop.shipments < MIN_SHOP_SHIPMENTS) {
    return {
      ...base,
      verdict: null,
      why: `لا يكفي السجلّ: ${shop.shipments} شحنة، والحدّ ${MIN_SHOP_SHIPMENTS} — لا معدّل للمتجر يُقاس عليه بعد`,
    };
  }
  const drivers = driversFor(shape, shop);
  const levers = leversFor(shape);
  const worst = drivers.find((d) => d.points > 0) ?? null;
  if (!worst) {
    return {
      ...base,
      drivers,
      levers,
      verdict: 'SAFE',
      why: `لا شيء في شكل هذا الطلب يرجع أكثر من معدّل المتجر ${pct(shopRate)}`,
    };
  }
  /**
   * TEN POINTS, NOT A RATIO. A shop returning 30% and a shop returning 3%
   * both have shapes that double their rate, and doubling 3% is not a
   * reason to ask for prepayment. What an agent can act on is «ten in a
   * hundred more than usual», which is the same size of problem in both.
   */
  const verdict: RiskTier = worst.points >= 10 ? 'HIGH' : 'WATCH';
  return {
    ...base,
    drivers,
    levers,
    verdict,
    why: worst.why,
  };
}
