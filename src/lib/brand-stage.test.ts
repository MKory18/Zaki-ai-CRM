import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

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
   * The photograph does not exist yet. A screen that waits for it is a
   * screen that is broken until somebody remembers a file — so it is a
   * background layer over a gradient built from the brand's own colours,
   * and a 404 simply draws nothing.
   */
  it('does not depend on a file nobody has supplied yet', () => {
    const src = read('src/components/shell/BrandStage.tsx');
    expect(src).toContain('/brand/banner.jpg');
    // Not imported, not fetched, not branched on: a missing file must not
    // be able to change what renders.
    expect(/import .*banner/i.test(src), 'البانر مستورد فيكسر البناء بغيابه').toBe(false);
    expect(/banner[\s\S]{0,80}\?/.test(src), 'شرطٌ على وجود البانر').toBe(false);
  });

  /**
   * AND THE OVERLAY IS NOT DECORATION.
   *
   * Whatever image eventually lands in that slot, nobody writing this will
   * have seen it. The scrim is what keeps the heading's contrast a property
   * of the THEME — measured, and already guarded — rather than a property
   * of a photograph nobody can test.
   */
  it('puts a scrim between an unknown photograph and the text', () => {
    const src = read('src/components/shell/BrandStage.tsx');
    const scrim = /bg-\[var\(--sys-background\)\]\/\[?0?\.(\d+)\]?/.exec(src);
    expect(scrim, 'لا حاجب بين الصورة والنصّ').toBeTruthy();
    expect(Number('0.' + scrim![1]), 'الحاجب أرقّ من أن يضمن التباين').toBeGreaterThanOrEqual(0.7);
  });

  it('and takes every colour from the theme, so it follows the three', () => {
    const src = read('src/components/shell/BrandStage.tsx');
    const hex = src.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [];
    expect(hex, `لونٌ مكتوبٌ بيده: ${hex.join('، ')}`).toEqual([]);
  });

  it('and uses the product’s own mark, not one invented here', () => {
    const src = read('src/components/shell/BrandStage.tsx');
    expect(src).toContain('/logo.svg');
  });
});
