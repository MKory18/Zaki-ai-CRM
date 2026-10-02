import { IBM_Plex_Sans_Arabic, Public_Sans } from 'next/font/google';

/**
 * THE SYSTEM'S OWN FACES — the dashboard's, never a storefront's.
 *
 * Defined once so the system layout and the system's error screens (which
 * render outside it) share the same instances. Public pages load none of
 * this: a shopper's browser was downloading the dashboard's fonts on every
 * landing page.
 *
 * IBM Plex Sans Arabic carries both scripts in one family, so an Arabic
 * label and the Latin order number beside it sit on the same baseline with
 * the same weight — which Tajawal beside Public Sans did not. It also has
 * real tabular figures, which is the whole argument on a screen where every
 * column is a number.
 */
export const arabic = IBM_Plex_Sans_Arabic({
  variable: '--font-arabic',
  subsets: ['arabic', 'latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  /*
   * NO PRELOAD — measured on a storefront page in a production build.
   *
   * These faces are the DASHBOARD's and the root layout does not carry
   * them, yet nine `<link rel="preload" as="font">` for them appeared in
   * the HTML of `/s/<shop>/shop`: 218 KB fetched at the highest priority
   * a browser has, on a page that applies none of it — the stylesheet
   * declaring them was preloaded too and never linked. On the connection
   * this shop is held to, that is the whole budget spent before the first
   * product is painted.
   *
   * What `preload: false` costs is on the dashboard, and it is small: a
   * logged-in seller loads these faces on their first screen instead of
   * at the same moment as the document, and has them cached from then on.
   * What it buys is the shopper's first screen.
   */
  preload: false,
});

/**
 * Kept as the Latin fallback, for the few places that are Latin only — a
 * tracking number, an English tagline — and as the second name in the
 * stack if the Arabic face fails to load.
 */
export const publicSans = Public_Sans({
  variable: '--font-public-sans',
  subsets: ['latin'],
  /*
   * TWO WEIGHTS, NAMED — because asking for none did not mean «the normal
   * one». Measured in the build output: with no `weight` the loader pulled
   * **Thin (100) alone**, 51 KB of it, and Thin is the face this stack
   * falls back to for any Latin glyph the Arabic family does not carry. So
   * the fallback was rendering hairline, which nobody would think to blame
   * on a font declaration.
   */
  weight: ['400', '600'],
  display: 'swap',
  /* Same reason as above — see the note on `arabic`. */
  preload: false,
});

/** The class that puts the system's font variables in scope. */
export const systemFontVars = `${arabic.variable} ${publicSans.variable}`;
