import localFont from 'next/font/local';

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
 *
 * ── THE FILES ARE IN THIS REPOSITORY, AND THAT IS THE POINT ──
 *
 * This read `next/font/google`, which fetches the faces from
 * `fonts.googleapis.com` and `fonts.gstatic.com` AT BUILD TIME. So every
 * build depended on a third party being reachable, and one build in CI
 * failed with six copies of
 *
 *     Module not found: Can't resolve
 *     '@vercel/turbopack-next/internal/font/google/font'
 *
 * and then passed on a re-run with nothing changed. That was a nuisance
 * while a build only gated a pull request. It stopped being one when the
 * build became the DEPLOY: `image.yml` builds the production image, so the
 * same hiccup now stops a release rather than a review.
 *
 * ── AND IT COSTS NOTHING, MEASURED ──
 *
 * `next/font/google` does not link to Google at run time either: it
 * downloads these very files and self-hosts them. So this is not a trade
 * between weight and independence — it is the same bytes, from here:
 *
 *     plex-arabic   400/500/600/700   42,848 · 45,296 · 45,688 · 44,280
 *     plex-latin    400/500/600/700   19,164 · 20,088 · 20,500 · 19,504
 *     public-latin  400/600           26,832 · 26,832
 *     total                           311,032 bytes
 *
 * ── WHY THREE FAMILIES WHERE THERE WERE TWO ──
 *
 * Google serves each family split by script, and `localFont` takes one
 * file per weight — two files of the same weight in one call is a
 * conflict. So the Arabic subset and the Latin subset of Plex are two
 * calls, and the font stack in `system.css` names them in order:
 *
 *     var(--font-arabic), var(--font-arabic-latin), var(--font-public-sans)
 *
 * which is ordinary per-glyph fallback: an Arabic glyph comes from the
 * first, a Latin digit from the second. Nothing on a dashboard page is one
 * script only, so both were always fetched — the `unicode-range` that is
 * lost with the split was saving nothing here.
 *
 * Licence: both families are SIL OFL 1.1 — see `fonts/OFL.txt`.
 */

/** Arabic — the face almost every glyph on these screens comes from. */
export const arabic = localFont({
  src: [
    { path: './fonts/plex-arabic-400.woff2', weight: '400', style: 'normal' },
    { path: './fonts/plex-arabic-500.woff2', weight: '500', style: 'normal' },
    { path: './fonts/plex-arabic-600.woff2', weight: '600', style: 'normal' },
    { path: './fonts/plex-arabic-700.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--font-arabic',
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
 * The Latin half of the SAME family, so an order number beside an Arabic
 * label keeps the same baseline and the same weight. Second in the stack:
 * the Arabic face above carries no Latin glyphs of its own in this subset,
 * so every digit and every English word falls through to here.
 */
export const arabicLatin = localFont({
  src: [
    { path: './fonts/plex-latin-400.woff2', weight: '400', style: 'normal' },
    { path: './fonts/plex-latin-500.woff2', weight: '500', style: 'normal' },
    { path: './fonts/plex-latin-600.woff2', weight: '600', style: 'normal' },
    { path: './fonts/plex-latin-700.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--font-arabic-latin',
  display: 'swap',
  /* Same reason as above — see the note on `arabic`. */
  preload: false,
});

/**
 * Kept as the Latin fallback, for the few places that are Latin only — a
 * tracking number, an English tagline — and as the last named face in the
 * stack if either Plex file fails to load.
 *
 * TWO WEIGHTS, NAMED — because asking for none did not mean «the normal
 * one». Measured in the build output back when this came from Google: with
 * no `weight` the loader pulled **Thin (100) alone**, 51 KB of it, and
 * Thin is the face this stack falls back to for any Latin glyph the Arabic
 * family does not carry. So the fallback was rendering hairline, which
 * nobody would think to blame on a font declaration.
 */
export const publicSans = localFont({
  src: [
    { path: './fonts/public-latin-400.woff2', weight: '400', style: 'normal' },
    { path: './fonts/public-latin-600.woff2', weight: '600', style: 'normal' },
  ],
  variable: '--font-public-sans',
  display: 'swap',
  /* Same reason as above — see the note on `arabic`. */
  preload: false,
});

/** The class that puts the system's font variables in scope. */
export const systemFontVars = `${arabic.variable} ${arabicLatin.variable} ${publicSans.variable}`;
