import { z } from 'zod';

/**
 * THE REVIEWS' VOCABULARY — and what makes one of them checkable.
 *
 * Owner decision D8, design docs/storefront/AUDIT.md §7.6. Every piece of
 * social proof has two sources, chosen per product: يدوي · تلقائي ·
 * الاتنين. The seller starts manual, because on day one there is nothing
 * real to show, and automatic takes over as delivered orders arrive.
 *
 * ── WHY THIS FILE IMPORTS NOTHING THAT RUNS ON THE SERVER ──
 *
 * The same reason `route-registry.ts` imports nothing: BOTH SIDES READ IT.
 * The moderation screen labels its rows from these maps, the block editor
 * offers `MANUAL_SOURCES` in a dropdown, and the service in
 * `product-reviews.ts` enforces the rules with them. One `import { db }`
 * here and the moment a client component read a LABEL it would drag Prisma
 * into the bundle and the build would refuse.
 *
 * So the words, the floors and the pure predicates live here, and
 * everything that touches the database lives in `product-reviews.ts`,
 * which re-exports this file so no caller has to know which half it
 * wanted.
 *
 * ── THE ONE RULE EVERYTHING ELSE FOLLOWS FROM ──
 *
 * «مشتري مؤكَّد» is rendered off the PRESENCE OF AN ORDER and nothing else.
 * Not off `source`, not off a flag, not off the moderator's opinion. A
 * manual item is a sentence the seller transcribed from WhatsApp, and
 * however true it is, nobody here can check it — so it cannot wear the
 * badge, and `verified()` is the only thing that decides.
 *
 * That is why manual items live in the PAGE BLOCK (src/lib/landing-sections.ts)
 * and verified ones in the `ProductReview` table. Two homes for one word
 * would be one home too many; two homes for two different claims is the
 * shape of the claim itself. A manual item has no row to put an `orderId`
 * on.
 *
 * ── WHAT A STRANGER IS EVER SHOWN ──
 *
 * A first name and a city. `publicReview` builds that and
 * `PUBLIC_REVIEW_FIELDS` is compared against it in both directions by a
 * guard, so a field added to the payload and forgotten in the list fails
 * the suite — the same defence `order-tracking.ts` uses, for the same
 * reason: the leak that actually happens is somebody widening a `select`.
 *
 * ── AND THE TEXT IS DATA ──
 *
 * `text` is what a stranger typed into a public form. It is rendered as a
 * React text child, never as HTML, and it never reaches a model that is not
 * running on the owner's own machine: any AI over it goes through
 * `aiChat({ localOnly: true })`, which throws `AiNotLocal` BEFORE the
 * network call. A review is not an instruction — not to a renderer, and not
 * to a model.
 */

// ─────────────────────────────────────────────────────
// The vocabulary
// ─────────────────────────────────────────────────────

/**
 * Where a review came from.
 *
 * `order` is the only one this table issues for itself; the other four are
 * what a seller picks when transcribing. They are listed together because
 * the moderation view shows both kinds in one list and must label them from
 * one map.
 */
export const REVIEW_SOURCES = ['order', 'whatsapp', 'facebook', 'call', 'other'] as const;
export type ReviewSource = (typeof REVIEW_SOURCES)[number];

export const REVIEW_SOURCE_LABEL: Record<ReviewSource, string> = {
  order: 'طلب تمّ تسليمه',
  whatsapp: 'واتساب',
  facebook: 'تعليق فيسبوك',
  call: 'مكالمة',
  other: 'غيره',
};

/** The four a seller may transcribe. `order` is never one of them. */
export const MANUAL_SOURCES = REVIEW_SOURCES.filter((s) => s !== 'order');

export const REVIEW_STATUSES = ['PENDING', 'PUBLISHED', 'HIDDEN'] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export const REVIEW_STATUS_LABEL: Record<ReviewStatus, string> = {
  PENDING: 'بانتظار المراجعة',
  PUBLISHED: 'منشور',
  HIDDEN: 'مخفي',
};

