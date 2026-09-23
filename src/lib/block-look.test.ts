import { describe, it, expect } from 'vitest';
import { lookStyles, fontsUsed } from './block-look';
import { GOOGLE_FAMILY, isPlainLook } from './block-look';
import { FONTS, landingThemeSchema, DEFAULT_THEME } from './landing-theme';
import type { BlockLook } from './landing-sections';

const look = (over: Partial<BlockLook> = {}): BlockLook =>
  ({
    width: 'normal',
    align: 'center',
    space: 'normal',
    background: { kind: 'none', from: '', to: '', angle: 160, image: '', overlay: 0.35 },
    text: { font: '', scale: 'm', weight: '', italic: false, color: '' },
    ...over,
  }) as BlockLook;

/**
 * The whole point: one intention, three screen sizes, no breakpoints for
 * the seller to keep in step. Every size is a clamp — a floor for the
 * phone, a ceiling for the desktop, and a smooth middle.
 */
describe('sizes are fluid, never fixed', () => {
  it('pads with a clamp, so a phone is not given a desktop gap', () => {
    expect(lookStyles(look({ space: 'roomy' })).outer.paddingTop).toMatch(/^clamp\(/);
    expect(lookStyles(look({ space: 'tight' })).outer.paddingTop).toMatch(/^clamp\(/);
  });

  it('never lets content exceed the screen, at any width setting', () => {
    for (const width of ['narrow', 'normal', 'wide', 'full'] as const) {
      const max = String(lookStyles(look({ width })).inner.maxWidth);
      expect(max === '100%' || max.startsWith('min(100%')).toBe(true);
    }
  });

  it('adds no gutter of its own — every block already brings one', () => {
    // Three stacked gutters put the order form at 271px inside a 375px
    // phone. The block stylesheet already pads .lp-section, .lp-hero and
    // .lp-announce; a wrapper gutter on top is the same space charged twice.
    expect(lookStyles(look({ width: 'full' })).inner.paddingInline).toBeUndefined();
  });

  it('sizes text relatively, so it still fits when the screen shrinks', () => {
    expect(String(lookStyles(look({ text: { scale: 'xl' } as never })).inner.fontSize)).toMatch(/em$/);
  });
});

describe('what an empty value means', () => {
  it('leaves the page in charge when nothing was chosen', () => {
    const s = lookStyles(look());
    expect(s.inner.fontFamily).toBeUndefined();
    expect(s.inner.color).toBeUndefined();
    expect(s.inner.fontWeight).toBeUndefined();
    expect(s.outer.background).toBeUndefined();
  });

  it('survives a block saved before any of this existed', () => {
    const s = lookStyles(undefined);
    expect(s.inner.maxWidth).toBeTruthy();
    expect(s.overlay).toBe(0);
  });
});

describe('backgrounds', () => {
  it('fills with a colour', () => {
    expect(lookStyles(look({ background: { kind: 'solid', from: '#16a34a' } as never })).outer.background)
      .toBe('#16a34a');
  });

  it('runs a gradient between two stops', () => {
    const s = lookStyles(look({ background: { kind: 'gradient', from: '#000', to: '#fff', angle: 90 } as never }));
    expect(s.outer.background).toBe('linear-gradient(90deg, #000, #fff)');
  });

  it('falls back to one stop rather than drawing a gradient into nothing', () => {
    const s = lookStyles(look({ background: { kind: 'gradient', from: '#123456', to: '' } as never }));
    expect(s.outer.background).toBe('linear-gradient(160deg, #123456, #123456)');
  });

  // White text on somebody's bright photo is unreadable exactly as often as
  // the photo is bright, and the customer finds out, not the seller.
  it('darkens a photo and turns the text white', () => {
    const s = lookStyles(look({ background: { kind: 'image', image: '/api/media/x.webp', overlay: 0.5 } as never }));
    expect(s.overlay).toBe(0.5);
    expect(s.inner.color).toBe('#ffffff');
  });

  it("does not override a colour the seller picked", () => {
    const s = lookStyles(look({
      background: { kind: 'image', image: '/api/media/x.webp', overlay: 0.5 } as never,
      text: { color: '#ffee00' } as never,
    }));
    expect(s.inner.color).toBe('#ffee00');
  });
});

describe('what is refused', () => {
  it('ignores a colour that is not a colour', () => {
    const s = lookStyles(look({ background: { kind: 'solid', from: 'red; background:url(x)' } as never }));
    expect(s.outer.background).toBeUndefined();
  });

  it('ignores an off-site background image', () => {
    for (const bad of ['https://evil.example/x.png', 'javascript:alert(1)', 'data:image/png;base64,AAA']) {
      const s = lookStyles(look({ background: { kind: 'image', image: bad } as never }));
      expect(s.outer.backgroundImage).toBeUndefined();
      expect(s.overlay).toBe(0);
    }
  });

  it('clamps an overlay someone pushed past the limit', () => {
    const s = lookStyles(look({ background: { kind: 'image', image: '/a.webp', overlay: 5 } as never }));
    expect(s.overlay).toBe(0.8);
  });
});

describe('fonts a page must load', () => {
  it('lists each chosen family once, and never the system stack', () => {
    expect(
      fontsUsed([
        look({ text: { font: 'cairo' } as never }),
        look({ text: { font: 'cairo' } as never }),
        look({ text: { font: 'system' } as never }),
        look(),
        undefined,
      ]).sort()
    ).toEqual(['cairo']);
  });
});

/**
 * ONE LIBRARY, NOT THREE.
 *
 * There were three lists of the same Arabic faces — the theme picker's four,
 * the block picker's twelve, and a fourth hidden inside the stylesheet URL
 * builder — and they had already drifted: two faces the picker offered had
 * no entry in the URL builder, so choosing either loaded no stylesheet and
 * drew the fallback. The picker looked broken because of a list, not a bug.
 *
 * These guard the rule rather than the symptom: every offered face must be
 * loadable, and every loadable face must be offered.
 */
describe('the font library is a single registry', () => {
  it('gives every offered face a stack, a name and a hint', () => {
    for (const f of FONTS) {
      expect(f.stack, f.key).toBeTruthy();
      expect(f.label, f.key).toBeTruthy();
      expect(f.note, f.key).toBeTruthy();
    }
  });

  it('can load every offered face from exactly one place', () => {
    for (const f of FONTS) {
      if (f.key === 'system') continue; // already on the device
      const fromGoogle = Boolean(GOOGLE_FAMILY[f.key]);
      // A face we serve ourselves must NOT also be requested from Google:
      // two sources for one family is two chances to disagree about which
      // outlines the page draws.
      expect(fromGoogle !== Boolean(f.local), `${f.key} must come from exactly one source`).toBe(true);
    }
  });

  it('serves a local face only when its licence was checked', () => {
    // Every family here has its notice in public/fonts. Adding a row with
    // `local: true` means committing a font file, and a font file that may
    // not be served is a legal problem, not a rendering one — so the list
    // is written down rather than inferred.
    expect(FONTS.filter((f) => f.local).map((f) => f.key)).toEqual(['kawkab']);
  });

  it('offers every face it knows how to load', () => {
    const offered = new Set(FONTS.map((f) => f.key));
    for (const key of Object.keys(GOOGLE_FAMILY)) {
      expect(offered.has(key as never), `${key} is loadable but never offered`).toBe(true);
    }
  });

  it('turns a block choice into a real CSS stack', () => {
    for (const f of FONTS) {
      expect(lookStyles(look({ text: { font: f.key } as never })).inner.fontFamily, f.key).toBe(f.stack);
    }
  });

  it('accepts every face as a stored page theme', () => {
    for (const f of FONTS) {
      expect(
        landingThemeSchema.safeParse({ ...DEFAULT_THEME, font: f.key }).success,
        `${f.key} is offered but a page cannot store it`
      ).toBe(true);
    }
  });
});


/**
 * THE WRAPPER ONLY EXISTS FOR A CHOICE.
 *
 * `look` used to be absent until somebody styled a block, so "is it there?"
 * meant "did the seller choose?". Then the schema began filling a default
 * look into every block and the question stopped meaning anything: every
 * block on every page got a wrapper, a max-width and a second gutter that
 * nobody had asked for.
 */
describe('a block nobody styled stays untouched', () => {
  it('treats the schema default as no choice at all', () => {
    expect(isPlainLook(look())).toBe(true);
    expect(isPlainLook(undefined)).toBe(true);
  });

  it('notices each kind of choice on its own', () => {
    expect(isPlainLook(look({ width: 'wide' }))).toBe(false);
    expect(isPlainLook(look({ align: 'start' }))).toBe(false);
    expect(isPlainLook(look({ space: 'roomy' }))).toBe(false);
    expect(isPlainLook(look({ background: { kind: 'solid', from: '#fff' } as never }))).toBe(false);
    expect(isPlainLook(look({ text: { color: '#111' } as never }))).toBe(false);
    expect(isPlainLook(look({ text: { headingColor: '#111' } as never }))).toBe(false);
    expect(isPlainLook(look({ text: { font: 'cairo' } as never }))).toBe(false);
    expect(isPlainLook(look({ text: { scale: 'l' } as never }))).toBe(false);
    expect(isPlainLook(look({ text: { italic: true } as never }))).toBe(false);
    expect(isPlainLook(look({ button: { fill: '#111' } as never }))).toBe(false);
    expect(isPlainLook(look({ button: { size: 'l' } as never }))).toBe(false);
    expect(isPlainLook(look({ button: { wide: true } as never }))).toBe(false);
  });
});
