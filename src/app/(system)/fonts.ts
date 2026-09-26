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
});

/**
 * Kept as the Latin fallback, for the few places that are Latin only — a
 * tracking number, an English tagline — and as the second name in the
 * stack if the Arabic face fails to load.
 */
export const publicSans = Public_Sans({
  variable: '--font-public-sans',
  subsets: ['latin'],
  display: 'swap',
});

/** The class that puts the system's font variables in scope. */
export const systemFontVars = `${arabic.variable} ${publicSans.variable}`;
