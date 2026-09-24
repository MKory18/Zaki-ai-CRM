import { Tajawal, Public_Sans } from 'next/font/google';

/**
 * The system's own faces — the dashboard's, never a storefront's.
 *
 * Defined once so the system layout and the system's error screens (which
 * render outside it) share the same instances. Public pages load none of
 * this: a shopper's browser was downloading the dashboard's fonts on every
 * landing page.
 */
export const tajawal = Tajawal({
  variable: '--font-arabic',
  subsets: ['arabic', 'latin'],
  weight: ['400', '500', '700', '800'],
});

export const publicSans = Public_Sans({
  variable: '--font-public-sans',
  subsets: ['latin'],
});

/** The class that puts the system's font variables in scope. */
export const systemFontVars = `${tajawal.variable} ${publicSans.variable}`;
