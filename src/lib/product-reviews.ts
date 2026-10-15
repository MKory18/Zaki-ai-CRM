import { db } from './db';
import { logAudit } from './audit';
import { notify } from './notify';
import { orderIdFromToken } from './review-link';
import { deriveCoreState } from './order-state';
import {
  AUTO_SWITCH_FLOOR,
  HIDE_REASONS,
  REVIEW_MODES,
  SHOWN_WHERE,
  publicReview,
  ratingSubmission,
  reviewAverage,
  reviewMode,
  shows,
  type HideReason,
  type PublicReview,
  type RatingSubmission,
  type ReviewMode,
} from './reviews';

/**
 * THE REVIEWS — the half that touches the database.
 *
 * Owner decision D8, design docs/storefront/AUDIT.md §7.6. The words, the
 * floors and the pure predicates are in `./reviews`, which both sides read;
 * this file holds the rating door, moderation, and the switch that happens
 * by itself.
 *
 * IT RE-EXPORTS THAT FILE, so no caller has to know which half it wanted.
 * A screen importing `REVIEW_SOURCE_LABEL` from here would drag Prisma into
 * the bundle, so a CLIENT component must import from `./reviews` directly —
 * and `theme-isolation.test.ts`'s sibling guard on bundles is what notices
 * if one stops doing so.
 */

export * from './reviews';

// ─────────────────────────────────────────────────────
// The rating door
// ─────────────────────────────────────────────────────

/**
 * WHY A LINK IS REFUSED, in the customer's language.
 *
 * The three refusals are DIFFERENT SENTENCES and that is deliberate here,
 * unlike the tracking page's one answer. Tracking answers a question a
 * stranger can ask about anybody's order, so every failure must look
 * identical. This link is already in the hand of whoever took delivery:
 * telling them «you already rated this» instead of «invalid link» costs
 * nothing an attacker can use and saves a customer from pressing the
 * button nine more times.
 *
 * A link for ANOTHER SHOP'S order and a signature that does not verify
 * both answer `BAD_LINK`. Those two must not be told apart — the
 * difference would say «this order exists, elsewhere».
 */
export const REVIEW_REFUSAL = {
  BAD_LINK: 'الرابط غير صالح. اطلب رابطاً جديداً من المتجر.',
  NOT_DELIVERED: 'التقييم يفتح بعد تسليم الطلب.',
  ALREADY_RATED: 'لقد قيّمت هذا الطلب من قبل. شكراً لك.',
} as const;

export type ReviewRefusal = keyof typeof REVIEW_REFUSAL;

/** What the rating page needs to draw itself, once the link checked out. */
export interface RatingTarget {
  orderId: string;
  productId: string;
  productName: string;
  storeId: string | null;
  companyId: string;
}

/**
 * THE ORDER THIS LINK RATES, or why not.
 *
 * Three gates, in this order, and each one is a DoD claim:
 *
 *  1. the signature verifies and the id is a uuid  — review-link.ts
 *  2. the order is in THIS shop and is DELIVERED   — here
 *  3. it has not been rated                        — here, and again in the
 *     database, where `product_reviews_order_key` is the one that cannot
 *     lose a race
 *
 * `deriveCoreState` and not `shippingStatus === 'DELIVERED'`: the system
 * has one reading of «where is this order» and a second one written out
 * here would disagree with it the first time a status was added. A
 * PARTIALLY_DELIVERED order counts — the customer took goods and paid for
 * them, and their opinion of what they received is as checkable as anyone's.
 */
