/**
 * ═══════════════════════════════════════════════════════════════════════
 * A THEME IS A SHAPE TOO — AND THE SHAPE IS THE FRAME, NEVER THE FIGURE.
 *
 * Eleven palettes made the product eleven colours. The owner's reference
 * screens are not eleven colours: a card under «إسلامي» wears a pointed
 * arch, one under «سايبربنك» has a cut corner and a hard edge, one under
 * «فخامة» a thin gold hairline. That is what makes a theme read as a
 * theme instead of as a filter.
 *
 * ── AND THE LINE THE OWNER DREW HIMSELF ──
 *
 * «ولا رسمة ورا رقم أو مبلغ.» So nothing here goes behind the content:
 *
 *   • the RADIUS and the BORDER are the card's own edge — they cannot sit
 *     under a figure, because they are the frame around it;
 *   • the CROWN is drawn on the top edge, outside the padding;
 *   • the MARK is a small faint glyph in the card's top-left corner — the
 *     corner furthest from the heading in RTL — at 7% of a colour that is
 *     already the card's border. It is a background, so it is behind
 *     everything, catches no click and is announced to nobody.
 *
 * Illustrations — the sunset, the mountains, the planet — stay in the
 * three places decoration is allowed and on the welcome card. Those are
 * `theme-decoration.ts`, and they are a different thing from this.
 *
 * ⚠️ AND THE ARRANGEMENT IS NOT A THEME'S BUSINESS. The owner ruled on it:
 * «الترتيب بيضل لصاحبه، والثيم للشكل بس.» Somebody arranges their
 * dashboard, then changes theme — and if the theme re-ordered it, the
 * theme would have eaten their work. A theme moves surfaces, now shapes,
 * and never the order of anything.
 *
 * ── AND IT COSTS THE STYLESHEET NOTHING ──
 *
 * Written into the document by `SystemFrame` beside the one palette that
 * person chose, for the same reason: see `SHEET_THEMES` in
 * system-themes.ts. Eleven shapes in the first-load sheet would be weight
 * on everybody for the one they picked. The owner's «ضمن سقف ورقة
 * الأنماط» is met by the sheet not growing at all.
 * ═══════════════════════════════════════════════════════════════════════
 */
import type { SystemTheme } from './system-themes';

/** The class a themed card carries, so one rule can find all of them. */
export const CARD_CLASS = 'zk-card';

type Crown = 'none' | 'arch' | 'notch';

interface Shape {
  /** The card's corner. The product's own is `0.5rem` (`rounded-lg`). */
  radius: string;
  /** Its edge. A gold theme earns a hairline; a neon one earns a hard line. */
  border: string;
  crown: Crown;
  /**
   * The corner glyph, as the inside of an SVG at a 24×24 viewBox.
   *
   * Geometry only — a crescent, a star, a ring, a shield outline. Not one
   * of these is anybody's mark, character or likeness, and that is a
   * blocker in the brief rather than a preference.
   */
  mark: string;
}

/**
 * The three that came with the product keep its own shape exactly: this is
 * an addition to eight themes, not a restyle of the product.
 */
const PLAIN: Shape = { radius: '0.5rem', border: '1px', crown: 'none', mark: '' };

