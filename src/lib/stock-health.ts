import { HEALTH_AR, type Health, type HealthTone } from './health';

/**
 * WHAT EACH LINE OF STOCK IS ACTUALLY DOING — SAID IN ONE WORD.
 *
 * The owner's ask, verbatim: «ارصدة المخزون: تنظيم أكثر — AI + Score.
 * ملاحظات: قارب على الانتهاء يعني، ماشي بطيء… إلخ. يحتاج مخزون. تنبيهات».
 * A screen of 114 cards each showing «دخل / خرج / متبقٍّ» answers a question
 * nobody asks. Nobody wants to know that a product holds 472 units. They
 * want to know whether 472 is too many, too few, or fine — and that is a
 * question about how fast it leaves, which the old screen never asked.
 *
 * «AI» here is NOT a model call and nothing in this file talks to one. The
 * word the owner reached for means «let the screen tell me something instead
 * of making me work it out», and the honest way to do that is arithmetic
 * whose every step can be printed next to the answer. A sentence produced by
 * a model cannot be argued with; «قارب على الانتهاء — 12 وحدة متاحة و1.9
 * تخرج يومياً، أي 6 أيام» can, and being arguable is the point.
 *
 * ONE FUNCTION, TWO READERS. `/api/inventory` computes the verdict and the
 * screen renders it; both import from here. The old shape of this screen had
 * its own opinion inline — `s.remaining > 50 ? 'متوفر' : 'رصيد منخفض'` — a
 * threshold of fifty units applied equally to a product selling eight a day
 * (six days of cover, an emergency) and one selling none at all (fifty units
 * that will never leave, labelled «متوفر» in green). Both readings were
 * wrong, in opposite directions, from the same number.
 *
 * AND A RATE WITHOUT A WINDOW IS A GUESS. Measured on this database on
 * 2026-09-29: the delivered-order record begins 13.4 days ago. Dividing
 * units by 90 because the caller asked for «90 days» reports a product
 * selling 7.7 a day as selling 1.2 a day, and then nothing on the screen is
 * ever urgent. So the window is the record's own depth, clamped to what was
 * asked for, and when the record is shallower than `MIN_LEDGER_DAYS` no rate
 * is stated at all. This is the same discipline the governorate lead times
 * already follow: the number comes from the deliveries, not from a hope.
 */

/**
 * The states, worst to best. Nine, not three, because the three questions a
 * stock row can fail are genuinely different: it can be empty, it can be
 * emptying, it can be full of something that never leaves — and it can be
 * none of those because nobody knows yet.
 */
export const STOCK_STATES = [
  'out',
  'critical',
  'low',
  'moving',
  'slow',
  'idle',
  'no_sales',
  'unstocked',
  'unknown',
] as const;
export type StockState = (typeof STOCK_STATES)[number];

/**
 * The owner's own words wherever he gave them. «قارب على الانتهاء» and
 * «ماشي بطيء» are in his note; they are not paraphrased into «رصيد منخفض»
 * and «حركة ضعيفة», because the label a person recognises is the one they
 * said themselves.
 */
export const STOCK_STATE_AR: Record<StockState, string> = {
  out: 'نفد',
  critical: 'خطير',
  low: 'قارب على الانتهاء',
  moving: 'ماشٍ',
  slow: 'ماشٍ ببطء',
  idle: 'راكد',
  no_sales: 'بلا تسليم مسجَّل',
  unstocked: 'بلا مخزون مسجَّل',
  unknown: HEALTH_AR.unknown,
};

/**
 * The colour, from the one vocabulary the product already paints verdicts
 * with (`health.ts`), so «خطير» here is the same red as «ضعيف» on the
 * couriers screen and a reader learns one scale rather than four.
 *
 * `no_sales` and `unstocked` are deliberately GREY, not amber. They are not
 * mild problems, they are absences of knowledge, and an amber chip on 101
 * products would teach the reader to ignore amber.
 */
export const STOCK_STATE_TONE: Record<StockState, HealthTone> = {
  out: 'bad',
  critical: 'bad',
  low: 'ok',
  moving: 'good',
  slow: 'ok',
  idle: 'bad',
  no_sales: 'unknown',
  unstocked: 'unknown',
  unknown: 'unknown',
};

// ─── THE FLOORS. Every one of these is a refusal to guess. ───

