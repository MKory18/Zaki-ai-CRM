/**
 * GLOBAL TRACKING — per-platform Pixel ID validation (fail closed).
 *
 * The same functions run server-side (before storage / before config is
 * served) and client-side (before loading a platform script). An invalid
 * ID is never stored, never injected, never rendered.
 *
 * Only allowlisted characters per platform can pass — `javascript:`,
 * `data:`, HTML/script fragments, quotes and whitespace can never match.
 */

export const MAX_TRACKING_PIXEL_ID_LENGTH = 64;

/** Meta/Facebook Pixel IDs are numeric, 15-16 digits (existing project rule). */
const META_PIXEL_ID_RE = /^\d{15,16}$/;
export const MAX_META_PIXEL_ID_LENGTH = 16;

/**
 * TikTok Pixel IDs are alphanumeric identifiers (e.g. "C4ABCD1234567890").
 * Strict: letters/digits only, 8-32 chars — no symbols of any kind.
 */
const TIKTOK_PIXEL_ID_RE = /^[A-Za-z0-9]{8,32}$/;

/** Snapchat Pixel IDs are UUIDs (e.g. "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx"). */
const SNAPCHAT_PIXEL_ID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export function validateMetaPixelId(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null;
  const v = raw.trim();
  if (!v || v.length > MAX_META_PIXEL_ID_LENGTH) return null;
  return META_PIXEL_ID_RE.test(v) ? v : null;
}

export function validateTikTokPixelId(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null;
  const v = raw.trim();
  if (!v || v.length > MAX_TRACKING_PIXEL_ID_LENGTH) return null;
  return TIKTOK_PIXEL_ID_RE.test(v) ? v : null;
}

export function validateSnapchatPixelId(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null;
  const v = raw.trim();
  if (!v || v.length > MAX_TRACKING_PIXEL_ID_LENGTH) return null;
  return SNAPCHAT_PIXEL_ID_RE.test(v) ? v : null;
}

/**
 * Google tag IDs: a GA4 measurement id (G-XXXXXXXXXX) or a Google Ads tag
 * (AW-123456789). Normalised to upper case. A GTM container (GTM-XXXX) is
 * refused on purpose: a container runs whatever code is published into it,
 * which is exactly what this system never lets a setting do.
 */
const GOOGLE_TAG_ID_RE = /^(G-[A-Z0-9]{6,14}|AW-\d{6,14})$/;

export function validateGoogleTagId(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null;
  const v = raw.trim().toUpperCase();
  if (!v || v.length > MAX_TRACKING_PIXEL_ID_LENGTH) return null;
  return GOOGLE_TAG_ID_RE.test(v) ? v : null;
}

/** Platform-dispatching validator — the single entry point. */
export function validateTrackingPixelId(
  platform: string,
  raw: string | null | undefined
): string | null {
  switch (platform) {
    case 'META':
      return validateMetaPixelId(raw);
    case 'TIKTOK':
      return validateTikTokPixelId(raw);
    case 'SNAPCHAT':
      return validateSnapchatPixelId(raw);
    case 'GOOGLE':
      return validateGoogleTagId(raw);
    default:
      return null; // unknown platform → fail closed
  }
}

/** Human-readable validation hint per platform (for 400 responses / UI). */
export function pixelIdHint(platform: string): string {
  switch (platform) {
    case 'META':
      return 'Meta Pixel ID غير صالح (أرقام فقط، 15-16 خانة)';
    case 'TIKTOK':
      return 'TikTok Pixel ID غير صالح (حروف وأرقام إنجليزية فقط، 8-32 خانة)';
    case 'SNAPCHAT':
      return 'Snapchat Pixel ID غير صالح (يجب أن يكون بصيغة UUID)';
    case 'GOOGLE':
      return 'معرّف Google غير صالح — G-XXXXXXXXXX لـ Analytics أو AW-123456789 لـ Google Ads';
    default:
      return 'منصة غير مدعومة';
  }
}
