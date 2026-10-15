import { contrastRatio, lightnessOf, nearestPassing, readableOn } from './landing-theme';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * THE WORLD'S COLOURS — DERIVED FROM THE PHOTOGRAPH, IN CODE.
 * ═══════════════════════════════════════════════════════════════════════
 *
 * `S1-FAMILY-4-ALAMA.md` §٢, and S3's third rule repeats it word for word:
 *
 *   ١. الخلفيّة من أطراف الصورة الرئيسيّة.
 *   ٢. اللون البارز منها (accent).
 *   ٣. لون النص بيتختار لحاله عشان يضلّ مقروء — AA على الأقلّ.
 *   ٤. والمالك بيقدر يغيّرهم بكبسة.
 *
 * ⚠️ «الموديل ما بيختار لوناً ولا مرّة.» That is why this is a function and
 * not a prompt. A model asked for «a palette for this product» answers with
 * a palette for a product LIKE this one — plausible, confident, and not the
 * colours of the photograph the page is actually built around. And it would
 * answer differently next Tuesday.
 *
 * ── WHERE THE PIXELS COME FROM ──
 *
 * The caller samples; this derives. The browser hands it the product's own
 * photograph through a canvas (same-origin, no upload, no new dependency),
 * and this file never touches the network, the filesystem or an image
 * decoder. Which is also what makes the rule testable: the three claims
 * above are claims about ARITHMETIC, and arithmetic can be fed a picture
 * that is dark green at the edges and orange in the middle.
 *
 * ── AND THE TEXT COLOUR IS NOT A PREFERENCE ──
 *
 * `readableOn` already picks ink or paper for a background, and
 * `nearestPassing` already walks a colour until it clears a ratio. Both are
 * in `landing-theme.ts`, both are tested, and both are reused rather than
 * reimplemented: a second contrast routine in this repository would be a
 * second answer to «is this readable», and the wrong one would be the one
 * on the shop.
 */

/** Raw RGBA, the shape `CanvasRenderingContext2D.getImageData` returns. */
export interface SampledImage {
  width: number;
  height: number;
  /** Length must be width × height × 4. */
  data: Uint8ClampedArray | number[];
}

export interface WorldColors {
  /** From the edges of the photograph — the page's own paper. */
  background: string;
  /** The loudest colour in the picture, lifted off that background. */
  accent: string;
  /** Ink that clears AA on `background`. Chosen, never picked. */
  text: string;
  /** Ink that clears AA on `accent` — for the filled button's own label. */
  accentText: string;
  /** How the three were reached, for the line beside the swatches. */
  how: string;
}

const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
const hex = (r: number, g: number, b: number) =>
  `#${[r, g, b].map((v) => clamp(v).toString(16).padStart(2, '0')).join('')}`;

/** Saturation as the eye reads it: how far from grey, 0…1. */
function chroma(r: number, g: number, b: number): number {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max === 0 ? 0 : (max - min) / max;
}

interface Bucket {
  r: number;
  g: number;
  b: number;
  n: number;
}

/**
 * COLOURS, BUCKETED — because a photograph has no repeated pixel.
 *
 * Quantising to a 32-step cube is what turns «48,000 slightly different
 * browns» into «brown, 41% of the picture». A finer grid makes every bucket
 * a single pixel and the «dominant colour» becomes noise; a coarser one
 * merges a product's red with the shadow behind it.
 */
function bucketsOf(
  image: SampledImage,
  keep: (x: number, y: number) => boolean
): Map<string, Bucket> {
  const out = new Map<string, Bucket>();
  const { width, height, data } = image;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!keep(x, y)) continue;
      const i = (y * width + x) * 4;
      const a = data[i + 3];
      // A transparent pixel is not a colour — a PNG cut-out is mostly them.
      if (a !== undefined && a < 200) continue;
      const r = data[i] ?? 0;
      const g = data[i + 1] ?? 0;
      const b = data[i + 2] ?? 0;
      const key = `${r >> 3}|${g >> 3}|${b >> 3}`;
      const found = out.get(key);
      if (found) {
        found.r += r;
        found.g += g;
        found.b += b;
        found.n += 1;
      } else {
        out.set(key, { r, g, b, n: 1 });
      }
    }
  }
  return out;
}

