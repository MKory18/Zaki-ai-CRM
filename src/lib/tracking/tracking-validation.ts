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
 * Google tag IDs: a GA4 measurement id (G-XXXXXXXXXX), or a Google Ads tag
 * with its conversion label (AW-123456789/AbC-dEfGhI). Without the label an
 * Ads tag can build audiences but never records a conversion — which is the
 * reason anybody adds one — so the label is accepted and used for the
 * purchase. The prefix is normalised to upper case; the label is not, it is
 * case-sensitive. A GTM container (GTM-XXXX) is refused on purpose: a
 * container runs whatever code is published into it, which is exactly what
 * this system never lets a setting do.
 */
const GA4_ID_RE = /^G-[A-Z0-9]{6,14}$/;
const ADS_ID_RE = /^AW-\d{6,14}$/;
const ADS_LABEL_RE = /^[A-Za-z0-9_-]{4,40}$/;

export function validateGoogleTagId(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > MAX_TRACKING_PIXEL_ID_LENGTH) return null;
  const [head, label, ...rest] = trimmed.split('/');
  if (rest.length) return null;
  const tag = head.toUpperCase();
  if (label === undefined) return GA4_ID_RE.test(tag) || ADS_ID_RE.test(tag) ? tag : null;
  return ADS_ID_RE.test(tag) && ADS_LABEL_RE.test(label) ? `${tag}/${label}` : null;
}

/** The tag a Google id loads and configures — without any conversion label. */
export function googleTagOf(id: string): string {
  return id.split('/')[0];
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
      return 'معرّف Google غير صالح — G-XXXXXXXXXX لـ Analytics، أو AW-123456789/التسمية لإعلانات Google (التسمية من صفحة التحويل في Google Ads)';
    default:
      return 'منصة غير مدعومة';
  }
}
