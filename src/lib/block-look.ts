import type { BlockLook } from './landing-sections';

/**
 * ONE INTENTION, THREE SCREEN SIZES — without three designs.
 *
 * The seller says "wide", "roomy", "large". Not 880px, not 64px, not 34px,
 * and never once per device. A phone, a tablet and a desktop are not three
 * layouts to keep in step by hand; they are one intention drawn at three
 * widths, and a second set of numbers per breakpoint is just a second set
 * to forget to update.
 *
 * Every value below is a `clamp()`: a floor for the phone, a ceiling for
 * the desktop, and a viewport-relative middle that moves smoothly between
 * them. So a page laid out on a laptop is already right on a phone — not
 * because somebody checked, but because there was never a separate phone
 * number to get wrong.
 *
 * An empty value means "whatever the page decided". That keeps the theme
 * in charge: a page where every block was set by hand is a page where
 * changing the theme changes nothing.
 */

/** Max width of the block's content. `full` spans the page, gutters aside. */
const WIDTH: Record<BlockLook['width'], string> = {
  narrow: 'min(100%, 34rem)',
  normal: 'min(100%, 48rem)',
  wide: 'min(100%, 64rem)',
  full: '100%',
};

/** Vertical breathing room. Small on a phone, generous on a desktop. */
const SPACE: Record<BlockLook['space'], string> = {
  none: '0',
  tight: 'clamp(8px, 2vw, 16px)',
  normal: 'clamp(20px, 5vw, 48px)',
  roomy: 'clamp(36px, 9vw, 96px)',
};

/** Text size, relative to the block's own base — never absolute px. */
const SCALE: Record<NonNullable<BlockLook['text']>['scale'], string> = {
  xs: '0.8em',
  s: '0.9em',
  m: '1em',
  l: '1.18em',
  xl: '1.4em',
};

const WEIGHT: Record<string, string> = {
  normal: '400',
  medium: '600',
  bold: '700',
  black: '800',
};

const FONT_STACK: Record<string, string> = {
  cairo: "'Cairo', system-ui, sans-serif",
  tajawal: "'Tajawal', system-ui, sans-serif",
  almarai: "'Almarai', system-ui, sans-serif",
  system: 'system-ui, -apple-system, Segoe UI, sans-serif',
};

const ALIGN: Record<BlockLook['align'], string> = {
  start: 'right',
  center: 'center',
  end: 'left',
};

/** A hex colour we are willing to put in a style attribute, or ''. */
function safeColor(v: string | undefined): string {
  return v && /^#[0-9a-fA-F]{3,8}$/.test(v) ? v : '';
}

/** A same-origin image path. An absolute URL here would be a way out. */
function safeImage(v: string | undefined): string {
  return v && /^\/[A-Za-z0-9/_.\-?=&]*$/.test(v) ? v : '';
}

export interface LookStyles {
  /** Goes on the full-bleed wrapper: background, padding. */
  outer: React.CSSProperties;
  /** Goes on the content inside it: width, alignment, type. */
  inner: React.CSSProperties;
  /** True when a dark overlay must sit between the image and the text. */
  overlay: number;
}

export function lookStyles(look: BlockLook | undefined): LookStyles {
  const l = look ?? ({} as BlockLook);
  const bg = l.background ?? ({ kind: 'none' } as NonNullable<BlockLook['background']>);
  const t = l.text ?? ({} as NonNullable<BlockLook['text']>);

  const outer: React.CSSProperties = {
    paddingTop: SPACE[l.space ?? 'normal'],
    paddingBottom: SPACE[l.space ?? 'normal'],
  };

  const from = safeColor(bg.from);
  const to = safeColor(bg.to);
  const image = safeImage(bg.image);
  let overlay = 0;

  if (bg.kind === 'solid' && from) {
    outer.background = from;
  } else if (bg.kind === 'gradient' && from) {
    outer.background = `linear-gradient(${bg.angle ?? 160}deg, ${from}, ${to || from})`;
  } else if (bg.kind === 'image' && image) {
    outer.backgroundImage = `url("${image}")`;
    outer.backgroundSize = 'cover';
    outer.backgroundPosition = 'center';
    outer.position = 'relative';
    overlay = Math.min(0.8, Math.max(0, bg.overlay ?? 0.35));
  }

  const inner: React.CSSProperties = {
    maxWidth: WIDTH[l.width ?? 'normal'],
    // The gutter is the phone's, and it never goes away — text touching the
    // edge of a screen is the single most common way a page looks cheap.
    paddingInline: 'clamp(16px, 4vw, 24px)',
    marginInline: 'auto',
    textAlign: ALIGN[l.align ?? 'center'] as React.CSSProperties['textAlign'],
    position: 'relative',
  };

  if (t.scale && t.scale !== 'm') inner.fontSize = SCALE[t.scale];
  if (t.weight) inner.fontWeight = WEIGHT[t.weight];
  if (t.italic) inner.fontStyle = 'italic';
  if (t.font) inner.fontFamily = FONT_STACK[t.font];
  const color = safeColor(t.color);
  if (color) inner.color = color;
  // Text over a photograph is white unless the seller chose otherwise —
  // the overlay exists to make exactly that readable.
  else if (overlay > 0) inner.color = '#ffffff';

  return { outer, inner, overlay };
}

/** Which Google font families a page must load, given its blocks' choices. */
export function fontsUsed(looks: (BlockLook | undefined)[]): string[] {
  const set = new Set<string>();
  for (const l of looks) {
    const f = l?.text?.font;
    if (f && f !== 'system') set.add(f);
  }
  return [...set];
}
