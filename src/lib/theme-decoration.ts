/**
 * ═══════════════════════════════════════════════════════════════════════
 * DECORATION, AND THE THREE PLACES IT IS ALLOWED.
 *
 * Eleven themes, and eight of them are MOODS — neon, gold, parchment,
 * a sky with no moon. A mood that is nothing but thirty-four hexes is a
 * recoloured spreadsheet, so each theme may put an ambient touch on the
 * screen. And then the rule that matters:
 *
 *   ⚠️ NEVER WHERE THE DATA IS.
 *
 * Not behind a table, not behind a form, not behind an order, a figure of
 * money or a stock count. A glow under a column of numbers is a glow
 * somebody has to read through, every row, all day — and the person
 * reading it is deciding whether to ship something. The brand earns
 * attention at the door; inside, the numbers do.
 *
 * So there are exactly three places, and they are the three where nothing
 * is being measured or decided:
 *
 *   • `door`    — sign in, pick a country, pick a store, the splash.
 *   • `empty`   — a list with nothing in it yet.
 *   • `sidebar` — the header above the menu, where the wordmark sits.
 *
 * `a-theme-is-not-a-mood-swing.test.ts` sweeps every screen that renders
 * orders, money or stock and fails if one of them draws any of this.
 *
 * ── AND IT COSTS THE STYLESHEET NOTHING ──
 *
 * `decorCss` is written into the document by `SystemFrame`, beside the one
 * palette that person chose — the same reason, the same place. Somebody
 * who turned decoration off downloads none of it, and the first-load
 * stylesheet that reaches everybody does not grow by a byte. See
 * `SHEET_THEMES` in system-themes.ts.
 * ═══════════════════════════════════════════════════════════════════════
 */
import { AUTO_DARK, AUTO_LIGHT, AUTO_THEME, type SystemTheme } from './system-themes';

/**
 * OFF · LIGHT · FULL — and `light` is the default.
 *
 * Not `full`: the default has to be the setting somebody who never opens
 * settings would have chosen, and that is a touch rather than a show.
 * Not `off` either — eight of these themes would then be a palette with a
 * name.
 */
export const DECOR_LEVELS = ['off', 'light', 'full'] as const;
export type DecorLevel = (typeof DECOR_LEVELS)[number];
export const DEFAULT_DECOR: DecorLevel = 'light';

/** The three places, and nowhere else. */
export const DECOR_PLACES = ['door', 'empty', 'sidebar'] as const;
export type DecorPlace = (typeof DECOR_PLACES)[number];

/** The class a decoration layer carries, so one sweep can find all of them. */
export const DECOR_CLASS = 'zk-decor';

/** Only a level this build knows — a stored typo must not blank a screen. */
export function sanitizeDecor(raw: unknown): DecorLevel {
  return (DECOR_LEVELS as readonly unknown[]).includes(raw) ? (raw as DecorLevel) : DEFAULT_DECOR;
}

/**
 * The cookie, read on the server so the attribute is in the HTML the
 * browser parses — no script, no flash, and no migration for a setting
 * that belongs to a browser rather than to an account.
 */
export const DECOR_COOKIE = 'zk-decor';

/**
 * The ambient CSS for one theme at one level.
 *
 * Built ENTIRELY from that theme's own tokens: `--sys-primary` and
 * `--sys-primary-soft` at low alpha over `--sys-background`. A decoration
 * with a hex of its own is a twelfth palette nobody measured, and
 * `system-themes.test.ts` would not be looking at it.
 *
 * ── WHAT EACH LEVEL ACTUALLY IS ──
 *
 * `light` is STATIC: two soft radial washes. Nothing moves, so there is
 * nothing for reduced motion to switch off and nothing for a hidden tab to
 * waste a frame on. That is the point of making it the default.
 *
 * `full` adds one slow drift on top — 24 seconds, a few pixels, a glow
 * rather than a thing. It is:
 *   • killed outright by `prefers-reduced-motion: reduce`, not slowed;
 *   • paused while the tab is hidden, via `[data-decor-hidden]`, because
 *     an animation in a background tab is a phone's battery for nobody.
 */
