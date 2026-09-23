import { describe, it, expect } from 'vitest';
import { lookStyles, fontsUsed } from './block-look';
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

  it('keeps a side gutter always — text on the screen edge looks cheap', () => {
    expect(lookStyles(look({ width: 'full' })).inner.paddingInline).toMatch(/^clamp\(16px/);
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