export async function ratingTarget(
  token: string,
  store: { id: string; companyId: string }
): Promise<{ ok: true; target: RatingTarget } | { ok: false; refusal: ReviewRefusal }> {
  const orderId = orderIdFromToken(token);
  if (!orderId) return { ok: false, refusal: 'BAD_LINK' };

  const order = await db.order.findFirst({
    where: { id: orderId, companyId: store.companyId, storeId: store.id },
    select: {
      id: true,
      productId: true,
      productNameSnapshot: true,
      storeId: true,
      companyId: true,
      shippingStatus: true,
      confirmationStatus: true,
      claimedById: true,
      product: { select: { name: true } },
    },
  });
  // A foreign shop's order reads exactly like a bad signature. The two must
  // not be told apart: the difference says «this order exists, elsewhere».
  if (!order) return { ok: false, refusal: 'BAD_LINK' };

  const state = deriveCoreState(order);
  if (state !== 'DELIVERED' && state !== 'PARTIALLY_DELIVERED') {
    return { ok: false, refusal: 'NOT_DELIVERED' };
  }

  const already = await db.productReview.findFirst({ where: { orderId: order.id }, select: { id: true } });
  if (already) return { ok: false, refusal: 'ALREADY_RATED' };

  return {
    ok: true,
    target: {
      orderId: order.id,
      productId: order.productId,
      productName: order.productNameSnapshot || order.product?.name || '',
      storeId: order.storeId,
      companyId: order.companyId,
    },
  };
}

/** Postgres says 23505 when a unique index refuses a row. */
function isUniqueViolation(e: unknown): boolean {
  const code = (e as { code?: unknown })?.code;
  return code === 'P2002' || code === '23505';
}

/**
 * WRITE THE RATING — once, for its own delivered order.
 *
 * The check in `ratingTarget` is a read followed by a write, and two taps
 * on a slow phone are two requests in the same second. So the write is
 * attempted and the UNIQUE VIOLATION IS THE ANSWER — the same shape
 * `penalty-service.ts` uses and for the same reason: letting the database
 * refuse is the only version of «once» that survives a race.
 *
 * It lands PENDING. A customer's words go in front of other customers after
 * somebody has read them, which is the moderation the brief asks for — and
 * it is also what stops the first abusive sentence appearing on the shop's
 * busiest page at 2am.
 */
export async function submitRating(
  target: RatingTarget,
  body: RatingSubmission
): Promise<{ ok: true; id: string } | { ok: false; refusal: ReviewRefusal }> {
  try {
    const row = await db.productReview.create({
      data: {
        companyId: target.companyId,
        storeId: target.storeId,
        productId: target.productId,
        orderId: target.orderId,
        rating: body.rating,
        // Trimmed and stored as typed. No sanitiser, because nothing
        // downstream treats it as markup — see the file header.
        text: body.text.trim() || null,
        firstName: body.firstName.trim() || null,
        city: body.city.trim() || null,
        source: 'order',
        status: 'PENDING',
        consent: body.consent,
      },
      select: { id: true },
    });

    await logAudit({
      companyId: target.companyId,
      userId: null,
      action: 'REVIEW_SUBMITTED',
      entity: 'ProductReview',
      entityId: row.id,
      newData: {
        productId: target.productId,
        orderId: target.orderId,
        rating: body.rating,
        // The words are NOT copied into the audit log. The log is read by
        // staff who do not need them, and `logAudit` already redacts what
        // it knows to; a review's text is the customer's and lives in one
        // place.
        hasText: Boolean(body.text.trim()),
        consent: body.consent,
      },
    });

    return { ok: true, id: row.id };
  } catch (e) {
    if (isUniqueViolation(e)) return { ok: false, refusal: 'ALREADY_RATED' };
    throw e;
  }
}

// ─────────────────────────────────────────────────────
// Moderation
// ─────────────────────────────────────────────────────

/**
 * PUBLISH — and then ask whether this product has earned its automatic
 * source.
 *
 * The switch is checked HERE and not on submission, because the floor is
 * five PUBLISHED verified reviews: five pending ones are five sentences
 * nobody has read.
 */
