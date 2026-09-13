/**
 * GLOBAL TRACKING — types & pure helpers (client-safe, testable).
 *
 * One central engine dispatches allowlisted events to every enabled,
 * scope-matching pixel of the company (Meta / TikTok / Snapchat).
 *
 * Security model:
 *  - The ONLY stored configuration value is the Pixel ID, validated
 *    server-side per platform. No tokens/secrets/user JavaScript.
 *  - Platform loaders are 100% hard-coded — user input can never inject
 *    script/HTML/event names. All events and platforms are allowlisted.
 *  - Scope is resolved server-side; the client never grants itself pixels.
 *  - Payloads are built from trusted React/server state only, sanitized
 *    (no PII) by sanitizeTrackingPayload().
 */

export const TRACKING_PLATFORMS = ['META', 'TIKTOK', 'SNAPCHAT'] as const;
export type TrackingPlatform = (typeof TRACKING_PLATFORMS)[number];

export const TRACKING_SCOPES = ['GLOBAL', 'PUBLIC', 'LANDING_PAGES'] as const;
export type TrackingScope = (typeof TRACKING_SCOPES)[number];

/** Allowlisted, code-defined events — no user-defined event names, ever. */
export const TRACKING_EVENTS = ['PageView', 'ViewContent', 'InitiateCheckout', 'Purchase'] as const;
export type TrackingEventName = (typeof TRACKING_EVENTS)[number];

/** Page context used for scope resolution (server-side). */
export type TrackingPageContext = 'PUBLIC' | 'LANDING_PAGES';

/** Serializable pixel as delivered to the client engine. */
export interface TrackingPixelView {
  id: string;
  platform: TrackingPlatform;
  name: string;
  pixelId: string; // re-validated before use
  scope: TrackingScope;
  enabled: boolean;
}

/** Neutral event payload — adapters map it to each platform's format. */
export interface TrackingPayload {
  contentIds?: string[]; // DB product ids
  contentName?: string | null;
  value?: number | null; // DB price / server order total only
  currency?: string | null;
  orderId?: string | null; // server orderNumber (Purchase dedupe)
}

/** Keys that must NEVER appear in any tracking payload (PII protection). */
const PII_KEYS = new Set([
  'full_name', 'fullname', 'name', 'phone', 'address', 'notes', 'note',
  'email', 'city', 'companyid', 'userid', 'userid', 'customerid',
  'lastname', 'firstname', 'em', 'ph', 'ct', 'zp', 'country', 'st',
]);

/**
 * Sanitize a payload: drop PII-ish keys, non-primitive values and anything
 * oversized. Used by adapters so even a future caller mistake cannot leak
 * name/phone/address/notes into an ad platform.
 */
export function sanitizeTrackingPayload(payload: TrackingPayload): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!payload || typeof payload !== 'object') return out;

  if (Array.isArray(payload.contentIds)) {
    const ids = payload.contentIds
      .filter((v): v is string => typeof v === 'string' && v.length > 0 && v.length <= 64)
      .slice(0, 10);
    if (ids.length > 0) out.content_ids = ids;
  }
  if (typeof payload.contentName === 'string' && payload.contentName.trim()) {
    out.content_name = payload.contentName.trim().slice(0, 120);
  }
  if (typeof payload.value === 'number' && Number.isFinite(payload.value) && payload.value >= 0) {
    out.value = Math.round(payload.value * 100) / 100;
  }
  if (typeof payload.currency === 'string' && /^[A-Za-z]{3}$/.test(payload.currency)) {
    out.currency = payload.currency.toUpperCase();
  }
  if (typeof payload.orderId === 'string' && payload.orderId.length <= 64) {
    out.order_id = payload.orderId;
  }
  // Defense-in-depth: nothing PII-like survives, no matter the input shape.
  for (const key of Object.keys(out)) {
    if (PII_KEYS.has(key.toLowerCase())) delete out[key];
  }
  return out;
}

/** Which pixels apply to a given page context, honoring scope.
 *  PUBLIC pages: GLOBAL + PUBLIC. Landing pages (which are also public):
 *  GLOBAL + PUBLIC + LANDING_PAGES. */
export function filterPixelsForPage(
  pixels: TrackingPixelView[],
  page: TrackingPageContext
): TrackingPixelView[] {
  return pixels.filter(
    (p) =>
      p.enabled &&
      (p.scope === 'GLOBAL' ||
        p.scope === page ||
        (page === 'LANDING_PAGES' && p.scope === 'PUBLIC'))
  );
}

/** Dedupe key: platform + pixel + event (+ order for Purchase). */
export function trackingEventKey(
  platform: TrackingPlatform,
  pixelId: string,
  event: TrackingEventName,
  orderId?: string | null
): string {
  return orderId
    ? `${platform}:${pixelId}:${event}:${orderId}`
    : `${platform}:${pixelId}:${event}`;
}

/**
 * Consent hook (future cookie-consent integration point).
 * Today the app has no consent layer — default allow keeps current behavior;
 * the engine signature already accepts a consent gate so it can be added
 * later without rewriting the engine.
 */
export type TrackingConsentGate = (platform: TrackingPlatform, scope: TrackingScope) => boolean;
export const allowAllConsent: TrackingConsentGate = () => true;

/** Mask a pixel ID for audit logs (platform + name remain readable). */
export function maskPixelId(pixelId: string): string {
  const v = String(pixelId || '');
  if (v.length <= 4) return '****';
  return `${v.slice(0, 3)}***${v.slice(-2)}`;
}