/**
 * How deep the delivered-order record must go before any daily rate is
 * stated. A week is the shortest honest window: below it a single busy
 * Thursday becomes the shop's permanent velocity.
 *
 * MEASURED: this database's record is 13.4 days deep, so rates ARE stated —
 * over 13.4 days, never over 30 or 90.
 */
export const MIN_LEDGER_DAYS = 7;

/**
 * The widest window worth reading. Beyond three months a rate describes a
 * season that has ended.
 */
export const MAX_WINDOW_DAYS = 90;

/**
 * Separate delivered lines a product needs before its rate is stated at all.
 * Units are not the sample — one order of 100 units is ONE observation, and
 * dividing it across a fortnight invents a daily habit out of a single
 * afternoon.
 *
 * MEASURED on this database: lines per selling product are 54, 26, 22, 7, 6,
 * 2, 2. A floor of 5 states a rate for five products and HIDES it for the
 * two with two lines each. Those two rows say «لا يكفي» and show no number,
 * which is the whole rule: a number too thin to trust is removed, not
 * softened.
 */
export const MIN_DELIVERED_LINES = 5;

/**
 * How long a product must hold stock, with the record watching, before zero
 * sales may be called «راكد».
 *
 * This is the floor that cost the most to get right. With a 13-day record,
 * 101 of 114 products have not delivered a single unit — and calling all 101
 * «راكد» would be the biggest lie this screen could tell, because a quiet
 * fortnight and dead stock look identical over thirteen days. Two months of
 * a stocked shelf and not one unit out is dead stock. Thirteen days is a
 * fortnight. So below this floor the row states the FACT («لا تسليم
 * مسجَّلاً خلال 13 يوماً») and withholds the VERDICT.
 */
export const IDLE_WINDOW_DAYS = 60;

/** Days of cover under which the product is an emergency — the owner's «خطيرة». */
export const CRITICAL_COVER_DAYS = 7;
/** Days of cover under which it is the owner's «قارب على الانتهاء». */
export const LOW_COVER_DAYS = 21;
/** Days of cover past which the money is parked — the owner's «ماشي بطيء». */
export const SLOW_COVER_DAYS = 180;

/** A sale this recent and the line is warm. */
export const FRESH_SALE_DAYS = 14;
/** No sale for this long and recency earns nothing. */
export const STALE_SALE_DAYS = 60;

/** What the facts about one product's stock are, before any judgement. */
export interface StockFacts {
  /**
   * Units this store's batches still hold. The SAME figure
   * `reservation.onHand` returns — this file never re-derives it, and the
   * API passes it in from the one sum it already computes.
   */
  onHand: number;
  /**
   * Units already promised to orders that are still open, from
   * `reservation.reservedElsewhere`. Cover is computed on what is left after
   * these, because a unit promised to a confirmed order is not a unit you
   * may promise again.
   */
  reserved: number;
  /** Batches on this product at all. Zero means it has never been stocked. */
  batchCount: number;
  /**
   * Units DELIVERED inside the window — taken at the door, not ordered and
   * not shipped. A shipped parcel that comes back never sold anything, and
   * counting it as velocity orders stock against a sale that did not happen.
   */
  deliveredUnits: number;
  /** How many separate delivered lines those units came from. The sample. */
  deliveredLines: number;
  /** How far back the store's delivered-order record itself goes, in days. */
  ledgerDays: number;
  /** Days since this product last had a unit delivered. Null if never. */
  daysSinceLastSale: number | null;
  /** Days this product has had stock recorded. Null if it never has. */
  daysStocked: number | null;
}

/** One band of the score, with what it measured and what that earned. */
export interface StockBand {
  key: 'cover' | 'recency' | 'committed';
  ar: string;
  weight: number;
  earned: number;
  /** The measured fact, in words, so the band can be read rather than trusted. */
  why: string;
}

export interface StockHealth extends Health {
  state: StockState;
  /** Units a new order may still take: on hand minus what is promised. */
  available: number;
  /** Units a day over the measured window. Null when the sample is too thin. */
  perDay: number | null;
  /** How long `available` lasts at that rate. Null when it cannot be known. */
  coverDays: number | null;
  /** The window the rate was ACTUALLY measured over, never the one asked for. */
  windowDays: number;
  /** 0..100, higher is a healthier position. Null when no band is computable. */
  score: number | null;
  bands: StockBand[];
  /** A «يحتاج مخزون» row — the ones the purchasing list is made of. */
  needsRestock: boolean;
}

