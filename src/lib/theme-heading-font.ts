/**
 * ═══════════════════════════════════════════════════════════════════════
 * THE TWO ISLAMIC THEMES WEAR A FACE OF THEIR OWN ON TITLES — AND ON TITLES ONLY.
 *
 * The owner, 21/10: «الشكل خرافي مستوحى من الإسلامي». A palette, an arch and
 * a rosette make a screen look Islamic, and the letters on it still said IBM
 * Plex — a face drawn for columns of numbers. A title is the one thing on a
 * screen where nothing is being measured or decided, so a title is where a
 * face with a character may go: Reem Kufi, a modern Kufic with square
 * shoulders, SIL OFL 1.1.
 *
 * ── THE SAME LINE THE OWNER DREW FOR DECORATION ──
 *
 * «ولا رسمة ورا رقم أو مبلغ.» A figure, a table cell, a form field and a
 * paragraph stay in the system's own face: the rule below names `h1`, `h2`
 * and `h3` and nothing else. (A digit inside a title prints in the title's
 * face — Western digits, like everywhere in the product.)
 *
 * ── TWO THEMES, AND THE REST UNTOUCHED ──
 *
 * Nine themes are not Islamic and keep Plex exactly as before. `تلقائي`
 * resolves to a dark and a light theme that are neither of the two, so it
 * keeps Plex too. That is not a restriction to be relaxed later for
 * variety: a Kufic face under a neon grid or a sea chart is a costume.
 *
 * ── AND IT COSTS THE STYLESHEET NOTHING ──
 *
 * Not a fourth `next/font/local` family: that would put an `@font-face` and
 * a size-adjusted fallback in the first-load sheet for every browser,
 * Islamic or not, and `quality-gates.test.ts` holds that sheet to a byte
 * budget with a handful of bytes to spare. Written into the document by
 * `SystemFrame`, beside the palette, the shape and the decoration, for the
 * one theme this person chose — see `SHEET_THEMES` in system-themes.ts. A
 * browser only fetches a web font when text is drawn in it, so somebody on
 * an Islamic theme downloads one file the first time a title appears, and
 * everybody else downloads nothing.
 *
 * ── THE FILE IS IN THIS REPOSITORY ──
 *
 * `the-build-asks-nobody-for-a-font.test.ts` explains why no build may
 * reach for a font on the network. This one lives beside Kawkab in
 * `public/fonts/`: reachable before sign-in (`/fonts` is in `PUBLIC_PATHS`
 * in proxy.ts, which is where the door needs it), allowed by the CSP's
 * `font-src 'self'`, and kept by the service worker for good — which is why
 * a new subset gets a NEW file name and is never edited in place.
 *
 * (Hashes are cut to 16 characters on purpose: `scripts/scan-secrets.mjs`
 * reads any 32 hex characters in a source file as a leaked secret. The whole
 * sha256 is in the test beside this file; the whole commit and blob ids are
 * in the pull request that added the font.)
 *
 *   source     github.com/google/fonts  ofl/reemkufi/ReemKufi[wght].ttf
 *              commit 8b0a1d0f5983c89b…
 *              127,152 bytes, git blob ad1a769f41ed4a2b…
 *   licence    public/fonts/reem-kufi-OFL.txt, byte for byte the upstream
 *              blob 55f55c9e2ce32806…. Its Reserved
 *              Font Name is «Josefin Sans» (the Latin glyphs descend from
 *              it) — this file keeps the family name «Reem Kufi» and never
 *              uses the reserved one. The copyright and the licence notice
 *              also stay inside the font's own name table.
 *   shipped    public/fonts/reem-kufi-var.woff2, 24,584 bytes, sha256
 *              3f0c9bfeafb362bb… (the whole value is pinned by the test
 *              beside this file): one VARIABLE
 *              file, weight 400–700. Titles are 600 today — the unlayered
 *              `h1…h6 { font-weight: 600 }` in system.css beats `font-bold`,
 *              measured in a browser — and a file that covers the whole range
 *              lets that rule move without a faux-bold; it also costs less
 *              than two static weights (31 KB against its 24).
 *              366 glyphs: Arabic, Western digits and basic Latin, the
 *              guillemets «», the dashes and quotes of ordinary typing.
 *              Every character in the menu labels, the screen titles and
 *              the guide texts is in it (105 distinct, none missing).
 *
 * To rebuild it (fontTools 4.65.0, brotli 1.2.0 — the output is byte-for-
 * byte repeatable):
 *
 *   pyftsubset ReemKufi[wght].ttf --flavor=woff2 --no-hinting \
 *     --layout-features='*' --name-IDs='0,1,2,3,4,5,6,9,13,14' \
 *     --unicodes='U+0020-007E,U+00A0,U+00AB,U+00BB,U+00B7,U+00D7,U+0600-06FF,U+0750-077F,U+200B-200F,U+2013,U+2014,U+2018,U+2019,U+201C,U+201D,U+2022,U+2026' \
 *     --output-file=reem-kufi-var.woff2
 *
 * `--layout-features='*'` is the one that matters: Arabic joining lives in
 * `init`, `medi`, `fina`, `rlig`, `ccmp` and `locl`, and a subset that drops
 * them draws every word as a row of unjoined letters.
 * ═══════════════════════════════════════════════════════════════════════
 */
import type { SystemTheme } from './system-themes';

/** The family name the rule asks for. */
export const HEADING_FACE = 'Reem Kufi';

/** Where the browser fetches it from — `public/fonts/`, never edited in place. */
export const HEADING_FACE_FILE = '/fonts/reem-kufi-var.woff2';

/** The two themes that wear it, and no others. */
export const HEADING_FACE_THEMES: readonly string[] = ['islamic-epic', 'islamic-calm'];

/** Titles. Not `h4`–`h6`, which here are small labels inside cards and tables. */
export const HEADING_TAGS = ['h1', 'h2', 'h3'] as const;

/**
 * What a glyph the subset lacks falls back to: the system's own stack, the
 * first three of which are the variables `SystemFrame` defines on `:root`.
 * A title never shows a box because the Kufic face did not draw one letter.
 */
export const HEADING_FALLBACK = 'var(--font-arabic),var(--font-arabic-latin),var(--font-public-sans),sans-serif';

/**
 * The CSS for one theme's titles, or nothing.
 *
 * Empty for every theme that is not one of the two — and so for `تلقائي`,
 * which `themeByKey` resolves to the dark default — so nothing is written
 * that would change nothing.
 *
 * `font-display: swap`, like the system's other faces: the title appears at
 * once in Plex and is redrawn when the file arrives. Not `optional`, which
 * on a slow phone would mean the Islamic theme never shows its face on the
 * first screen; not preloaded, for the reason `fonts.ts` gives for all of
 * them (a preload is a request made before anybody knows the page will
 * draw a title in it).
 */
export function headingFontCss(theme: SystemTheme): string {
  if (!HEADING_FACE_THEMES.includes(theme.key)) return '';
  return (
    `@font-face{font-family:'${HEADING_FACE}';font-style:normal;font-weight:400 700;font-display:swap;` +
    `src:url(${HEADING_FACE_FILE}) format('woff2')}` +
    `[data-sys-theme='${theme.key}'] :is(${HEADING_TAGS.join(',')}){font-family:'${HEADING_FACE}',${HEADING_FALLBACK}}`
  );
}
