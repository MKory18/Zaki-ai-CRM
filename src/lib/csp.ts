/**
 * THE CONTENT SECURITY POLICY OF A SELLING PAGE.
 *
 * One definition, read by next.config.ts (for /lp and /s paths) and by the
 * proxy (for a seller's own domain, whose path is "/" and so never matches
 * a path rule). No imports: next.config.ts loads this file before the app
 * exists.
 *
 * WHY THE PIXEL ORIGINS ARE HERE AND NOWHERE ELSE. The tracking engine
 * loads Meta's, TikTok's, Snapchat's and Google's own scripts, and until
 * this list existed every page sent `script-src 'self'` — so the browser
 * refused all four and not one browser pixel ever fired. They are allowed
 * on selling pages only: the dashboard keeps its shut policy, because an
 * admin screen has no business loading an ad network's code.
 */

/** Script hosts of the four pixel loaders in tracking-platforms.ts. */
export const PIXEL_SCRIPT_ORIGINS = [
  'https://connect.facebook.net',
  'https://analytics.tiktok.com',
  'https://sc-static.net',
  'https://www.googletagmanager.com',
] as const;

/** Where those scripts send their events. Images are already allowed (https:). */
export const PIXEL_CONNECT_ORIGINS = [
  'https://www.facebook.com',
  'https://connect.facebook.net',
  'https://analytics.tiktok.com',
  'https://*.tiktok.com',
  'https://tr.snapchat.com',
  'https://*.snapchat.com',
  'https://www.googletagmanager.com',
  'https://www.google-analytics.com',
  'https://*.google-analytics.com',
  'https://*.analytics.google.com',
  'https://www.google.com',
  'https://googleads.g.doubleclick.net',
] as const;

/** Frames the Google Ads tag opens for remarketing. */
export const PIXEL_FRAME_ORIGINS = ['https://td.doubleclick.net', 'https://www.googletagmanager.com'] as const;

/**
 * A landing page or a storefront page.
 *
 * `frame-ancestors 'self'`: the dashboard previews these pages in an
 * iframe; every other site is still refused. Fonts come from Google Fonts,
 * which the theme picker offers.
 */
export const SELLING_PAGE_CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' 'unsafe-eval' ${PIXEL_SCRIPT_ORIGINS.join(' ')}`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data: https://fonts.gstatic.com",
  `connect-src 'self' ${PIXEL_CONNECT_ORIGINS.join(' ')}`,
  `frame-src 'self' ${PIXEL_FRAME_ORIGINS.join(' ')}`,
  "frame-ancestors 'self'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

/** Every header a selling page answers with, beyond the site-wide ones. */
export const SELLING_PAGE_HEADERS: { key: string; value: string }[] = [
  { key: 'Content-Security-Policy', value: SELLING_PAGE_CSP },
  // The catch-all sends DENY; a selling page must allow the same-origin
  // preview frame, or the older header wins in browsers that honour both.
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
];
