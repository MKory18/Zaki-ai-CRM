import { rateOf } from './order-state';
import { trustOf, type Trust } from './cod-vitals';

/**
 * WHICH DOOR BRINGS MONEY THAT LANDS — NOT WHICH DOOR BRINGS THE MOST NOISE.
 *
 * The channels screen ranked by `sortOrder, name` and printed one figure
 * per row: the order count and its share of the total. Measured on the live
 * database, that ranking says الشيت is the business — 149 of 171 orders,
 * 87% — and says nothing at all about the fact that 30 of its parcels came
 * back. A channel bringing a hundred orders of which forty return is worse
 * than one bringing thirty that all land, and a screen that sorts by volume
 * cannot express that sentence.
 *
 * WHY THIS IS NOT `performance-score.ts`. That engine scores PEOPLE: its
 * `BandKey` is a closed union of six employee metrics, `BANDS_FOR` is keyed
 * by job role, and `pointsFor` switches on those six keys. Scoring a door
 * through it would mean inventing a role called «channel» and adding
 * channel bands to a people engine — and `bandsForRole` returns nothing for
 * a role it does not know, so it would silently score every channel out of
 * zero. Different subject, separate engine.
 *
 * WHAT IS BORROWED INSTEAD IS EVERY CONVENTION, deliberately, so the two
 * read as one idea:
 *
 *   the weights are FIXED in code and are never editable fields, because a
 *   number whose weights move cannot be compared with last month's;
 *
 *   a band that could not be measured scores NULL, never zero, and drops
 *   out of the total the card is «out of» — so a score reads «62 من 85» and
 *   the missing twenty points name themselves;
 *
 *   below the sample floor there is no number at all, because a delivery
 *   rate over four orders is noise and a noisy score shown once is believed
 *   for a month.
 *
 * AND ONE BAND ON THIS DATA CANNOT BE MEASURED AT ALL. The owner asked
 * which channel produces DELIVERED, COLLECTED money. Delivered, this can
 * answer. Collected, it cannot: of 119 delivered orders, ZERO have ever
 * been marked settled or collected — every one is still PENDING_COLLECTION.
 * So `collection_rate` is declared, refused, and says so, rather than
 * scoring every channel zero and ranking them by a tie.
 */

export type ChannelBandKey =
  | 'delivery_rate'
  | 'return_rate'
  | 'confirmation_rate'
  | 'collection_rate'
  | 'delivered_value';

export interface ChannelBand {
  key: ChannelBandKey;
  ar: string;
  /** Fixed. Not a setting, not a column, not a field on any screen. */
  weight: number;
  /** Less is better. */
  negative?: boolean;
  /**
   * `rate` values are whole-number percentages, 0..100 — the unit `rateOf`
   * already produces everywhere in this system. Converting at the boundary
   * instead would put a division by a hundred in every caller, and the one
   * that forgot it would score a channel at 0.74 out of 35.
   */
  unit: 'rate' | 'money';
}

/**
 * THE BANDS, AND WHY EACH ONE EARNS WHAT IT DOES.
 *
 *   DELIVERY 35 — the heaviest, because it is the owner's actual question:
 *   of what this door brought and we agreed to send, how much reached a
 *   customer.
 *
 *   RETURN 20 — the loss billed twice, out and back. Weighted apart from
 *   delivery rather than folded into it because the two denominators differ:
 *   delivery is out of what was CONFIRMED, so a parcel still in a van
 *   counts against it, while a return is out of what the door has actually
 *   FINISHED with. A channel can deliver well and still return heavily.
 *
 *   CONFIRMATION 20 — whether the door brings real people or junk numbers.
 *   This is the cheap filter: a refusal on the phone costs a call, and a
 *   refusal at the door costs two courier fees.
 *
 *   COLLECTION 15 — whether the money came back to us. Unmeasurable on this
 *   database, and it keeps its weight anyway so that the day somebody
 *   settles a statement the score gets stricter rather than changing shape.
 *
 *   VALUE 10 — what one DELIVERED order from this door is worth, against
 *   the best door in the shop. The lightest, because a small basket is a
 *   product decision more than a channel one — but it is here because
 *   thirty orders at forty beats a hundred and forty-nine at twenty, and
 *   nothing on the old screen could say that.
 */
export const CHANNEL_BANDS: readonly ChannelBand[] = [
  { key: 'delivery_rate', ar: 'نسبة التسليم', weight: 35, unit: 'rate' },
  { key: 'return_rate', ar: 'نسبة الإرجاع', weight: 20, negative: true, unit: 'rate' },
  { key: 'confirmation_rate', ar: 'نسبة التأكيد', weight: 20, unit: 'rate' },
  { key: 'collection_rate', ar: 'نسبة التحصيل', weight: 15, unit: 'rate' },
  { key: 'delivered_value', ar: 'قيمة الطلب المسلَّم', weight: 10, unit: 'money' },
];

export function channelBand(key: ChannelBandKey): ChannelBand {
  return CHANNEL_BANDS.find((b) => b.key === key)!;
}

/**
 * The floor under the whole score.
 *
 * Ten, matching the floor `health.ts` puts under every rate it judges —
 * deliberately the same number, because a channel whose delivery rate
 * `health.ts` refuses to grade must not be handed a score built mostly out
 * of that same rate.
 */
export const MIN_CONFIRMED = 10;

export interface ChannelBandInput {
  /** The raw figure in the band's own unit. Null = nothing was measurable. */
  value: number | null;
  /** What it is measured against, for the bands that need one. */
  reference?: number | null;
}