export function decorCss(theme: SystemTheme, level: DecorLevel, chosenKey?: string): string {
  if (level === 'off') return '';
  /*
   * ── «تلقائي» WEARS TWO ORNAMENTS, FOR THE SAME REASON IT HAS TWO PALETTES ──
   *
   * `themeByKey` resolves `auto` to the dark theme, because a function
   * that must return one theme has to pick one. The palette does not
   * work that way — `auto` carries both and lets the device choose — and
   * an ornament pinned to the dark one would put a radar sweep over a
   * white screen at noon. So the raw key is passed in, and when it is
   * `auto` both masks are written with the light one behind a media
   * query, exactly as the palette does it.
   */
  const art =
    chosenKey === AUTO_THEME
      ? ornament(AUTO_DARK) +
        `@media (prefers-color-scheme: light){${ornament(AUTO_LIGHT)}}`
      : ornament(theme.key);
  const wash =
    `.${DECOR_CLASS}{position:absolute;inset:0;pointer-events:none;z-index:0;` +
    `background:` +
    `radial-gradient(120% 85% at 85% 0%,var(--sys-primary-soft) 0%,transparent 55%),` +
    `radial-gradient(100% 70% at 10% 100%,var(--sys-primary-soft) 0%,transparent 50%)}` +
    // The sidebar header is a short strip, so the wash comes from one side
    // only; two washes in 56 pixels read as a smudge.
    `.${DECOR_CLASS}-sidebar{background:radial-gradient(140% 160% at 100% 0%,var(--sys-primary-soft) 0%,transparent 70%)}` +
    art;
  if (level === 'light') return wash;
  /*
   * ── A COMPOSED THEME TURNS ITS ROSETTE; IT DOES NOT DRIFT ──
   *
   * The drift moves the whole layer by up to 2% — a glow that wanders, which
   * is fine for a wash and wrong for a corner and a roofline that are
   * anchored to the edges of the screen: they would show a seam of
   * background along one side for half of every cycle. So the layer stays
   * put and only the rosette moves, once round in seven minutes — slow
   * enough that nobody sees it turn and everybody sees that it did.
   *
   * Door only. An empty list's box is wider than it is tall, and a mask
   * cannot be drawn outside the box it belongs to, so a rosette turning
   * inside one would be clipped differently every frame.
   *
   * The same two guards as the drift, for the same two reasons: reduced
   * motion removes it outright, and a hidden tab pauses it.
   */
  if (COMPOSED[theme.key] && chosenKey !== AUTO_THEME) {
    return (
      wash +
      `@keyframes zk-decor-turn{to{transform:rotate(1turn)}}` +
      `.${DECOR_CLASS}-door.${DECOR_CLASS}-full::before{animation:zk-decor-turn 420s linear infinite}` +
      `[data-decor-hidden] .${DECOR_CLASS}-door.${DECOR_CLASS}-full::before{animation-play-state:paused}` +
      `@media (prefers-reduced-motion: reduce){.${DECOR_CLASS}-door.${DECOR_CLASS}-full::before{animation:none}}`
    );
  }
  return (
    wash +
    `@keyframes zk-decor-drift{from{transform:translate3d(0,0,0)}to{transform:translate3d(-2%,1.5%,0)}}` +
    `.${DECOR_CLASS}-full{animation:zk-decor-drift 24s ease-in-out infinite alternate;will-change:transform}` +
    `[data-decor-hidden] .${DECOR_CLASS}-full{animation-play-state:paused}` +
    `@media (prefers-reduced-motion: reduce){.${DECOR_CLASS}-full{animation:none}}`
  );
}

/**
 * ═══════════════════════════════════════════════════════════════════════
 * AND THE ORNAMENT EACH THEME WEARS — SHAPE ONLY, NEVER COLOUR.
 *
 * Eleven drawings live in `public/brand/decor/<key>.webp`, one per theme:
 * a radar sweep, a girih star, an orbit, a laurel, a compass. They are
 * **masks** — one channel of coverage, no colour at all — and the colour
 * is painted through them from `--sys-primary`.
 *
 * That is not a size trick, though it is also that (440 KB for all eleven
 * instead of 1.6 MB, and one of them reaches one person). It is the rule
 * three paragraphs up, kept: «a decoration with a hex of its own is a
 * twelfth palette nobody measured». A full-colour picture carries its own
 * greens and golds that no palette test ever looks at, and it would stay
 * that colour when the theme's primary changed. A mask cannot drift,
 * because it has nothing to drift with.
 *
 * ── AND THE MIDDLE OF EVERY ONE OF THEM IS EMPTY ──
 *
 * Each mask fades to nothing across the middle fifth of the frame, so
 * every ornament is a FRAME rather than a picture. The three places all
 * put their content in the centre — the sign-in card, the empty state's
 * sentence, the sidebar's wordmark — so the hole is exactly where the
 * reading happens. It is cut into the art, not asked for in CSS, because
 * the one thing a background must never do is sit between a person and a
 * number.
 *
 * ── AND HOW LOUD EACH ONE IS, IS MEASURED ──
 *
 * Not chosen. Each mask was weighed by how much LIGHT it moves against
 * its own theme's background — the same quantity a contrast ratio is
 * built from — and given the opacity that lands all eleven on one target.
 * That is why these numbers are not round: `epic`'s gold on charcoal is
 * the biggest brightness gap in the set and lands at 0.36, while `cyber`'s
 * hairline on black cannot reach the target at all and is left whole.
 *
 * Measured, so the louder art is quieter by arithmetic rather than by
 * somebody squinting at it once — and so a replacement drawing cannot
 * quietly arrive at the wrong volume: re-run the measurement and this
 * table changes with it.
 */