const average = (b: Bucket) => hex(b.r / b.n, b.g / b.n, b.b / b.n);

/**
 * THE THREE COLOURS, IN THE ORDER THE RULE LISTS THEM.
 *
 * ① THE BACKGROUND IS THE EDGES. The outer eighth of the frame on all four
 *    sides — a product photograph is the product in the middle and its
 *    world around it, so the edges are the world. The most common bucket
 *    there, not the average of the ring: averaging a dark backdrop with a
 *    bright corner highlight produces a grey that is in the picture
 *    nowhere.
 *
 * ② THE ACCENT IS THE LOUDEST THING INSIDE. Weighted by chroma and by how
 *    much of the picture it is — the loudest colour that is only four
 *    pixels is a highlight, and the biggest colour that is grey is the
 *    backdrop again. A candidate too close to the background is skipped:
 *    an accent that cannot be seen against the page is not an accent.
 *
 * ③ THE TEXT IS CORRECTED, NOT CHOSEN. `readableOn` for the side, then
 *    `nearestPassing` to guarantee 4.5:1 — AA on real body text, which is
 *    what the rule says and what a photograph's mid-tone background will
 *    otherwise quietly fail.
 */
export function worldColorsFrom(image: SampledImage): WorldColors | null {
  if (!image || image.width < 4 || image.height < 4) return null;
  const expected = image.width * image.height * 4;
  if (image.data.length < expected) return null;

  const bandX = Math.max(1, Math.floor(image.width / 8));
  const bandY = Math.max(1, Math.floor(image.height / 8));
  const onEdge = (x: number, y: number) =>
    x < bandX || y < bandY || x >= image.width - bandX || y >= image.height - bandY;

  const edge = [...bucketsOf(image, onEdge).values()].sort((a, b) => b.n - a.n);
  if (edge.length === 0) return null;
  const background = average(edge[0]);

  const inside = [...bucketsOf(image, (x, y) => !onEdge(x, y)).values()];
  const total = inside.reduce((sum, b) => sum + b.n, 0) || 1;
  const scored = inside
    .map((b) => {
      const colour = average(b);
      const r = b.r / b.n;
      const g = b.g / b.n;
      const bl = b.b / b.n;
      return { colour, score: chroma(r, g, bl) * Math.sqrt(b.n / total) };
    })
    .sort((a, b) => b.score - a.score);

  /*
   * THE FALLBACK IS THE BACKGROUND'S OWN OPPOSITE, NOT A BRAND COLOUR.
   *
   * A photograph of a white jar on a white sheet has no loud colour in it,
   * and inventing one would be this code choosing a palette — the thing the
   * rule forbids the model from doing. So the accent becomes the readable
   * ink of that background: a page in the product's own two tones.
   */
  const candidate =
    scored.find((s) => s.score > 0.08 && contrastRatio(s.colour, background) >= 1.6)?.colour ??
    readableOn(background);

  const accent = contrastRatio(candidate, background) >= 3 ? candidate : nearestPassing(candidate, background, 3) ?? readableOn(background);

  const ink = readableOn(background);
  const text = contrastRatio(ink, background) >= 4.5 ? ink : nearestPassing(ink, background, 4.5) ?? ink;

  const accentInk = readableOn(accent);
  const accentText =
    contrastRatio(accentInk, accent) >= 4.5 ? accentInk : nearestPassing(accentInk, accent, 4.5) ?? accentInk;

  return {
    background,
    accent,
    text,
    accentText,
    how: `الخلفيّة من أطراف الصورة · اللون البارز منها · لون النصّ مصحّح لـAA (${
      Math.round(contrastRatio(text, background) * 10) / 10
    }:1)`,
  };
}

/**
 * IS THIS PHOTOGRAPH DARK? — one line the screen shows beside the swatches.
 *
 * Not a colour decision: the families treat a dark world and a light one
 * differently (a dark hero wants the faded Latin word behind the image),
 * and the owner should be told which one his photograph produced before he
 * presses.
 */
export const worldIsDark = (colors: WorldColors) => lightnessOf(colors.background) < 0.5;
