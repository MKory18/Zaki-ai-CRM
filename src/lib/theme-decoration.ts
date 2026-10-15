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
import type { SystemTheme } from './system-themes';

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
export function decorCss(theme: SystemTheme, level: DecorLevel): string {
  if (level === 'off') return '';
  const wash =
    `.${DECOR_CLASS}{position:absolute;inset:0;pointer-events:none;z-index:0;` +
    `background:` +
    `radial-gradient(120% 85% at 85% 0%,var(--sys-primary-soft) 0%,transparent 55%),` +
    `radial-gradient(100% 70% at 10% 100%,var(--sys-primary-soft) 0%,transparent 50%)}` +
    // The sidebar header is a short strip, so the wash comes from one side
    // only; two washes in 56 pixels read as a smudge.
    `.${DECOR_CLASS}-sidebar{background:radial-gradient(140% 160% at 100% 0%,var(--sys-primary-soft) 0%,transparent 70%)}`;
  if (level === 'light') return wash;
  return (
    wash +
    `@keyframes zk-decor-drift{from{transform:translate3d(0,0,0)}to{transform:translate3d(-2%,1.5%,0)}}` +
    `.${DECOR_CLASS}-full{animation:zk-decor-drift 24s ease-in-out infinite alternate;will-change:transform}` +
    `[data-decor-hidden] .${DECOR_CLASS}-full{animation-play-state:paused}` +
    `@media (prefers-reduced-motion: reduce){.${DECOR_CLASS}-full{animation:none}}`
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