export const SHAPES: Record<string, Shape> = {
  ops: PLAIN,
  day: PLAIN,
  calm: PLAIN,

  /** Cut corner, hard edge: a panel stamped out of metal. */
  cyber: {
    radius: '0.125rem',
    border: '1px',
    crown: 'notch',
    mark: '<path d="M4 12h5l2-4 2 8 2-4h5" fill="none" stroke="currentColor" stroke-width="1.6"/>',
  },

  /** A pointed arch, and gold. */
  'islamic-epic': {
    radius: '0.75rem',
    border: '1px',
    crown: 'arch',
    mark: '<path d="M16.5 4.5a8 8 0 1 0 0 15 9.5 9.5 0 0 1 0-15z" fill="currentColor"/>',
  },

  /** The same arch, quieter — an eight-point seal instead of a crescent. */
  'islamic-calm': {
    radius: '0.75rem',
    border: '1px',
    crown: 'arch',
    mark: '<path d="M12 3l2.6 4.1L19 5.6l-.6 4.7 4.1 1.7-4.1 1.7.6 4.7-4.4-1.5L12 21l-2.6-4.1-4.4 1.5.6-4.7L1.5 12l4.1-1.7-.6-4.7 4.4 1.5z" fill="currentColor"/>',
  },

  /** A ringed planet. */
  space: {
    radius: '1rem',
    border: '1px',
    crown: 'none',
    mark: '<circle cx="12" cy="11" r="5" fill="currentColor"/><ellipse cx="12" cy="11" rx="10" ry="3.2" fill="none" stroke="currentColor" stroke-width="1.4" transform="rotate(-18 12 11)"/>',
  },

  /** A four-point compass rose. */
  sea: {
    radius: '0.375rem',
    border: '1px',
    crown: 'none',
    mark: '<path d="M12 2l2.2 7.8L22 12l-7.8 2.2L12 22l-2.2-7.8L2 12l7.8-2.2z" fill="currentColor"/>',
  },

  /** A cut corner and a sun that sets in lines. */
  city90: {
    radius: '0.125rem',
    border: '1px',
    crown: 'notch',
    mark: '<circle cx="12" cy="10" r="6" fill="currentColor"/><rect x="5" y="13" width="14" height="1.3" fill="var(--sys-card)"/><rect x="5" y="16" width="14" height="1.6" fill="var(--sys-card)"/>',
  },

  /** A shield, and a heavier edge. */
  epic: {
    radius: '0.25rem',
    border: '2px',
    crown: 'none',
    mark: '<path d="M12 2l8 3v6c0 5-3.4 9.2-8 11-4.6-1.8-8-6-8-11V5z" fill="none" stroke="currentColor" stroke-width="1.8"/>',
  },

  /** A cut gem, and a hairline. */
  lux: {
    radius: '0.75rem',
    border: '1px',
    crown: 'none',
    mark: '<path d="M12 3l6 5-6 13-6-13z" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M6 8h12" stroke="currentColor" stroke-width="1.2"/>',
  },
};

/** The shape of a theme, falling back to the product's own. */
export function shapeOf(key: string): Shape {
  return SHAPES[key] ?? PLAIN;
}

/**
 * A `data:` URL for the corner glyph, in the theme's own border colour.
 *
 * The colour is the BORDER token and not a semantic one, and it is laid at
 * 7% — so the mark cannot be mistaken for «needs attention» and cannot
 * move the contrast of anything drawn over it. `encodeURIComponent` and
 * not base64: an SVG this small is shorter as text, and it stays readable
 * in the markup, which matters for a thing nobody can see.
 */
function markUrl(theme: SystemTheme, body: string): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" ` +
    `color="${theme.vars['border-strong']}" opacity="0.07">${body}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

/**
 * The whole shape rule for one theme. Empty for a theme whose shape is the
 * product's own, so nothing is written that would change nothing.
 */
export function shapeCss(theme: SystemTheme): string {
  const s = shapeOf(theme.key);
  if (s === PLAIN) return '';
  const sel = `[data-sys-theme='${theme.key}'] .${CARD_CLASS}`;
  const parts: string[] = [];

  parts.push(
    `${sel}{position:relative;border-radius:${s.radius};border-width:${s.border}` +
      (s.mark
        ? `;background-image:${markUrl(theme, s.mark)};background-repeat:no-repeat;` +
          // Top-LEFT: in RTL the heading starts at the right edge, so this is
          // the corner furthest from the words and from any figure beside
          // them. 22px, inset 10px — it touches nothing.
          `background-position:left 10px top 10px;background-size:22px 22px`
        : '') +
      `}`
  );

  if (s.crown === 'arch') {
    // Drawn ON the top edge and outside the padding: a 36px arch centred
    // above the card's own line. `overflow:visible` is not needed — it sits
    // inside the border box, in the 1px the border already occupies.
    parts.push(
      `${sel}::before{content:'';position:absolute;top:-1px;inset-inline-start:50%;` +
        `transform:translateX(50%);width:36px;height:10px;` +
        `border:${s.border} solid var(--sys-border);border-bottom:0;` +
        `border-start-start-radius:18px;border-start-end-radius:18px;` +
        `background:var(--sys-card);pointer-events:none}`
    );
  }

  if (s.crown === 'notch') {
    // One corner cut away rather than rounded — the same edge the palette
    // is: hard. `clip-path` and not a pseudo-element, so nothing is drawn
    // over the content and nothing can intercept a click.
    parts.push(`${sel}{clip-path:polygon(0 0,calc(100% - 14px) 0,100% 14px,100% 100%,0 100%)}`);
  }

  return parts.join('');
}