const DECOR_INK: Record<string, number> = {
  ops: 0.397,
  day: 0.031,
  calm: 0.15,
  cyber: 1,
  space: 1,
  sea: 0.19,
  city90: 0.192,
  epic: 0.144,
  lux: 0.24,
};

/**
 * ═══════════════════════════════════════════════════════════════════════
 * A THEME THAT WEARS THREE DRAWINGS, NOT ONE.
 *
 * The owner, 21/10: «الشكل خرافي مستوحى من الإسلامي حتى الرسوميات». One
 * mask behind a sign-in card is a pattern; the two Islamic themes are
 * meant to be a PLACE — a rosette to stand in front of, a corner of vine
 * and strapwork at each top corner, and a city's roofline along the
 * bottom. Each is its own drawing (`<key>.rosette.webp`, `.corner.webp`,
 * `.skyline.webp`), all masks, all painted from `--sys-primary`, so the
 * rule above holds for every one of them: no colour of their own.
 *
 * ── WHERE EACH GOES, AND WHY NOT ANYWHERE ELSE ──
 *
 *   door     rosette centred, a corner in each top corner, the skyline on
 *            the bottom edge. The corners and the skyline sit at the
 *            VIEWPORT'S edges, where nothing is ever drawn, so they work
 *            at any width — a frame around the card would have needed the
 *            card to be one size.
 *   empty    the rosette alone, fitted to the box. A list with nothing in
 *            it is the other place that is not measuring anything.
 *   sidebar  one corner, at the end of the header away from the wordmark.
 *
 * Never behind a figure. `a-theme-is-not-a-mood-swing.test.ts` sweeps the
 * screens for that and is not touched.
 *
 * ── THE LEFT CORNER IS THE RIGHT ONE, TURNED ──
 *
 * One drawing, mirrored by `transform: scaleX(-1)` on the layer that
 * carries it. A second file of the same drawing would be 68 KB of the same
 * bytes, for a person who only ever sees one of them at a time.
 *
 * ── AND THE NUMBERS BELOW ARE CHOSEN, NOT MEASURED ──
 *
 * The eleven single masks were weighed by the light they move and given the
 * opacity that put them on one target (above). That worked for one mask
 * behind a card and it did not survive a browser: a proof sheet of 260px
 * tiles measured a kinder screen than the real door, and the first build
 * put a radar through the wordmark. These three are set by eye, in a
 * browser, at 1920, 1280 and 390 pixels wide, over the real card size.
 * The corners and the skyline are quieter than they look and the rosette
 * quieter still, because the rosette is the one that sits where text is.
 *
 * The CSS below does exactly one thing differently from a single mask: it
 * hides the circuit-wave banner the door draws under everything
 * (`.zk-door-banner`), because a door that brings its own picture should
 * not be wearing another one beneath it.
 * ═══════════════════════════════════════════════════════════════════════
 */
export interface Composition {
  rosette: number;
  corner: number;
  skyline: number;
}
export const COMPOSED: Record<string, Composition> = {
  // Night: navy and gold. Dense strapwork, a grand skyline — louder, because
  // gold on navy is a gentler pair than it looks and carries the weight.
  'islamic-epic': { rosette: 0.15, corner: 0.28, skyline: 0.17 },
  // Day: ivory and green. Single lines and palms — quieter, because dark on
  // pale paper is the loudest pairing in the set.
  'islamic-calm': { rosette: 0.14, corner: 0.24, skyline: 0.16 },
};

/** The three drawings of a composed theme, by the name the file carries. */
export const PIECES = ['rosette', 'corner', 'skyline'] as const;