/**
 * HOW FAST THIS LEAVES, OR NOTHING.
 *
 * Returns null rather than a small number, and the difference matters: a
 * screen that prints 0.1/day for a product with two delivered lines will be
 * used to decide a purchase order, and nobody looking at the figure can see
 * that it rests on two afternoons. Null renders as «لا يكفي» and no number.
 *
 * A measured ZERO is not a missing number. A product with stock on the shelf
 * and no delivered unit in a window long enough to watch has told you
 * something exact, so `deliveredUnits === 0` returns a rate of zero and is
 * not held to `MIN_DELIVERED_LINES` — there is nothing being estimated.
 */
export function stockVelocity(
  f: StockFacts,
  requestedDays: number = MAX_WINDOW_DAYS
): { perDay: number; windowDays: number } | null {
  // Never wider than the record is deep. This single clamp is the reason the
  // screen can be believed: asked for 90 days against a 13-day record it
  // reports 13, not 90, and so a product selling 7.7 a day reads as 7.7.
  const windowDays = Math.min(Math.max(1, requestedDays), MAX_WINDOW_DAYS, f.ledgerDays);
  if (!Number.isFinite(windowDays) || windowDays < MIN_LEDGER_DAYS) return null;

  if (f.deliveredUnits <= 0) return { perDay: 0, windowDays };
  if (f.deliveredLines < MIN_DELIVERED_LINES) return null;

  return { perDay: f.deliveredUnits / windowDays, windowDays };
}

/** One decimal, because a rate of 7.74 a day is not known to two. */
const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * THE VERDICT.
 *
 * Order matters and is not arbitrary. An empty shelf is empty whatever its
 * velocity, and a product that has never been stocked has not «نفد» — it was
 * never there, and telling a purchaser it ran out sends them looking for a
 * sale that never happened.
 */
export function stockHealth(f: StockFacts, requestedDays: number = MAX_WINDOW_DAYS): StockHealth {
  const available = f.onHand - f.reserved;
  const v = stockVelocity(f, requestedDays);
  const windowDays = v ? v.windowDays : Math.min(Math.max(1, requestedDays), MAX_WINDOW_DAYS, Math.max(0, f.ledgerDays));

  const base = { available, windowDays, perDay: v ? round1(v.perDay) : null };

  // Never stocked at all. Six products on this database have no batch of any
  // kind: no production run, no delivery, no opening count. That is a
  // catalogue entry, not a stock position.
  if (f.batchCount <= 0) {
    return finish({
      ...base,
      state: 'unstocked',
      coverDays: null,
      why: 'لا دفعةَ مخزونٍ واحدةً مسجَّلة — لم يدخل هذا المنتج المخزن بعد، لا بتشغيلة ولا باستلام ولا بجرد افتتاحي.',
      f,
    });
  }

  // Nothing left to promise. Said before velocity is even consulted: how
  // fast it used to sell does not change that there is none.
  if (available <= 0) {
    const promised = f.reserved > 0 ? ` — ${f.onHand} على الرف و${f.reserved} محجوزة لطلبات مفتوحة` : '';
    return finish({
      ...base,
      state: 'out',
      coverDays: 0,
      why: `لا وحدةَ متاحةً لطلبٍ جديد${promised}.`,
      f,
    });
  }

  if (!v) {
    const why =
      f.ledgerDays < MIN_LEDGER_DAYS
        ? `سجل التسليمات لا يعود لأكثر من ${round1(f.ledgerDays)} يوم، و${MIN_LEDGER_DAYS} أيام هي أقلّ ما تُقاس به سرعةُ بيع.`
        : `${f.deliveredLines} تسليمٍ فقط خلال ${round1(windowDays)} يوماً — تحت ${MIN_DELIVERED_LINES}، ومعدَّلٌ يوميٌّ من عيّنةٍ بهذا الصغر تخمين.`;
    return finish({ ...base, state: 'unknown', coverDays: null, why, f });
  }

  if (v.perDay === 0) {
    // A zero only becomes «راكد» when the shelf was watched long enough for
    // the zero to mean something. `daysStocked` guards the other half: goods
    // received yesterday have not failed to sell, they have not been offered.
    const watched = Math.min(windowDays, f.daysStocked ?? 0);
    if (watched >= IDLE_WINDOW_DAYS) {
      return finish({
        ...base,
        state: 'idle',
        coverDays: null,
        why: `${f.onHand} وحدةً على الرف ولا وحدةً واحدةً سُلِّمت خلال ${round1(watched)} يوماً — هذا مالٌ واقف، لا مخزونٌ يُجدَّد.`,
        f,
      });
    }
    return finish({
      ...base,
      state: 'no_sales',
      coverDays: null,
      why: `لا تسليمَ مسجَّلاً خلال ${round1(watched)} يوماً — والسجل نفسه لا يعود لأكثر من ذلك. يحتاج الأمر ${IDLE_WINDOW_DAYS} يوماً على الرف قبل أن يُقال «راكد».`,
      f,
    });
  }

  const coverDays = available / v.perDay;
  const rate = `${round1(v.perDay)} وحدة يومياً (${f.deliveredUnits} خلال ${round1(windowDays)} يوماً)`;

  if (coverDays < CRITICAL_COVER_DAYS) {
    return finish({
      ...base,
      state: 'critical',
      coverDays,
      why: `${available} متاحة و${rate} — تكفي ${round1(coverDays)} يوماً، ودون ${CRITICAL_COVER_DAYS} أيام لا يُدرَك الشراء.`,
      f,
    });
  }
  if (coverDays < LOW_COVER_DAYS) {
    return finish({
      ...base,
      state: 'low',
      coverDays,
      why: `${available} متاحة و${rate} — تكفي ${round1(coverDays)} يوماً، وحدّ الطمأنينة ${LOW_COVER_DAYS} يوماً.`,
      f,
    });
  }
  if (coverDays <= SLOW_COVER_DAYS) {
    return finish({
      ...base,
      state: 'moving',
      coverDays,
      why: `${available} متاحة و${rate} — تكفي ${round1(coverDays)} يوماً، بين ${LOW_COVER_DAYS} و${SLOW_COVER_DAYS}.`,
      f,
    });
  }
  return finish({
    ...base,
    state: 'slow',
    coverDays,
    why: `${available} متاحة و${rate} — تكفي ${Math.round(coverDays)} يوماً، فوق ${SLOW_COVER_DAYS}. الكمية أكبر من الحركة.`,
    f,
  });
}