/** Where this product's social proof comes from. NULL reads as `manual`. */
export const REVIEW_MODES = ['manual', 'auto', 'both'] as const;
export type ReviewMode = (typeof REVIEW_MODES)[number];

export const REVIEW_MODE_LABEL: Record<ReviewMode, string> = {
  manual: 'يدوي — ما يكتبه البائع',
  auto: 'تلقائي — تقييمات المشترين',
  both: 'الاتنين',
};

/**
 * WHY HIDING IS A SHORT LIST AND NOT A FREE TEXT BOX.
 *
 * «hide only for abuse, personal data or off-topic, with the reason
 * recorded». A seller who may hide a review for any reason they can type
 * has a delete button with extra steps, and the average above it stops
 * meaning anything. These three are the reasons a review is not fit to
 * show; «it is three stars» is not among them and there is nowhere to
 * write it.
 *
 * The free `note` beside it is for the detail, not for the reason.
 */
export const HIDE_REASONS = ['ABUSE', 'PERSONAL_DATA', 'OFF_TOPIC'] as const;
export type HideReason = (typeof HIDE_REASONS)[number];

export const HIDE_REASON_LABEL: Record<HideReason, string> = {
  ABUSE: 'سبّ أو إساءة',
  PERSONAL_DATA: 'بيانات شخصية في النص',
  OFF_TOPIC: 'لا علاقة له بالمنتج',
};

/**
 * THE FLOOR A PRODUCT CROSSES BEFORE IT SWITCHES ITSELF.
 *
 * Five published verified reviews and the product moves to `auto` and the
 * owner is told; he can move it back.
 *
 * FIVE, AND THE SAME FIVE AS `delivery-time.ts`'s `MIN_DELIVERIES` —
 * deliberately, because it answers the same question. That constant is
 * «how many real deliveries before this system will quote a delivery
 * time», and this is «how many real opinions before it will quote an
 * average». One number a reader has already learned beats two they have to
 * look up.
 */
export const AUTO_SWITCH_FLOOR = 5;

/**
 * AND A COUNTER IS NOT SHOWN AT ALL BELOW IT.
 *
 * «٤٫٨ من ٥» over two reviews is a true statement and a misleading number:
 * it reads as a measurement and it is two people. The same floor, for the
 * same reason — below it the page shows the reviews themselves, which are
 * two sentences a shopper can weigh, and no average pretending to be a
 * statistic.
 */
export const MIN_SHOWN_FOR_AVERAGE = AUTO_SWITCH_FLOOR;

// ─────────────────────────────────────────────────────
// What goes in, and what comes out
// ─────────────────────────────────────────────────────

/**
 * The rating form's own body.
 *
 * A first name, a city, one to five stars, and words. There is no field
 * here for a phone, an address or a surname — the privacy promise is kept
 * by the SHAPE, which is the only way it stays kept once somebody else
 * edits the route.
 */
export const ratingSubmission = z.object({
  rating: z.coerce.number().int().min(1).max(5),
  /** Plain text, and short. Not rich text: see the file's header. */
  text: z.string().max(600).optional().default(''),
  firstName: z.string().max(40).optional().default(''),
  city: z.string().max(60).optional().default(''),
  /**
   * The tick. Refused when absent, rather than defaulted to true: consent
   * that the server supplies is not consent.
   */
  consent: z.literal(true),
});

export type RatingSubmission = z.infer<typeof ratingSubmission>;

/** The row shape this module reasons about. Narrower than the model. */
export interface ReviewRow {
  id: string;
  productId: string;
  orderId: string | null;
  rating: number;
  text: string | null;
  firstName: string | null;
  city: string | null;
  source: string;
  status: string;
  consent: boolean;
  publishedAt: Date | null;
  createdAt: Date;
}

