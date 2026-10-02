import { describe, expect, it } from 'vitest';
import { contrastRatio, lightnessOf, nearestPassing } from './landing-theme';
import { CONTRAST_PAIRS, resolveSkinPalette } from './store-skin';
import { STORE_TEMPLATES } from './store-templates';

/**
 * «اللون الساقط بالتباين بينرفض مع أقرب لون ناجح».
 *
 * The refusal already existed: `storeSkinSchema` checks seven pairs at
 * 4.5:1 and fails a palette that breaks one. What a refusal alone does to
 * a seller is leave them guessing — they try a slightly different colour,
 * are refused again, and stop believing the picker works. The half that
 * was missing is the key that comes with the locked door.
 */

const BLACK = '#000000';
const WHITE = '#ffffff';

describe('a colour that already works', () => {
  it('is handed straight back', () => {
    expect(nearestPassing(BLACK, WHITE)).toBe(BLACK);
    expect(nearestPassing('#1f2937', '#ffffff')).toBe('#1f2937');
  });
});

describe('a colour that does not', () => {
  it('comes back passing', () => {
    // Pale grey text on white: the classic failure.
    const fixed = nearestPassing('#cccccc', WHITE)!;
    expect(fixed).not.toBeNull();
    expect(contrastRatio('#cccccc', WHITE)).toBeLessThan(4.5);
    expect(contrastRatio(fixed, WHITE)).toBeGreaterThanOrEqual(4.5);
  });

  it('and only just — it does not jump to black', () => {
    const fixed = nearestPassing('#cccccc', WHITE)!;
    // The nearest passing colour, not the safest one. A suggestion that
    // always answered «أسود» would be a suggestion nobody takes.
    expect(contrastRatio(fixed, WHITE)).toBeLessThan(6);
    expect(fixed).not.toBe(BLACK);
  });

  it('keeps the hue the seller chose', () => {
    // A suggestion that changed the hue would be this system picking the
    // brand's colour.
    const brand = '#e879a6';
    const fixed = nearestPassing(brand, WHITE)!;
    const hue = (hex: string) => {
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      // Which channel leads, and by how much relative to the others — a
      // coarse hue check that does not need a colour library.
      return [r > g, r > b, g > b].join(',');
    };
    expect(hue(fixed)).toBe(hue(brand));
  });

  it('goes LIGHTER when the background is dark', () => {
    const dark = '#111827';
    const tooClose = '#2b3545';
    const fixed = nearestPassing(tooClose, dark)!;
    expect(lightnessOf(fixed)).toBeGreaterThan(lightnessOf(tooClose));
    expect(contrastRatio(fixed, dark)).toBeGreaterThanOrEqual(4.5);
  });

  it('and DARKER when the background is light', () => {
    const fixed = nearestPassing('#9ca3af', '#f8fafc')!;
    expect(lightnessOf(fixed)).toBeLessThan(lightnessOf('#9ca3af'));
  });

  it('obeys a ratio other than the default', () => {
    // 3:1 is the large-text threshold; the function must not have 4.5
    // welded into it.
    const at3 = nearestPassing('#cccccc', WHITE, 3)!;
    const at7 = nearestPassing('#cccccc', WHITE, 7)!;
    expect(contrastRatio(at3, WHITE)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(at7, WHITE)).toBeGreaterThanOrEqual(7);
    expect(contrastRatio(at7, WHITE)).toBeGreaterThan(contrastRatio(at3, WHITE));
  });
});

describe('what it refuses to answer', () => {
  it('says nothing for a value that is not a colour', () => {
    expect(nearestPassing('not a colour', WHITE)).toBeNull();
    expect(nearestPassing(WHITE, 'rgb(1,2,3)')).toBeNull();
    expect(nearestPassing('', '')).toBeNull();
  });

  it('and nothing rather than a colour that still fails', () => {
    // An impossible ratio: no colour reaches 21:1 against mid-grey.
    expect(nearestPassing('#808080', '#808080', 21)).toBeNull();
  });
});

describe('it can fix the thing it exists for', () => {
  /**
   * Every pair the skin schema checks, broken on purpose and then mended.
   * A suggestion engine that cannot repair the very failures this system
   * refuses would be decoration.
   */
  it('mends a failure on each of the seven pairs the schema checks', () => {
    const palette = resolveSkinPalette(STORE_TEMPLATES[0]);
    for (const pair of CONTRAST_PAIRS) {
      const bg = palette[pair.bg];
      // A foreground deliberately set to the background: contrast 1:1.
      const fixed = nearestPassing(bg, bg, pair.min);
      expect(fixed, pair.what).not.toBeNull();
      expect(contrastRatio(fixed!, bg), pair.what).toBeGreaterThanOrEqual(pair.min);
    }
  });

  it('and leaves every shipped template alone — none of them needs it', () => {
    // If a shipped template had a failing pair, `shipped()` would have
    // thrown at module load. This is the same fact from the other side.
    for (const skin of STORE_TEMPLATES) {
      const palette = resolveSkinPalette(skin);
      for (const pair of CONTRAST_PAIRS) {
        const fg = palette[pair.fg];
        expect(nearestPassing(fg, palette[pair.bg], pair.min), `${skin.id} / ${pair.what}`).toBe(fg);
      }
    }
  });
});