/** The states a purchasing list is made of — the owner's «يحتاج مخزون». */
const RESTOCK: readonly StockState[] = ['out', 'critical', 'low'];

export function needsRestock(state: StockState): boolean {
  return RESTOCK.includes(state);
}

function finish(input: {
  state: StockState;
  available: number;
  perDay: number | null;
  coverDays: number | null;
  windowDays: number;
  why: string;
  f: StockFacts;
}): StockHealth {
  const bands = scoreBands(input.state, input.coverDays, input.f);
  const score = bands.length === 0 ? null : Math.round(bands.reduce((sum, b) => sum + b.earned, 0));
  return {
    state: input.state,
    tone: STOCK_STATE_TONE[input.state],
    label: STOCK_STATE_AR[input.state],
    why: input.why,
    available: input.available,
    perDay: input.perDay,
    coverDays: input.coverDays === null ? null : round1(input.coverDays),
    windowDays: round1(input.windowDays),
    score,
    bands,
    needsRestock: needsRestock(input.state),
  };
}

/**
 * THE SCORE — AND WHAT IT IS FOR.
 *
 * It is NOT a grade of the product. It is an ORDER: 114 cards have to come
 * out of the screen in some sequence, and nine state words give nine
 * buckets, which leaves the worst of the fifty-two amber ones invisible
 * somewhere in the middle. The score breaks the ties, and it breaks them on
 * measured facts.
 *
 * WEIGHTS ARE FIXED, HERE, IN CODE, and are not a setting — the same rule
 * `performance-score.ts` states for people, for the same reason: a number
 * whose weights move cannot be compared with last month's, and comparing
 * with last month's is the first thing anybody does with a score.
 *
 * Three bands, each from a DIFFERENT measured fact, because a score whose
 * bands all restate one number is that number with extra arithmetic:
 *
 *   cover      — a rate against a stock level. How long you can keep selling.
 *   recency    — a date. Whether it is still selling AT ALL, which a rate
 *                averaged over a window cannot say.
 *   committed  — a share of the shelf. How much of what is there is already
 *                somebody else's.
 *
 * Higher is healthier, so the screen sorts ASCENDING and the worst row is
 * the first one read.
 *
 * AND NO SCORE AT ALL when cover cannot be computed. Fifty-five of the
 * hundred points would be missing, and a 45-point maximum printed as a
 * score out of 100 is a product that scores badly for being unmeasured.
 */
function scoreBands(state: StockState, coverDays: number | null, f: StockFacts): StockBand[] {
  const cover = coverBand(state, coverDays, f);
  if (!cover) return [];
  return [cover, recencyBand(f), committedBand(f)];
}

