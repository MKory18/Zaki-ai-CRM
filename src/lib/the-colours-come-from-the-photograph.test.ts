import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { stripComments } from './guard-source';
import { worldColorsFrom, worldIsDark, type SampledImage } from './landing-world-colors';
import { contrastRatio, isValidHex } from './landing-theme';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * «الألوان بالكود، مش بالموديل.»
 *
 * `S1-FAMILY-4-ALAMA.md` §٢, repeated word for word as S3's third rule:
 * the background comes from the EDGES of the product's photograph, the
 * accent comes from the photograph, and the text colour is CORRECTED to AA
 * rather than chosen. «الموديل ما بيختار لوناً ولا مرّة.»
 *
 * Which makes the rule testable, and that is the whole reason it is a
 * function: a palette a model proposes cannot be checked — it is plausible
 * by construction and different next Tuesday. A palette derived from pixels
 * can be fed a picture that is dark green at the edges and orange in the
 * middle, and asked what it produced.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * A PICTURE, PAINTED BY HAND: a ring of one colour around a middle of
 * another — which is what a product photograph is.
 */
function picture(edge: [number, number, number], middle: [number, number, number], size = 40): SampledImage {
  const data = new Uint8ClampedArray(size * size * 4);
  const band = Math.max(1, Math.floor(size / 8));
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const onEdge = x < band || y < band || x >= size - band || y >= size - band;
      const [r, g, b] = onEdge ? edge : middle;
      const i = (y * size + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }
  return { width: size, height: size, data };
}

const DARK_GREEN: [number, number, number] = [18, 42, 32];
const ORANGE: [number, number, number] = [235, 120, 20];

describe('Ⅰ · the three colours, in the order the rule lists them', () => {
  const colors = worldColorsFrom(picture(DARK_GREEN, ORANGE))!;

  it('① the background is the colour of the EDGES, not of the product', () => {
    expect(colors, 'ما رجّع ألواناً أصلاً').toBeTruthy();
    expect(isValidHex(colors.background)).toBe(true);
    // The ring is #122a20; the derivation averages its bucket, so it is
    // compared by closeness rather than by string equality.
    expect(contrastRatio(colors.background, '#122a20')).toBeLessThan(1.2);
    expect(worldIsDark(colors), 'خلفيّةٌ داكنةٌ قُرئت فاتحة').toBe(true);
  });

  it('② the accent is the loud colour INSIDE the frame', () => {
    expect(contrastRatio(colors.accent, '#eb7814')).toBeLessThan(1.3);
  });

  it('② and it is never a colour that disappears into the background', () => {
    const quiet = worldColorsFrom(picture(DARK_GREEN, [20, 44, 34]))!;
    expect(contrastRatio(quiet.accent, quiet.background), 'لونٌ بارزٌ لا يُرى').toBeGreaterThanOrEqual(3);
  });

  it('③ the text colour clears AA on the background it was derived against', () => {
    expect(contrastRatio(colors.text, colors.background)).toBeGreaterThanOrEqual(4.5);
  });

  it('③ and the button’s own label clears AA on the accent', () => {
    expect(contrastRatio(colors.accentText, colors.accent)).toBeGreaterThanOrEqual(4.5);
  });

  it('③ and it clears AA over EVERY world a photograph can produce, not just this one', () => {
    /*
     * WALKED, NOT SAMPLED — §١٠ of the same document asks for exactly this:
     * «ولون النص بيعدّي AA فوق كلّ خلفيّة عالم محسوبة». The mid-tone
     * backgrounds are the ones that fail a lightness threshold, and they
     * are the ones most product photographs have.
     */
    const failures: string[] = [];
    for (let r = 0; r <= 255; r += 51) {
      for (let g = 0; g <= 255; g += 51) {
        for (let b = 0; b <= 255; b += 51) {
          const world = worldColorsFrom(picture([r, g, b], ORANGE, 16));
          if (!world) {
            failures.push(`#${r}-${g}-${b}: لا ألوان`);
            continue;
          }
          const ratio = contrastRatio(world.text, world.background);
          if (ratio < 4.5) failures.push(`rgb(${r},${g},${b}) → ${ratio.toFixed(2)}:1`);
          const onAccent = contrastRatio(world.accentText, world.accent);
          if (onAccent < 4.5) failures.push(`accent rgb(${r},${g},${b}) → ${onAccent.toFixed(2)}:1`);
        }
      }
    }
    expect(failures, `خلفيّاتٌ نصُّها غيرُ مقروء:\n${failures.slice(0, 12).join('\n')}`).toEqual([]);
  });

  it('and it says how it got there, so the owner can disagree with a reason', () => {
    expect(colors.how).toContain('أطراف الصورة');
    expect(colors.how).toContain('AA');
  });
});

describe('Ⅱ · the pictures that have no loud colour in them, and the ones that are not pictures', () => {
  it('a white jar on a white sheet gets the page’s own ink, not an invented brand colour', () => {
    const white = worldColorsFrom(picture([255, 255, 255], [250, 250, 250]))!;
    expect(white.background.toLowerCase()).toMatch(/^#f[a-f0-9]{5}|#ffffff$/);
    expect(contrastRatio(white.accent, white.background)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(white.text, white.background)).toBeGreaterThanOrEqual(4.5);
    expect(worldIsDark(white)).toBe(false);
  });

  it('and a transparent cut-out is not read as black', () => {
    const size = 24;
    const data = new Uint8ClampedArray(size * size * 4);
    // Everything transparent except a red middle — a PNG with no backdrop.
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;
        const inside = x > 8 && x < 16 && y > 8 && y < 16;
        data[i] = inside ? 200 : 0;
        data[i + 3] = inside ? 255 : 0;
      }
    }
    // No opaque pixel on the edges at all: there is no background to read,
    // and saying so beats returning black.
    expect(worldColorsFrom({ width: size, height: size, data })).toBeNull();
  });

  it('and nonsense is null rather than a throw or a colour', () => {
    expect(worldColorsFrom({ width: 0, height: 0, data: [] })).toBeNull();
    expect(worldColorsFrom({ width: 10, height: 10, data: [1, 2, 3] })).toBeNull();
    expect(worldColorsFrom(null as unknown as SampledImage)).toBeNull();
  });
});

describe('Ⅲ · and nothing in the derivation asks a model anything', () => {
  it('the module talks to no model, no network and no filesystem', () => {
    const src = stripComments(readFileSync('src/lib/landing-world-colors.ts', 'utf8'));
    for (const forbidden of ['aiChat', 'fetch(', 'openrouter', 'readFile', 'sharp']) {
      expect(src, `مشتقُّ الألوان صار يَستعملُ «${forbidden}»`).not.toContain(forbidden);
    }
  });

  it('and it reuses the contrast maths that is already in the theme, rather than a second copy', () => {
    const src = readFileSync('src/lib/landing-world-colors.ts', 'utf8');
    expect(src).toContain("from './landing-theme'");
    const body = stripComments(src);
    expect(body, 'نسخةٌ ثانيةٌ من حساب التباين — والخطأُ منها هو الذي يصل المتجر').not.toMatch(
      /0\.2126|luminance\s*\(/
    );
  });
});
