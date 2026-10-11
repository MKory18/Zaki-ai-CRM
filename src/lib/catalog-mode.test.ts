import { describe, expect, it } from 'vitest';
import { catalogModeAr } from './catalog-mode';
import { repoFile, stripComments } from './guard-source';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * THE CARD SAYS WHICH CATALOGUE THE SHOP IS ON.
 *
 * Stage 1 gave the `/store` card two numbers — «منتجات معروضة» and «صفحات
 * منشورة مخفية» — and left the seller to work out the rule from them. They
 * are the rule's inputs, not its answer, and the answer is the thing that
 * decides what a shopper sees on the shelf. A shop reading «٠» and «٤» was
 * silently on its OLD catalogue with four pages ready and waiting, and
 * nothing on the screen said so or said what to press.
 * ═══════════════════════════════════════════════════════════════════════
 */

describe('a shop that has switched', () => {
  it('says so, and says how many products its shelf now holds', () => {
    const m = catalogModeAr(7, 0);
    expect(m.switched).toBe(true);
    expect(m.text).toContain('منتجات صفحات الهبوط');
    expect(m.text, 'العددُ غائب').toContain('7');
  });

  it('and offers nothing to press — it is already there', () => {
    // A button here would be a thing to undo. Hiding one page is a
    // decision on that page's own row, not on the shop's card.
    expect(catalogModeAr(7, 0).action).toBeNull();
    expect(catalogModeAr(1, 3).action).toBeNull();
  });

  it('and ONE shown product is already the switch, not a threshold', () => {
    /*
     * `storeShelf` narrows from the FIRST shown page. A card that called
     * one product «still on the old catalogue» would be telling the seller
     * the opposite of what their shoppers are seeing.
     */
    expect(catalogModeAr(1, 0).switched).toBe(true);
  });
});

describe('a shop still on the old catalogue', () => {
  it('says so, says how many pages are waiting, and names the press', () => {
    const m = catalogModeAr(0, 4);
    expect(m.switched).toBe(false);
    expect(m.text).toContain('الكتالوج القديم');
    expect(m.text).toContain('4');
    expect(m.action, 'ما في طريقٌ للضغطة').toBe('اعرضها كلها بضغطة');
  });

  it('and with nothing published it offers publishing, not a dead press', () => {
    /*
     * «اعرض كل الصفحات المنشورة» flips PUBLISHED pages. With none, that
     * button does nothing and says it did — a control that cannot do what
     * it says is worse than no control, and the seller cannot tell which
     * they got.
     */
    const m = catalogModeAr(0, 0);
    expect(m.switched).toBe(false);
    expect(m.text).toContain('ولا صفحة منشورة بعد');
    expect(m.action).toBe('انشر صفحة أول');
  });
});

describe('the card actually renders it', () => {
  const src = () => stripComments(repoFile('src/components/screens/StoresScreen.tsx'));

  it('asks this function, rather than keeping a rule of its own', () => {
    expect(src()).toMatch(/const mode = catalogModeAr\(shop\.shownProducts, shop\.hiddenPublishedPages\)/);
    expect(src()).toContain('{mode.text}');
  });

  it('and the press goes to the screen that holds it, for THIS shop', () => {
    /*
     * `onOpen` switches the editing store first and then navigates — so
     * the one-press on the pages screen acts on the shop whose card was
     * pressed, and not on whichever shop happened to be selected.
     */
    expect(src()).toMatch(/\{mode\.action && \([\s\S]{0,400}onOpen\('\/store\/landing-pages'\)/);
  });

  it('and the two raw numbers are still there, because they are the inputs', () => {
    // The sentence replaces the arithmetic, not the figures: «٤ صفحات
    // مخفية» is what the seller checks the sentence against.
    expect(src()).toContain('value={shop.shownProducts}');
    expect(src()).toContain('value={shop.hiddenPublishedPages}');
  });
});