const COVER_WEIGHT = 55;
const RECENCY_WEIGHT = 25;
const COMMITTED_WEIGHT = 20;

function coverBand(state: StockState, coverDays: number | null, f: StockFacts): StockBand | null {
  const band = (earned: number, why: string): StockBand => ({
    key: 'cover',
    ar: 'مدّة الكفاية',
    weight: COVER_WEIGHT,
    earned: Math.max(0, Math.min(COVER_WEIGHT, earned)),
    why,
  });

  // Stock that never moves has no «days of cover» — it has forever, which is
  // the worst answer, not the best. Scoring it high because the number is
  // large is how an overstock report ends up congratulating the overstock.
  if (state === 'idle') {
    return band(0, `لا حركةَ خلال ${IDLE_WINDOW_DAYS} يوماً أو أكثر — مدّةُ الكفاية لا نهائية، وهذا أسوأ جواب لا أفضله.`);
  }
  // No rate, no cover, no score. Said once, here.
  if (coverDays === null) return null;

  if (coverDays <= 0) return band(0, 'لا وحدةَ متاحة — صفر يوم.');

  if (coverDays <= LOW_COVER_DAYS) {
    // Straight line from nothing at zero days to the full band at the
    // reassurance line. A product with three days of cover should not be
    // scored near one with twenty.
    return band(
      (COVER_WEIGHT * coverDays) / LOW_COVER_DAYS,
      `${round1(coverDays)} يوماً من الكفاية، وحدّ الطمأنينة ${LOW_COVER_DAYS}.`
    );
  }
  if (coverDays <= SLOW_COVER_DAYS) {
    return band(COVER_WEIGHT, `${round1(coverDays)} يوماً من الكفاية — بين ${LOW_COVER_DAYS} و${SLOW_COVER_DAYS}.`);
  }
  // Past the slow line the points fall away, but never to zero: too much
  // stock of something that does sell is a worse position than the right
  // amount and a better one than none.
  const ceiling = SLOW_COVER_DAYS * 4;
  const floor = COVER_WEIGHT * 0.2;
  const over = Math.min(1, (coverDays - SLOW_COVER_DAYS) / (ceiling - SLOW_COVER_DAYS));
  return band(
    COVER_WEIGHT - (COVER_WEIGHT - floor) * over,
    `${Math.round(coverDays)} يوماً من الكفاية — فوق ${SLOW_COVER_DAYS}، والمال واقف في الفائض.`
  );
}

function recencyBand(f: StockFacts): StockBand {
  const band = (earned: number, why: string): StockBand => ({
    key: 'recency',
    ar: 'آخر تسليم',
    weight: RECENCY_WEIGHT,
    earned: Math.max(0, Math.min(RECENCY_WEIGHT, earned)),
    why,
  });

  // A rate averaged over three months cannot tell you the product stopped
  // selling six weeks ago. Only a date can, which is why this band exists
  // separately from cover rather than being folded into it.
  if (f.daysSinceLastSale === null) return band(0, 'لا تسليمَ مسجَّلاً لهذا المنتج قطّ.');
  if (f.daysSinceLastSale <= FRESH_SALE_DAYS) {
    return band(RECENCY_WEIGHT, `آخر تسليم قبل ${round1(f.daysSinceLastSale)} يوماً — خلال ${FRESH_SALE_DAYS} يوماً.`);
  }
  if (f.daysSinceLastSale >= STALE_SALE_DAYS) {
    return band(0, `آخر تسليم قبل ${Math.round(f.daysSinceLastSale)} يوماً — تجاوز ${STALE_SALE_DAYS} يوماً.`);
  }
  const decayed =
    RECENCY_WEIGHT *
    (1 - (f.daysSinceLastSale - FRESH_SALE_DAYS) / (STALE_SALE_DAYS - FRESH_SALE_DAYS));
  return band(decayed, `آخر تسليم قبل ${round1(f.daysSinceLastSale)} يوماً — بين ${FRESH_SALE_DAYS} و${STALE_SALE_DAYS}.`);
}