export async function publishReview(opts: {
  companyId: string;
  reviewId: string;
  userId: string;
}): Promise<{ ok: boolean; switched: boolean }> {
  const row = await db.productReview.findFirst({
    where: { id: opts.reviewId, companyId: opts.companyId },
    select: { id: true, productId: true, status: true, consent: true, orderId: true, storeId: true },
  });
  if (!row) return { ok: false, switched: false };

  /*
   * A REVIEW WITHOUT CONSENT IS NEVER PUBLISHED.
   *
   * `SHOWN_WHERE` would hide it anyway, so this is belt and braces — and
   * it is the right kind: a moderator pressing «نشر» and seeing nothing
   * appear would conclude the screen is broken. The refusal says which of
   * the two decisions is missing, and it is not the moderator's to make.
   */
  if (!row.consent) return { ok: false, switched: false };

  await db.productReview.update({
    where: { id: row.id },
    data: { status: 'PUBLISHED', publishedAt: new Date(), hiddenReason: null, hiddenById: null, hiddenAt: null },
  });

  await logAudit({
    companyId: opts.companyId,
    userId: opts.userId,
    action: 'REVIEW_PUBLISHED',
    entity: 'ProductReview',
    entityId: row.id,
    previousData: { status: row.status },
    newData: { status: 'PUBLISHED' },
  });

  const switched = await maybeAutoSwitch({
    companyId: opts.companyId,
    productId: row.productId,
    storeId: row.storeId,
  });

  return { ok: true, switched };
}

/**
 * HIDE — and it costs a reason.
 *
 * `reason` is one of three and not a free string: see `HIDE_REASONS`. The
 * note is optional detail; it is not the reason, and leaving it out does
 * not leave the row unexplained.
 *
 * AUDITED, ALWAYS. «Hiding needs a reason and is audit-logged» is a DoD
 * claim with a negative test beside it, because a moderation tool whose
 * uses are not recorded is a tool for quietly curating an average.
 */
export async function hideReview(opts: {
  companyId: string;
  reviewId: string;
  userId: string;
  reason: HideReason;
  note?: string;
}): Promise<{ ok: boolean; error?: string }> {
  if (!(HIDE_REASONS as readonly string[]).includes(opts.reason)) {
    return { ok: false, error: 'سبب الإخفاء مطلوب: إساءة أو بيانات شخصية أو خارج الموضوع.' };
  }

  const row = await db.productReview.findFirst({
    where: { id: opts.reviewId, companyId: opts.companyId },
    select: { id: true, status: true },
  });
  if (!row) return { ok: false, error: 'المراجعة غير موجودة' };

  await db.productReview.update({
    where: { id: row.id },
    data: {
      status: 'HIDDEN',
      hiddenReason: opts.reason,
      hiddenById: opts.userId,
      hiddenAt: new Date(),
    },
  });

  await logAudit({
    companyId: opts.companyId,
    userId: opts.userId,
    action: 'REVIEW_HIDDEN',
    entity: 'ProductReview',
    entityId: row.id,
    previousData: { status: row.status },
    newData: { status: 'HIDDEN', reason: opts.reason, note: (opts.note ?? '').slice(0, 300) || null },
  });

  return { ok: true };
}

// ─────────────────────────────────────────────────────
// The switch that happens by itself
// ─────────────────────────────────────────────────────

/**
 * FIVE REAL OPINIONS AND THE PRODUCT STOPS NEEDING THE SELLER'S.
 *
 * At `AUTO_SWITCH_FLOOR` published verified reviews the product moves from
 * `manual` to `auto` and the owner is TOLD — because a page that changes
 * what it shows without saying so is a page the seller stops trusting. He
 * can move it back; this never fires twice, because it only ever changes a
 * product that is still `manual`.
 *
 * `both` is left alone. A seller who chose to show both sources chose it
 * with the real reviews already arriving, and overriding that would be the
 * system taking a decision the owner had already taken.
 */