export type ChannelScoreInput = Partial<Record<ChannelBandKey, ChannelBandInput>>;

export interface ScoredChannelBand {
  key: ChannelBandKey;
  ar: string;
  weight: number;
  /** Null when this band had nothing to measure — NOT zero. */
  points: number | null;
  value: number | null;
  reference: number | null;
  unit: ChannelBand['unit'];
  negative: boolean;
}

export interface ChannelScore {
  /** Null when the sample is too small for any of this to mean anything. */
  total: number | null;
  /** The weights that actually applied. The row says «out of» this. */
  possible: number;
  bands: ScoredChannelBand[];
  /** Orders confirmed — the denominator of the heaviest band. */
  sample: number;
  minSample: number;
  reason: 'BELOW_MINIMUM' | null;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/**
 * One band's points, or null when it could not be measured.
 *
 * Every mapping is linear and every constant is above, because a band whose
 * curve nobody can restate in a sentence is a band the owner cannot argue
 * with — and being able to argue with it is most of what makes a grade
 * worth showing.
 */
function pointsFor(key: ChannelBandKey, input: ChannelBandInput | undefined, weight: number): number | null {
  if (!input || input.value === null || !Number.isFinite(input.value)) return null;
  const value = input.value;
  const reference = input.reference ?? null;

  switch (key) {
    // The rate IS the fraction of the band: 74% of 35 is 26.
    case 'delivery_rate':
    case 'confirmation_rate':
    case 'collection_rate':
      return (clamp(value, 0, 100) / 100) * weight;

    // Nothing coming back is full marks.
    case 'return_rate':
      return (1 - clamp(value, 0, 100) / 100) * weight;

    /**
     * Money has no natural ceiling, so it is read against the best door in
     * the same shop. Alone, you are the best — which is true, and harmless
     * in a measuring tool. A door that delivered nothing has no basket to
     * measure and scores null rather than zero.
     */
    case 'delivered_value':
      if (value <= 0) return null;
      if (reference === null || reference <= 0) return weight;
      return clamp(value / reference, 0, 1) * weight;
  }
}

/**
 * The score, band by band.
 *
 * The total is the sum of the ROUNDED bands, not the rounded sum: a row
 * whose parts do not add up to its headline is a row nobody believes, and
 * being believed is the entire job of this number.
 */
export function scoreChannel(input: ChannelScoreInput, opts: { sample: number; minSample?: number }): ChannelScore {
  const minSample = opts.minSample ?? MIN_CONFIRMED;
  const sample = Number.isFinite(opts.sample) && opts.sample > 0 ? Math.floor(opts.sample) : 0;

  const bands: ScoredChannelBand[] = CHANNEL_BANDS.map((band) => {
    const raw = pointsFor(band.key, input[band.key], band.weight);
    return {
      key: band.key,
      ar: band.ar,
      weight: band.weight,
      points: raw === null ? null : Math.round(raw),
      value: input[band.key]?.value ?? null,
      reference: input[band.key]?.reference ?? null,
      unit: band.unit,
      negative: band.negative ?? false,
    };
  });

  // Below the bar, no number at all. Measured: three of this shop's four
  // channels have 4, 2 and 1 confirmed orders, and a score for any of them
  // would be a coin toss with a reason attached.
  if (sample < minSample) {
    return { total: null, possible: 0, bands, sample, minSample, reason: 'BELOW_MINIMUM' };
  }

  const scored = bands.filter((b) => b.points !== null);
  return {
    total: scored.reduce((s, b) => s + (b.points ?? 0), 0),
    possible: scored.reduce((s, b) => s + b.weight, 0),
    bands,
    sample,
    minSample,
    reason: null,
  };
}

/**
 * WHY A CHANNEL HAS NO SCORE, IN A SENTENCE THE OWNER CAN ACT ON.
 *
 * «لا يكفي» on its own invites the reader to assume the channel is bad. The
 * count and the floor together say the opposite: nothing is wrong with the
 * channel, there is simply not enough of it yet.
 */
export function whyNoScore(score: ChannelScore): string | null {
  if (score.reason !== 'BELOW_MINIMUM') return null;
  return `${score.sample} طلب مؤكد فقط — تحت ${score.minSample}، والحكم على عيّنةٍ بهذا الصغر تخمين.`;
}

/**
 * WHETHER «COLLECTED» MAY BE SCORED AT ALL, FOR THE WHOLE SHOP.
 *
 * Asked once over every delivered order rather than per channel, because
 * the answer is a fact about the settlement process and not about any one
 * door: if nobody in this shop has ever matched a courier statement, then
 * no channel's collection rate means anything, and four channels each
 * scoring zero would rank them by a tie and call it a finding.
 *
 * The gate is `trustOf` — the same one that refuses the profit margin when
 * the cost field is empty. Same question in a different column: is the
 * field this figure rests on actually written.
 */
export function collectionTrust(collected: number, delivered: number): Trust {
  return trustOf({ present: collected, population: delivered, subject: 'التحصيل' });
}

/**
 * The share of a shop's orders that carry no channel at all.
 *
 * Measured: 14 of 171. Small, and it must still be a ROW on the screen
 * rather than a silent omission, because every share on that screen is a
 * share of a total — and a total that quietly excludes a fourteen-order
 * bucket makes every other row look bigger than it is.
 */
export function unattributedShare(withoutChannel: number, total: number): number | null {
  return rateOf(withoutChannel, total);
}