function committedBand(f: StockFacts): StockBand {
  const band = (earned: number, why: string): StockBand => ({
    key: 'committed',
    ar: 'المحجوز من الرف',
    weight: COMMITTED_WEIGHT,
    earned: Math.max(0, Math.min(COMMITTED_WEIGHT, earned)),
    why,
  });

  if (f.onHand <= 0) return band(0, 'لا وحدةَ على الرف يُحجَز منها.');
  const share = Math.min(1, Math.max(0, f.reserved / f.onHand));
  if (f.reserved <= 0) return band(COMMITTED_WEIGHT, `${f.onHand} على الرف ولا وحدةَ محجوزة لطلبٍ مفتوح.`);
  return band(
    COMMITTED_WEIGHT * (1 - share),
    `${f.reserved} من ${f.onHand} محجوزة لطلباتٍ مفتوحة، أي ${Math.round(share * 100)}%.`
  );
}

// ─── THE ALERTS — the owner's «تنبيهات» ───

export interface StockAlert {
  state: StockState | 'restock';
  ar: string;
  tone: HealthTone;
  count: number;
}

/**
 * WHAT THE SCREEN LEADS WITH.
 *
 * 114 cards is not a screen anybody reads, it is a screen anybody scrolls.
 * The counts go above them, in the order of what would hurt: what is gone,
 * what is going, then what is parked, then what cannot be judged yet.
 *
 * ZEROES ARE DROPPED. «0 نفد» is a line of text that has to be read to find
 * out it says nothing, and four of them push the one that matters off the
 * first screen.
 *
 * The «لا يكفي» count is kept and shown rather than hidden, because the size
 * of what the data cannot answer is itself the finding: on this database
 * that line reads 107 of 114, which tells the owner his sales record is too
 * young to plan purchases from — a far more useful thing to be told than 107
 * invented verdicts.
 */
export function summariseStock(items: readonly { state: StockState }[]): {
  alerts: StockAlert[];
  needsRestock: number;
  graded: number;
  total: number;
} {
  const count = (s: StockState) => items.filter((i) => i.state === s).length;
  const restock = items.filter((i) => needsRestock(i.state)).length;

  const ordered: StockAlert[] = [
    { state: 'restock', ar: 'يحتاج مخزون', tone: 'bad', count: restock },
    { state: 'out', ar: STOCK_STATE_AR.out, tone: STOCK_STATE_TONE.out, count: count('out') },
    { state: 'critical', ar: STOCK_STATE_AR.critical, tone: STOCK_STATE_TONE.critical, count: count('critical') },
    { state: 'low', ar: STOCK_STATE_AR.low, tone: STOCK_STATE_TONE.low, count: count('low') },
    { state: 'idle', ar: STOCK_STATE_AR.idle, tone: STOCK_STATE_TONE.idle, count: count('idle') },
    { state: 'slow', ar: STOCK_STATE_AR.slow, tone: STOCK_STATE_TONE.slow, count: count('slow') },
    { state: 'moving', ar: STOCK_STATE_AR.moving, tone: STOCK_STATE_TONE.moving, count: count('moving') },
    { state: 'no_sales', ar: STOCK_STATE_AR.no_sales, tone: STOCK_STATE_TONE.no_sales, count: count('no_sales') },
    { state: 'unstocked', ar: STOCK_STATE_AR.unstocked, tone: STOCK_STATE_TONE.unstocked, count: count('unstocked') },
    { state: 'unknown', ar: STOCK_STATE_AR.unknown, tone: STOCK_STATE_TONE.unknown, count: count('unknown') },
  ];

  return {
    alerts: ordered.filter((a) => a.count > 0),
    needsRestock: restock,
    graded: items.filter((i) => i.state !== 'unknown' && i.state !== 'unstocked' && i.state !== 'no_sales').length,
    total: items.length,
  };
}

/**
 * WORST FIRST.
 *
 * The same ranking `health.worst` uses, for the same reason: what somebody
 * wants on opening a screen is the row that is wrong. `unknown` sorts after
 * `ok` and before `good` — not knowing is worse than a mild warning you can
 * act on, and better than a row that is fine.
 *
 * Within a tone the score breaks the tie, ascending, and a row with no score
 * sits after the scored ones: it cannot claim to be worse than something
 * measured.
 */
const TONE_RANK: Record<HealthTone, number> = { bad: 0, ok: 1, unknown: 2, good: 3 };

export function byUrgency(
  a: { tone: HealthTone; score: number | null },
  b: { tone: HealthTone; score: number | null }
): number {
  const byTone = TONE_RANK[a.tone] - TONE_RANK[b.tone];
  if (byTone !== 0) return byTone;
  if (a.score === null && b.score === null) return 0;
  if (a.score === null) return 1;
  if (b.score === null) return -1;
  return a.score - b.score;
}
