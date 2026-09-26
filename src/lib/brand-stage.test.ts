import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SYSTEM_THEMES } from './system-themes';

/**
 * THE THREE SCREENS BEFORE THE WORK.
 *
 * Sign in, pick a country, pick a store. Three full screens a person sees
 * every morning, all three a grey page with a box in the middle — and the
 * only moments in the product where nothing is being measured or decided.
 *
 * Two things must stay true about the brand moment that now fills them,
 * and neither is about taste.
 */

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8');

describe('the brand moment', () => {
  it('is on all three, and is one component rather than three copies', () => {
    for (const rel of [
      'src/app/(system)/login/page.tsx',
      'src/components/shell/EntryPicker.tsx',
    ]) {
      // The TAG, not the import: a screen that imports it and renders a
      // plain div still imports it.
      expect(read(rel), `${rel}: بلا لحظة علامة`).toMatch(/<BrandStage[\s>]/);
      expect(read(rel), `${rel}: الإطار مفتوحٌ بلا إغلاق`).toContain('</BrandStage>');
    }
    // The country step and the store step share EntryPicker's one frame, so
    // both are covered by the line above — and cannot drift apart.
    const entry = read('src/components/shell/EntryPicker.tsx');
    expect((entry.match(/<BrandStage/g) ?? []).length, 'نسختان من الإطار في شاشة واحدة').toBe(1);
  });

  /**
   * THE BANNER IS A SLOT, NOT A DEPENDENCY.
   *
   * The banner is supplied now, and the screen still must not DEPEND on
   * it: a background layer over a gradient built from the brand's own
   * colours, where a 404 simply draws nothing. Swapping the file is a
   * file operation, not a code change.
   */
  it('does not depend on the file being there', () => {
    const src = read('src/components/shell/BrandStage.tsx');
    expect(src).toContain('/brand/banner.jpg');
    // Not imported, not fetched, not branched on: a missing file must not
    // be able to change what renders.
    expect(/import .*banner/i.test(src), 'البانر مستورد فيكسر البناء بغيابه').toBe(false);
    expect(/banner[\s\S]{0,80}\?/.test(src), 'شرطٌ على وجود البانر').toBe(false);
  });

  /**
   * AND THE OVERLAY IS MEASURED AGAINST THE REAL FILE.
   *
   * This used to demand a scrim of at least 0.78 — blind insurance against
   * a photograph nobody had seen. That was right while the slot was empty
   * and wrong the moment it was filled: at 0.78 over an image at 0.25, the
   * banner that actually arrived was a faint smudge.
   *
   * So the number is no longer a guess. This decodes the file, takes its
   * BRIGHTEST pixel — the worst case for white text — composites it the way
   * the browser will, and asks whether the heading still clears 4.5:1.
   * Replace the banner with something pale and this fails here, which is
   * the only place it can be caught before somebody sees it.
   */
  it('keeps the heading readable over the banner’s brightest point', async () => {
    const src = read('src/components/shell/BrandStage.tsx');
    const scrim = /bg-\[var\(--sys-background\)\]\/\[?0?\.(\d+)\]?/.exec(src);
    const image = /opacity-\[?0?\.(\d+)\]?/.exec(src);
    expect(scrim, 'لا حاجب بين الصورة والنصّ').toBeTruthy();
    expect(image, 'لا شفافيّة معلنة للبانر').toBeTruthy();
    const scrimA = Number('0.' + scrim![1]);
    const imageA = Number('0.' + image![1]);

    const sharp = (await import('sharp')).default;
    const { data, info } = await sharp(join(process.cwd(), 'public/brand/banner.jpg'))
      .resize(240, 80, { fit: 'fill' })
      .raw()
      .toBuffer({ resolveWithObject: true });

    const lum = (r: number, g: number, b: number) => {
      const f = (c: number) => {
        const v = c / 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
      };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };

    let brightest = { r: 0, g: 0, b: 0 };
    let best = -1;
    for (let i = 0; i < data.length; i += info.channels) {
      const L = lum(data[i], data[i + 1], data[i + 2]);
      if (L > best) {
        best = L;
        brightest = { r: data[i], g: data[i + 1], b: data[i + 2] };
      }
    }

    // The page colour under it, from the theme this screen renders in.
    const dark = SYSTEM_THEMES.find((t) => t.key === 'ops')!;
    const hex = (h: string) => ({
      r: parseInt(h.slice(1, 3), 16),
      g: parseInt(h.slice(3, 5), 16),
      b: parseInt(h.slice(5, 7), 16),
    });
    const page = hex(dark.vars.background);
    const head = hex(dark.vars.heading);

    const over = (fg: typeof page, bg: typeof page, a: number) => ({
      r: fg.r * a + bg.r * (1 - a),
      g: fg.g * a + bg.g * (1 - a),
      b: fg.b * a + bg.b * (1 - a),
    });
    const backdrop = over(page, over(brightest, page, imageA), scrimA);
    const L1 = lum(head.r, head.g, head.b);
    const L2 = lum(backdrop.r, backdrop.g, backdrop.b);
    const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);

    expect(
      ratio,
      `العنوان فوق أسطع نقطة في البانر: ${ratio.toFixed(2)} إلى ١`
    ).toBeGreaterThan(4.5);

    /**
     * AND THE CASE THAT CAN ACTUALLY FAIL.
     *
     * Measuring the real file passes even when the file is replaced with a
     * white one — I checked, by replacing it: at these two opacities the
     * scrim keeps the backdrop dark whatever the image is. So the check
     * above documents the banner; it cannot catch a bad one.
     *
     * What CAN go wrong is the pair of numbers. Raise the image to 0.85 or
     * thin the scrim to 0.15 and the screen depends on the picture again.
     * So the worst possible image — pure white — is composited through the
     * SAME two numbers, and that is the assertion with teeth.
     */
    const worst = over(page, over({ r: 255, g: 255, b: 255 }, page, imageA), scrimA);
    const Lw = lum(worst.r, worst.g, worst.b);
    const whiteRatio = (Math.max(L1, Lw) + 0.05) / (Math.min(L1, Lw) + 0.05);
    expect(
      whiteRatio,
      `لو كان البانر أبيضَ بالكامل لصار العنوان ${whiteRatio.toFixed(2)} إلى ١ — ` +
        `الشفافيّة ${imageA} والحاجب ${scrimA}`
    ).toBeGreaterThan(4.5);
  });

  it('and takes every colour from the theme, so it follows the three', () => {
    const src = read('src/components/shell/BrandStage.tsx');
    const hex = src.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [];
    expect(hex, `لونٌ مكتوبٌ بيده: ${hex.join('، ')}`).toEqual([]);
  });

  it('and uses the product’s own mark, not one invented here', () => {
    const src = read('src/components/shell/BrandStage.tsx');
    expect(src).toContain('/brand/mark.png');
  });
});
