import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * THE RATING LINK — ONE ORDER, ONE OPINION, NO LOGIN.
 *
 * A customer who took delivery is the one person whose opinion of a product
 * can be checked. They have no account here and never will: /s is a shop a
 * stranger walks into. So the right to rate arrives as a LINK — offered on
 * the tracking page once they have proved the phone and the reference, and
 * copyable by the owner to send over WhatsApp.
 *
 * ── WHY THERE IS NO TOKEN COLUMN ──
 *
 * The obvious design stores a random token on the order and compares it.
 * That is a column that must be issued, kept, expired and cleaned, and a
 * column holding a credential is a column a backup copy hands to whoever
 * reads it — the lesson `reset-token.ts` already paid for.
 *
 * So the token is DERIVED: an HMAC over the order's id keyed on the
 * installation's own secret, exactly like `domain-verify.ts`'s TXT token.
 * Nobody outside can compute one, there is nothing to store, and a link
 * cannot be made for an order that does not exist because the id is in it.
 *
 * ── AND SINGLE USE IS THE DATABASE, NOT THE TOKEN ──
 *
 * A derived token is not consumable; it is the same string every time. That
 * is deliberate, and it is why «once» is enforced one layer down, by
 * `product_reviews_order_key` — the partial unique index on `order_id`. The
 * second submission on a perfectly valid link hits a unique violation and
 * the service answers «لقد قيّمت هذا الطلب من قبل». The alternative — a
 * consumed flag on the order — would be a second place that decides the
 * same thing, and the two would disagree the first time a write half
 * failed.
 *
 * WHAT THE LINK THEREFORE IS NOT: a secret worth stealing. It opens a form
 * that can be submitted once and reveals the product being rated and
 * nothing about the customer. A leaked link costs one opinion.
 *
 * Rotating `APP_ENCRYPTION_KEY` invalidates every outstanding link. That is
 * the documented cost of storing none, and it is the same cost
 * `domain-verify.ts` already carries.
 */

/** The id and its signature, which is the whole of what the URL carries. */
const SEPARATOR = '.';

/** A uuid, which is the only shape an order id has here. */
const ORDER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A token in a URL: the id, a dot, and 32 hex characters. */
export const REVIEW_TOKEN = /^[0-9a-f-]{36}\.[0-9a-f]{32}$/i;

function key(): string {
  return process.env.APP_ENCRYPTION_KEY || 'development_only_insecure_review_link_key';
}

function signature(orderId: string): string {
  return createHmac('sha256', key()).update(`review:${orderId}`).digest('hex').slice(0, 32);
}

/**
 * The token for this order's rating link.
 *
 * The id travels in the clear beside its signature rather than being
 * looked up from an opaque random: the page has to know which order it is
 * rating before it trusts anything, and a lookup table is the column this
 * whole file exists to avoid.
 */
export function reviewToken(orderId: string): string {
  return `${orderId}${SEPARATOR}${signature(orderId)}`;
}

/**
 * The order id this token is for, or null.
 *
 * Null for a token of the wrong shape, for an id that is not a uuid, and
 * for a signature that does not match — all with the SAME answer, because
 * telling them apart tells whoever is guessing which half they got right.
 */
export function orderIdFromToken(token: string): string | null {
  if (typeof token !== 'string' || !REVIEW_TOKEN.test(token)) return null;

  const at = token.indexOf(SEPARATOR);
  const orderId = token.slice(0, at);
  const given = token.slice(at + 1);
  if (!ORDER_ID.test(orderId)) return null;

  /*
   * Constant time, for the reason reset-token.ts gives: not because a
   * timing attack on a 128-bit HMAC is realistic, but because a comparison
   * that leaks its answer by the clock is a trap laid for whoever reaches
   * for this helper next holding something guessable.
   */
  const expected = Buffer.from(signature(orderId), 'utf8');
  const actual = Buffer.from(given.toLowerCase(), 'utf8');
  if (expected.length !== actual.length) return null;
  if (!timingSafeEqual(expected, actual)) return null;

  return orderId;
}

/**
 * Where the customer goes to rate — a path, never an absolute URL.
 *
 * The host is whatever they are already on: a shop with its own domain must
 * not send its customers to ours, and a link built from an env var is a
 * link that is wrong on the day somebody moves the deployment.
 */
export function reviewPath(storeSlug: string, orderId: string): string {
  return `/s/${storeSlug}/r/${reviewToken(orderId)}`;
}
