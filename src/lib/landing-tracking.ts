/**
 * LANDING TRACKING — Meta/Facebook Pixel (browser only, Phase 3).
 *
 * Separation of concerns:
 *   landing-dynamic.ts  → behavior layer (actions/position/styling)
 *   landing-tracking.ts → Meta Pixel configuration + trusted event payloads
 *
 * Security model:
 *  - The ONLY stored configuration value is the Pixel ID (validated digits).
 *    No JavaScript, no HTML, no user-supplied fbq code is ever stored or
 *    generated from user input — the loader is 100% hard-coded.
 *  - The Pixel lives in the TRUSTED public page (never in the sandboxed
 *    custom-HTML iframe): the custom HTML cannot set the Pixel ID, cannot
 *    fire Purchase, cannot fire arbitrary events, and cannot choose value/
 *    currency. Event payloads are built exclusively from trusted React /
 *    server state (DB product, DB offer, server order response).
 *  - Preview/dashboard NEVER load the Pixel.
 *  - No PII is ever sent (no name/phone/address/notes).
 */

/** Meta Pixel IDs are numeric, 15-16 digits. */
const PIXEL_ID_RE = /^\d{15,16}$/;
export const MAX_PIXEL_ID_LENGTH = 16;

/**
 * Validate a Meta Pixel ID (server-side before storage, client-side before
 * loading the script). Returns the cleaned ID or null.
 */
export function validatePixelId(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null;
  const v = raw.trim();
  if (!v || v.length > MAX_PIXEL_ID_LENGTH) return null;
  return PIXEL_ID_RE.test(v) ? v : null;
}

/** Fixed, code-defined events — no user-defined event names in Phase 3. */
export const META_PIXEL_EVENTS = ['PageView', 'ViewContent', 'InitiateCheckout', 'Purchase'] as const;

export interface PixelViewContent {
  productId: string | null; // DB id (content_ids)
  productName: string | null; // content_name
  price: number | null; // DB unit price (value)
  currency: string;
}

/** Whether a (page, id) pair should load the Pixel at all. */
export function pixelActive(enabled: boolean | null | undefined, pixelId: string | null | undefined): string | null {
  if (!enabled) return null;
  return validatePixelId(pixelId);
}