/**
 * EVERY FIELD A STRANGER MAY BE HANDED, written out so a guard can compare
 * it against what `publicReview` actually returns, in both directions.
 *
 * `order-tracking.ts` does this and says why: a field added to the payload
 * and forgotten here fails, and a field listed here and never sent fails
 * too. It is the whole defence against a phone number arriving on a public
 * page because somebody widened a `select` three files away.
 */
export const PUBLIC_REVIEW_FIELDS = ['id', 'rating', 'text', 'firstName', 'city', 'verified', 'at'] as const;

export interface PublicReview {
  id: string;
  rating: number;
  /** The customer's words, as text. The renderer never treats it as markup. */
  text: string;
  /** A FIRST name. There is no column here that could hold a surname. */
  firstName: string;
  city: string;
  /** «مشتري مؤكَّد» — true only for a row bound to a delivered order. */
  verified: boolean;
  /** The day, never the minute: the hour somebody wrote it buys nobody anything. */
  at: string;
}

/**
 * Is this review one whose buyer we can prove?
 *
 * The presence of the order and NOTHING ELSE. Written as a function with
 * one line so that every caller asks the same question and a second
 * reading of the badge cannot be introduced by accident.
 */
export function verified(row: Pick<ReviewRow, 'orderId'>): boolean {
  return row.orderId !== null && row.orderId !== undefined;
}

/** What a shopper sees. Nothing else about the person reaches this object. */
export function publicReview(row: ReviewRow): PublicReview {
  return {
    id: row.id,
    rating: row.rating,
    text: (row.text ?? '').trim(),
    firstName: (row.firstName ?? '').trim(),
    city: (row.city ?? '').trim(),
    verified: verified(row),
    at: (row.publishedAt ?? row.createdAt).toISOString().slice(0, 10),
  };
}

/** NULL, an old row, or a word nobody recognises all read as `manual`. */
export function reviewMode(raw: string | null | undefined): ReviewMode {
  return (REVIEW_MODES as readonly string[]).includes(raw ?? '') ? (raw as ReviewMode) : 'manual';
}

/** Which of the two sources this mode puts in front of a shopper. */
export function shows(mode: ReviewMode): { manual: boolean; auto: boolean } {
  return {
    manual: mode === 'manual' || mode === 'both',
    auto: mode === 'auto' || mode === 'both',
  };
}

/**
 * A review is SHOWN when it is published AND consented to.
 *
 * Two conditions and not one, because they are two different people's
 * decisions: `status` is the moderator's and `consent` is the customer's.
 * A moderator may publish; a moderator may not consent on somebody's
 * behalf. Used as a Prisma `where` and as a predicate, from one definition,
 * so the list and the count cannot drift apart.
 */
export const SHOWN_WHERE = { status: 'PUBLISHED', consent: true } as const;

export function isShown(row: Pick<ReviewRow, 'status' | 'consent'>): boolean {
  return row.status === 'PUBLISHED' && row.consent === true;
}

/**
 * The average, and whether it is fit to show.
 *
 * «The average counts every published review of the shown source» — so the
 * caller filters to the source the mode shows and this counts all of what
 * it is given. It does NOT weight, discount or round in the shop's favour.
 *
 * `show` is false below `MIN_SHOWN_FOR_AVERAGE`. A real counter is only
 * shown from real data above a minimum; below it the page shows the
 * sentences and no statistic.
 */
export function reviewAverage(rows: Pick<ReviewRow, 'rating'>[]): {
  count: number;
  average: number | null;
  show: boolean;
} {
  const count = rows.length;
  if (!count) return { count: 0, average: null, show: false };
  const total = rows.reduce((sum, r) => sum + r.rating, 0);
  // One decimal, and the honest direction: 4.449 is 4.4, not 4.5.
  const average = Math.floor((total / count) * 10) / 10;
  return { count, average, show: count >= MIN_SHOWN_FOR_AVERAGE };
}