export async function maybeAutoSwitch(opts: {
  companyId: string;
  productId: string;
  storeId?: string | null;
}): Promise<boolean> {
  const product = await db.product.findFirst({
    where: { id: opts.productId, companyId: opts.companyId },
    select: { id: true, name: true, reviewMode: true, storeId: true },
  });
  if (!product) return false;
  if (reviewMode(product.reviewMode) !== 'manual') return false;

  const count = await db.productReview.count({
    where: {
      productId: product.id,
      companyId: opts.companyId,
      ...SHOWN_WHERE,
      // VERIFIED only. Five transcribed WhatsApp messages are not five
      // checkable opinions, and this floor is about evidence.
      orderId: { not: null },
    },
  });
  if (count < AUTO_SWITCH_FLOOR) return false;

  await db.product.update({ where: { id: product.id }, data: { reviewMode: 'auto' } });

  await logAudit({
    companyId: opts.companyId,
    userId: null,
    action: 'REVIEW_MODE_AUTO_SWITCHED',
    entity: 'Product',
    entityId: product.id,
    previousData: { reviewMode: product.reviewMode },
    newData: { reviewMode: 'auto', verifiedPublished: count },
  });

  notify({
    companyId: opts.companyId,
    storeId: product.storeId ?? opts.storeId ?? null,
    audience: { permission: 'storefront.manage' },
    type: 'SYSTEM_ALERT',
    title: 'صار في تقييمات حقيقية كفاية',
    message: `«${product.name}» وصل ${count} تقييمات من مشترين مؤكَّدين، فصارت آراء المنتج تلقائية. تقدر ترجعها يدوية من شاشة الآراء.`,
    link: '/store/reviews',
  });

  return true;
}

/** Set by hand, from the moderation screen. Audited, like the automatic one. */
export async function setReviewMode(opts: {
  companyId: string;
  productId: string;
  userId: string;
  mode: ReviewMode;
}): Promise<{ ok: boolean; error?: string }> {
  if (!(REVIEW_MODES as readonly string[]).includes(opts.mode)) {
    return { ok: false, error: 'مصدر الآراء غير صالح' };
  }
  const product = await db.product.findFirst({
    where: { id: opts.productId, companyId: opts.companyId },
    select: { id: true, reviewMode: true },
  });
  if (!product) return { ok: false, error: 'المنتج غير موجود' };

  await db.product.update({ where: { id: product.id }, data: { reviewMode: opts.mode } });
  await logAudit({
    companyId: opts.companyId,
    userId: opts.userId,
    action: 'REVIEW_MODE_SET',
    entity: 'Product',
    entityId: product.id,
    previousData: { reviewMode: product.reviewMode },
    newData: { reviewMode: opts.mode },
  });
  return { ok: true };
}

// ─────────────────────────────────────────────────────
// What the shop reads
// ─────────────────────────────────────────────────────

/**
 * This product's shown verified reviews, and their average.
 *
 * Returns nothing at all when the mode does not show the automatic source,
 * so the renderer never has to remember to ask: the server answers the
 * question the mode asked.
 */
export async function shownReviews(opts: {
  companyId: string;
  productId: string;
  reviewMode: string | null | undefined;
  limit?: number;
}): Promise<{ items: PublicReview[]; count: number; average: number | null; showAverage: boolean }> {
  const mode = reviewMode(opts.reviewMode);
  if (!shows(mode).auto) return { items: [], count: 0, average: null, showAverage: false };

  const rows = await db.productReview.findMany({
    where: {
      companyId: opts.companyId,
      productId: opts.productId,
      ...SHOWN_WHERE,
      orderId: { not: null },
    },
    orderBy: { publishedAt: 'desc' },
    // The SELECT IS THE PRIVACY RULE. Seven columns, none of them personal
    // beyond a first name and a city, and `publicReview` cannot return what
    // it was never given.
    select: {
      id: true,
      productId: true,
      orderId: true,
      rating: true,
      text: true,
      firstName: true,
      city: true,
      source: true,
      status: true,
      consent: true,
      publishedAt: true,
      createdAt: true,
    },
    take: opts.limit ?? 24,
  });

  const stat = reviewAverage(rows);
  return {
    items: rows.map(publicReview),
    count: stat.count,
    average: stat.average,
    showAverage: stat.show,
  };
}
