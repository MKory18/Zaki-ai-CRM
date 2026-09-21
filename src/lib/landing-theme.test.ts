import { describe, expect, it } from 'vitest';
import {
  paletteFor, readableOn, lightnessOf, isValidHex, DEFAULT_THEME, type LandingTheme,
} from './landing-theme';

/**
 * One colour in, a harmonious page out.
 *
 * The seller picks an accent and never sees the other nine shades. So the
 * derivation has to be right without anyone checking it, and the ways it can
 * be wrong are the ways a page becomes unusable rather than merely ugly:
 * a button whose text cannot be read on it, a "tint" that is not pale, and
 * a hover state that is not actually a different colour.
 */

const theme = (over: Partial<LandingTheme> = {}): LandingTheme => ({ ...DEFAULT_THEME, ...over });

/** WCAG contrast ratio, computed here independently of the module under test. */
function wcag(a: string, b: string): number {
  const lum = (hex: string) => {
    const n = parseInt(hex.slice(1), 16);
    const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
      .map((v) => v / 255)
      .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
  };
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

describe('the derived palette', () => {
  it('puts dark text on a light button and white text on a dark one', () => {
    // A yellow button with white text is a button nobody reads.
    expect(readableOn('#fbbf24')).toBe('#121926');
    expect(readableOn('#0f172a')).toBe('#ffffff');
  });

  it('reaches AA on the button label for every swatch we offer', () => {
    // The button is the page. A label that fails contrast on it is a sale
    // the visitor squints at instead of clicking.
    const swatches = ['#b8256e', '#e11d48', '#ea580c', '#f59e0b', '#16a34a', '#0d9488',
      '#2563eb', '#4f46e5', '#7c3aed', '#0f172a', '#8b5a2b', '#be123c'];
    for (const accent of swatches) {
      const p = paletteFor(theme({ accent }));
      expect(wcag(accent, p.accentText), accent).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('keeps the tint pale enough to carry dark text, whatever the accent', () => {
    // Pale for a navy AND pale for a yellow is exactly what plain HSL misses.
    for (const accent of ['#0f172a', '#fbbf24', '#16a34a', '#b8256e', '#2563eb']) {
      const tint = paletteFor(theme({ accent })).accentTint;
      expect(lightnessOf(tint)).toBeGreaterThan(0.9);
    }
  });

  it('makes the pressed state genuinely darker than the accent', () => {
    for (const accent of ['#fbbf24', '#16a34a', '#2563eb']) {
      const p = paletteFor(theme({ accent }));
      expect(lightnessOf(p.accentDark)).toBeLessThan(lightnessOf(p.accent) - 0.05);
    }
  });

  it('never returns a dark accentDark that has collapsed to black', () => {
    // A very dark accent still needs a hover state that is a colour.
    const p = paletteFor(theme({ accent: '#0b0f19' }));
    expect(p.accentDark).not.toBe('#000000');
  });

  it('falls back to the house colour when the accent is not a colour', () => {
    expect(paletteFor(theme({ accent: 'red' })).accent).toBe(DEFAULT_THEME.accent);
    expect(paletteFor(theme({ accent: '#xyz' })).accent).toBe(DEFAULT_THEME.accent);
    expect(paletteFor(null).accent).toBe(DEFAULT_THEME.accent);
  });

  it('accepts a hex with or without its hash', () => {
    expect(isValidHex('#16a34a')).toBe(true);
    expect(isValidHex('16a34a')).toBe(true);
    expect(isValidHex('#16a34')).toBe(false);
  });

  it('changes the page surface with the mood, not with the accent', () => {
    const clean = paletteFor(theme({ mood: 'clean' }));
    const warm = paletteFor(theme({ mood: 'warm' }));
    expect(clean.pageBg).not.toBe(warm.pageBg);
    // The same mood with a different accent keeps the same surface.
    expect(paletteFor(theme({ accent: '#2563eb' })).pageBg).toBe(clean.pageBg);
  });

  it('squares the corners when asked, everywhere at once', () => {
    expect(paletteFor(theme({ corners: 'sharp' })).radius).toBe('4px');
    expect(paletteFor(theme({ corners: 'soft' })).radius).toBe('14px');
  });

  it('survives a corrupt mood or font rather than rendering nothing', () => {
    const p = paletteFor({ accent: '#16a34a', mood: 'neon' as never, font: 'comic' as never, corners: 'soft' });
    expect(p.pageBg).toBeTruthy();
    expect(p.fontStack).toBeTruthy();
  });

  it('emits every variable the stylesheet reads', () => {
    const p = paletteFor(theme());
    for (const key of ['accent', 'accentText', 'accentDark', 'accentTint', 'accentBorder',
      'pageBg', 'cardBg', 'text', 'muted', 'border', 'radius', 'fontStack'] as const) {
      expect(p[key], key).toBeTruthy();
    }
  });
});