function composed(key: string, c: Composition): string {
  const D = DECOR_CLASS;
  const url = (piece: string) => `url(/brand/decor/${key}.${piece}.webp)`;
  // `at` and `size` are the two halves of the mask shorthand, and the
  // shorthand is written in both spellings: Safari still wants the prefix.
  const paint = (piece: string, at: string, size: string, opacity: number) =>
    `background-color:var(--sys-primary);opacity:${opacity};` +
    `-webkit-mask:${url(piece)} no-repeat ${at}/${size};mask:${url(piece)} no-repeat ${at}/${size}`;
  const pseudo = `content:'';position:absolute;inset:0;`;
  const box = `position:absolute;inset:0;`;
  const CORNER = 'min(46vmin,420px) auto';
  return (
    // The door brings its own picture; take the circuit wave out from under it.
    `.zk-door-banner{display:none}` +
    // ── the door ──
    // The rosette is `::before`, so it is painted FIRST and the corners and
    // the skyline sit over it where they meet at the bottom.
    `.${D}-door::before{${pseudo}${paint('rosette', 'center', 'min(92vmin,1000px)', c.rosette)}}` +
    `.${D}-door::after{${pseudo}${paint('corner', 'right top', CORNER, c.corner)}}` +
    `.${D}-door .${D}-l{${box}${paint('corner', 'right top', CORNER, c.corner)};transform:scaleX(-1)}` +
    `.${D}-door .${D}-b{${box}${paint('skyline', 'center bottom', 'min(100%,1700px) auto', c.skyline)}}` +
    // ── an empty list: the rosette, fitted to the box, never cropped by it ──
    `.${D}-empty::after{${pseudo}${paint('rosette', 'center', 'contain', c.rosette)}}` +
    // ── the sidebar: one corner, at the end away from the wordmark ──
    `.${D}-sidebar::after{${pseudo}${paint('corner', 'right top', '170px auto', c.corner)};transform:scaleX(-1)}`
  );
}

/**
 * The mask layer for one theme, or nothing.
 *
 * `mask-image` with the `-webkit-` prefix beside it: Safari still wants
 * the prefixed property, and a theme losing its ornament is a smaller
 * failure than a solid primary-coloured square, which is what an ignored
 * mask leaves behind. Hence `background-color` only inside this rule.
 */
function ornament(key: string): string {
  if (COMPOSED[key]) return composed(key, COMPOSED[key]);
  const ink = DECOR_INK[key];
  if (!ink) return '';
  const url = `url(/brand/decor/${key}.webp)`;
  return (
    `.${DECOR_CLASS}::after{content:'';position:absolute;inset:0;` +
    `background-color:var(--sys-primary);opacity:${ink};` +
    `-webkit-mask:${url} no-repeat center/contain;mask:${url} no-repeat center/contain}` +
    // ── THE DOOR'S IS BIG BECAUSE THE HOLE HAS TO CLEAR THE CARD ──
    //
    // The empty middle is a fixed fraction of the art, so the only way to
    // make it wider than the sign-in card is to make the whole ornament
    // wider. At 620px the hole was about 270 and the card is about 420, so
    // the drawing ran straight through the wordmark — which a browser
    // showed and the proof sheet did not. At 1020 the hole clears it.
    `.${DECOR_CLASS}-door::after{-webkit-mask-size:min(96vmin,1020px);mask-size:min(96vmin,1020px)}` +
    `.${DECOR_CLASS}-empty::after{-webkit-mask-size:320px;mask-size:320px}` +
    // A corner, bled off the top edge, so the strip above the menu carries
    // a hint of the ornament rather than a small complete copy of it.
    `.${DECOR_CLASS}-sidebar::after{-webkit-mask:${url} no-repeat right -40px top -64px/200px;` +
    `mask:${url} no-repeat right -40px top -64px/200px}`
  );
}

/** A year. A preference about a background does not expire with a session. */
const KEEP = 60 * 60 * 24 * 365;

/** What this browser last chose. Falls to the default rather than to nothing. */
export function readDecor(): DecorLevel {
  try {
    const m = new RegExp(`${DECOR_COOKIE}=([a-z]+)`).exec(document.cookie);
    return sanitizeDecor(m?.[1]);
  } catch {
    // A browser that refuses cookies gets the default, which is the level
    // that needs no explanation.
    return DEFAULT_DECOR;
  }
}

/**
 * Remember it — and then RELOAD, deliberately.
 *
 * The CSS for this is written into the document by the server, because
 * that is what keeps it out of the stylesheet everybody downloads. So the
 * new level arrives with the next HTML, and the honest way to apply it is
 * to ask for that HTML. The alternative — shipping all three levels and
 * switching a class — is the ten kilobytes this whole arrangement exists
 * to avoid, for a setting somebody changes about twice.
 */
export function setDecor(level: DecorLevel): void {
  try {
    document.cookie = `${DECOR_COOKIE}=${level}; path=/; max-age=${KEEP}; SameSite=Lax`;
  } catch {
    /* Remembering is a convenience; the reload below still applies it. */
  }
}
