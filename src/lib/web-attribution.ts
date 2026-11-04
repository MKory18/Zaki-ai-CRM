/**
 * WHAT A WEB ORDER REMEMBERS ABOUT THE AD IT CAME FROM.
 *
 * A landing page used to keep only `?c=CODE`, which names a campaign. The ad
 * link and the browser carry more, and the media buyer (its INTEGRATIONS
 * §4.1 item 5) needs it to tie an order to an AD and not just a campaign:
 *
 *   · `ad_id`, `adset_id` — Meta's URL parameters `{{ad.id}}` / `{{adset.id}}`
 *   · `fbclid` — Meta's click id, appended to the link when the ad is clicked
 *   · `_fbc`, `_fbp` — the cookies Meta's pixel writes (and the click id, in
 *     the `fb.1.<ms>.<fbclid>` shape Meta documents for `_fbc`)
 *   · `utm_*` — the campaign's own labels
 *
 * Two halves, one file, no imports: `collectWebAttribution` runs in the
 * visitor's browser and gathers them; `readWebAttribution` runs on the
 * server and decides what of it to keep. The server NEVER trusts the
 * browser's shape — every value is matched against the form Meta (or the
 * ad link) actually produces, and anything else is dropped, not stored,
 * because this text ends up in a database column and in a CAPI request.
 *
 * Dropping is silent on purpose: attribution is worth nothing next to the
 * order itself, and a mistyped or hand-edited link must never cost a sale.
 */

/** What the browser sends, as `attribution` beside the order's own fields. */
export interface WebAttributionPayload {
  ad_id?: string;
  adset_id?: string;
  fbclid?: string;
  fbc?: string;
  fbp?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
}

/** What the server keeps — plain, already checked. The sealing is `web-attribution-server.ts`. */
export interface WebAttribution {
  adId: string | null;
  adsetId: string | null;
  /** `fb.1.<ms>.<fbclid>` — from the cookie, else built from the click id. */
  fbc: string | null;
  fbp: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  utmTerm: string | null;
}

/** An ad id or ad set id: digits, as Meta issues them. */
const META_ID = /^\d{5,30}$/;
/** Meta's click id: URL-safe characters. */
const FBCLID = /^[A-Za-z0-9_-]{8,400}$/;
/** `fb.<subdomainIndex>.<creationTimeMs>.<fbclid>` */
const FBC = /^fb\.[0-3]\.\d{10,13}\.[A-Za-z0-9_-]{8,400}$/;
/** `fb.<subdomainIndex>.<creationTimeMs>.<random digits>` */
const FBP = /^fb\.[0-3]\.\d{10,13}\.\d{5,20}$/;

const UTM_MAX = 100;

/** A short plain label: trimmed, no control characters, at most 100, or null. */
export function cleanLabel(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  // eslint-disable-next-line no-control-regex
  const t = v.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, UTM_MAX);
  return t || null;
}

const idOrNull = (v: unknown) => (typeof v === 'string' && META_ID.test(v.trim()) ? v.trim() : null);

/** The Meta click cookie for a click id first seen at `at` (ms since epoch). */
export function fbcFromClickId(fbclid: string, at: number): string | null {
  return FBCLID.test(fbclid) && Number.isFinite(at) && at > 0 ? `fb.1.${Math.trunc(at)}.${fbclid}` : null;
}

/** The server's reading of whatever `raw.attribution` held. Never throws; an absent or odd value is all-null. */
export function readWebAttribution(raw: unknown, now: number = Date.now()): WebAttribution {
  const a = (raw && typeof raw === 'object' ? (raw as { attribution?: unknown }).attribution : null) as
    | Record<string, unknown>
    | null
    | undefined;
  const o = a && typeof a === 'object' ? a : {};

  const cookie = typeof o.fbc === 'string' && FBC.test(o.fbc.trim()) ? o.fbc.trim() : null;
  const clid = typeof o.fbclid === 'string' ? o.fbclid.trim() : '';
  return {
    adId: idOrNull(o.ad_id),
    adsetId: idOrNull(o.adset_id),
    // The cookie wins (it carries the moment of the click); a bare click id
    // is wrapped at the order's own time, which Meta accepts as a creation time.
    fbc: cookie ?? fbcFromClickId(clid, now),
    fbp: typeof o.fbp === 'string' && FBP.test(o.fbp.trim()) ? o.fbp.trim() : null,
    utmSource: cleanLabel(o.utm_source),
    utmMedium: cleanLabel(o.utm_medium),
    utmCampaign: cleanLabel(o.utm_campaign),
    utmContent: cleanLabel(o.utm_content),
    utmTerm: cleanLabel(o.utm_term),
  };
}

/** True when there is nothing worth writing — the order is created exactly as it was. */
export function isEmptyAttribution(a: WebAttribution): boolean {
  return Object.values(a).every((v) => v === null);
}

// ── THE BROWSER'S HALF ────────────────────────────────────────────────────

const STORE_KEY = 'zaki_attribution';

function cookieValue(name: string): string {
  try {
    const hit = document.cookie.split('; ').find((c) => c.startsWith(`${name}=`));
    return hit ? decodeURIComponent(hit.slice(name.length + 1)) : '';
  } catch {
    return '';
  }
}

/**
 * Gather this visit's attribution: from the URL if it is still there,
 * otherwise from where it was kept the first time it was seen (a visitor who
 * reads the page, asks somebody, and comes back has often lost the query
 * string — the same reason `campaign` is kept). Session storage, not local:
 * it belongs to this visit, and a sale next month did not come from last
 * month's ad.
 *
 * The cookies are read at submit — they are the freshest — and the click id is
 * remembered with the moment it was first seen, so the `_fbc` built from it
 * carries the click's time and not the order's.
 */
export function collectWebAttribution(): WebAttributionPayload {
  if (typeof window === 'undefined') return {};
  const out: WebAttributionPayload = {};
  let kept: Record<string, string> = {};
  try {
    kept = JSON.parse(sessionStorage.getItem(STORE_KEY) || '{}') as Record<string, string>;
  } catch {
    kept = {};
  }

  let q: URLSearchParams | null = null;
  try {
    q = new URLSearchParams(window.location.search);
  } catch {
    q = null;
  }
  const fresh = (k: string) => (q?.get(k) || '').slice(0, 500);

  for (const k of ['ad_id', 'adset_id', 'fbclid', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']) {
    const v = fresh(k);
    if (v) kept[k] = v;
  }
  if (kept.fbclid && !kept.fbclid_at) kept.fbclid_at = String(Date.now());
  try {
    sessionStorage.setItem(STORE_KEY, JSON.stringify(kept));
  } catch {
    // Private mode, blocked storage — the URL alone has to do.
  }

  for (const k of ['ad_id', 'adset_id', 'fbclid', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'] as const) {
    if (kept[k]) out[k] = kept[k];
  }
  const fbc = cookieValue('_fbc') || (kept.fbclid ? fbcFromClickId(kept.fbclid, Number(kept.fbclid_at)) || '' : '');
  if (fbc) out.fbc = fbc;
  const fbp = cookieValue('_fbp');
  if (fbp) out.fbp = fbp;
  return out;
}
