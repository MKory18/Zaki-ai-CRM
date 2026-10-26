/**
 * WHICH LANDING-PAGE REQUESTS ARE ANSWERED FROM THE CACHE — the switch, and nothing else.
 *
 * «ابني كاش الصفحة، وخلي العدّ بالطريقتين أسبوع قبل ما نبدّل». The cached page lives at its own internal route
 * (`/lp-cached/<slug>`, revalidated on its own) and the proxy rewrites a visitor's `/lp/<slug>` onto it — only when
 * the owner has turned the switch on (`LP_PAGE_CACHE=1` in Coolify), and never for the seller's preview (`?p=`), which
 * must show the draft and is not a visit.
 *
 * Pure, with no database and no Next import, because the proxy runs it on every request.
 */

export const CACHED_LANDING_PREFIX = '/lp-cached';

/** The owner's switch. Off unless the environment says exactly `1`. */
export function landingCacheOn(env: Record<string, string | undefined> = process.env): boolean {
  return env.LP_PAGE_CACHE === '1';
}

const LANDING_PATH = /^\/lp\/([a-z0-9-]{2,60})\/?$/;

/**
 * The cached route a visit to `pathname` should be answered from, or null to render it per request as before.
 *
 * Only the page itself — not `/lp/<slug>/raw` (the uploaded HTML in its frame) — and only a visit: a preview token
 * keeps the request on the live route.
 */
export function cachedLandingPath(pathname: string, search: URLSearchParams, on = landingCacheOn()): string | null {
  if (!on) return null;
  const m = LANDING_PATH.exec(pathname);
  if (!m || search.has('p')) return null;
  // Written out rather than built from the prefix, so the route is named where it is reached from.
  return `/lp-cached/${m[1]}`;
}

/** The internal route is reached only through the rewrite; asked for directly, it does not exist. */
export function isCachedLandingPath(pathname: string): boolean {
  return pathname === CACHED_LANDING_PREFIX || pathname.startsWith(`${CACHED_LANDING_PREFIX}/`);
}
