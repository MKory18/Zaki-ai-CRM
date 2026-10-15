import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
import { LAYOUT_SLOTS, RETIRED_VARIANTS, isRetired, liveVariants, effectiveVariant, retiredNoteAr, type LayoutSlot } from './layout-slots';
import { ALL_FAMILY_CSS, HERO_CSS, SHOP_SHEET } from '@/components/storefront/styles';
import { StoreHero } from '@/components/storefront/StoreHero';
import { repoFile, stripComments } from './guard-source';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * EVERY DECLARED VARIANT HAS SOMETHING BEHIND IT, OR IS RETIRED BY NAME.
 *
 * `layout-slots.ts` opens with a warning: «ADDING A VARIANT IS TWO EDITS,
 * DELIBERATELY: a name here and the CSS or markup that draws it. A name
 * with nothing behind it renders the default and tells nobody, which is
 * the failure this list exists to make impossible.»
 *
 * It happened thirteen times out of twenty-seven. A warning in a comment
 * is not a guard, and nothing was counting.
 *
 * ── WHY THIS IS GENERATIVE AND NOT A LIST ──
 *
 * A guard that enumerated the thirteen would have been complete on the
 * day it was written and wrong on the day somebody added a fourteenth
 * name. So it walks `LAYOUT_SLOTS` itself: every slot, every variant, no
 * exceptions written here. Adding a name to the catalogue and nothing
 * else fails this file, which is what the comment always meant.
 *
 * ── WHAT COUNTS AS «BEHIND IT» ──
 *
 * Different slots are drawn differently, so the proof differs:
 *
 *   `hero` — RENDERED. The component is asked for each variant and the
 *   output must be real and unlike the others. A CSS check alone would
 *   pass a component that ignored the variant and drew one thing.
 *
 *   `header` · `categoryNav` · `productCard` · `categoryPage` ·
 *   `productPage` — a rule of its own in the shipped stylesheet. These
 *   are attribute-driven, so the attribute with no rule IS the bug: it
 *   renders the base and tells nobody.
 *
 *   `cart` — a route. There is one behaviour, and it is a page.
 * ═══════════════════════════════════════════════════════════════════════
 */

/** The attribute each slot's variant is written into, for the CSS-driven ones. */
const SLOT_ATTR: Partial<Record<LayoutSlot, string>> = {
  header: 'data-header',
  categoryNav: 'data-nav',
  productCard: 'data-card',
  categoryPage: 'data-catpage',
  productPage: 'data-product',
};

/**
 * WHAT A SHOP CAN SHIP — the base sheet AND every family's own slice.
 *
 * This read `SHOP_SHEET` alone, which was the whole stylesheet until the
 * four families split it: a shop now inlines the base plus the rules of
 * the family it wears (see the note over `FAMILY_CSS` for the
 * measurement that forced it — the four together are 8.6 KB against a
 * 50 KB budget the base already spends 43.3 of).
 *
 * So the guard reads base + ALL of them. A variant whose rule lives in
 * its family's slice is still drawn; a variant with no rule in any of
 * them is still the silent-default failure this file exists to make
 * impossible. `shop-budget.test.ts` is where «and no shop ships more
 * than one of them» is held.
 */
const sheet = SHOP_SHEET + ALL_FAMILY_CSS;

describe('the parts catalogue has no empty names', () => {
  it('and the sweep is reading the real stylesheet', () => {
    // A `.includes` over an empty string passes forever.
    expect(sheet.length, 'ورقةُ المتجرِ فارغة — الحارسُ لا يقرأ شيئاً').toBeGreaterThan(10_000);
    expect(HERO_CSS.length, 'أنماطُ البطلِ فارغة').toBeGreaterThan(500);
    // And HERO_CSS really is part of what ships, not a second copy.
    expect(sheet, 'أنماطُ البطلِ ليست في ورقةِ المتجر').toContain("[data-hero-slot='editorial']");
  });

  for (const [slot, attr] of Object.entries(SLOT_ATTR) as [LayoutSlot, string][]) {
    describe(`${slot} — drawn by [${attr}='…']`, () => {
      for (const variant of LAYOUT_SLOTS[slot]) {
        it(`${variant} is either drawn or retired`, () => {
          if (isRetired(slot, variant)) {
            // Retired is a decision, and a decision names its replacement.
            const to = RETIRED_VARIANTS[slot]![variant];
            expect(LAYOUT_SLOTS[slot], `بديلُ «${variant}» ليس من القائمة`).toContain(to);
            expect(isRetired(slot, to), `بديلُ «${variant}» متقاعدٌ هو الآخر`).toBe(false);
            return;
          }
          expect(
            sheet,
            `«${slot}.${variant}» معلَنٌ ولا قاعدةَ تَرسمُه — سيَعرِضُ الافتراضيَّ ولن يُخبِرَ أحداً. ` +
              'ابنِ له قاعدةً أو ضَعه في RETIRED_VARIANTS.'
          ).toContain(`[${attr}='${variant}']`);
        });
      }
    });
  }
});

/**
 * THE FIVE FIRST SCREENS, RENDERED.
 *
 * The slot the gallery promised and the shop ignored. Proved by asking
 * the component, because that is the failure that actually happened: the
 * CSS for four of these existed all along — in the LANDING block
 * stylesheet, under the same words, reached by a different attribute —
 * and a sheet-only check would have called the slot alive.
 */
describe('every hero variant draws something, and something different', () => {
  const PRODUCTS = [
    { id: 'p1', name: 'كريم مرطّب', handle: 'cream', image: null, fromPrice: 9000 },
    { id: 'p2', name: 'سيروم فيتامين سي', handle: 'serum', image: null, fromPrice: 20000 },
    { id: 'p3', name: 'غسول للبشرة', handle: 'wash', image: null, fromPrice: 8000 },
  ];
  const CATEGORIES = [
    { id: 'c1', name: 'العناية بالبشرة' },
    { id: 'c2', name: 'العناية بالشعر' },
  ];

  const draw = (variant: string) =>
    renderToStaticMarkup(
      React.createElement(StoreHero, {
        variant: variant as never,
        tagline: 'نوصّل لكل المحافظات',
        about: 'والدفع عند الاستلام',
        slug: 'shop',
        currency: 'JOD',
        minorUnit: 3,
        products: PRODUCTS,
        categories: CATEGORIES,
      })
    );

  for (const variant of LAYOUT_SLOTS.hero) {
    it(`${variant} renders, and says which variant it is`, () => {
      const html = draw(variant);
      expect(html, `«${variant}» لا يَرسمُ شيئاً`).not.toBe('');
      // The attribute is how the stylesheet finds it. Without it the
      // markup is there and the arrangement is the base one — which is
      // the silent-default failure wearing different clothes.
      expect(html, `«${variant}» لا يَكتبُ اسمَه في data-hero-slot`).toContain(
        `data-hero-slot="${variant}"`
      );
    });
  }

  it('and no two of them are the same drawing', () => {
    /*
     * THE ASSERTION THAT WOULD HAVE CAUGHT THE ORIGINAL BUG.
     *
     * Five names all rendering the tagline in a box would satisfy every
     * test above. What makes a variant a variant is that it differs.
     * The attribute is stripped first, or they would differ by it alone.
     */
    const seen = new Map<string, string>();
    for (const variant of LAYOUT_SLOTS.hero) {
      const body = draw(variant).replace(/ data-hero-slot="[^"]*"/, '');
      const twin = seen.get(body);
      expect(twin, `«${variant}» و«${twin}» يَرسمانِ الشيءَ نفسَه`).toBeUndefined();
      seen.set(body, variant);
    }
    expect(seen.size).toBe(LAYOUT_SLOTS.hero.length);
  });

  it('and an empty shelf draws nothing rather than an empty box', () => {
    // Four of the five are made of the shelf. A shop with nothing on it
    // would otherwise open on a frame above «لا منتجات معروضة».
    for (const variant of ['productFirst', 'offerStrip', 'slider'] as const) {
      const html = renderToStaticMarkup(
        React.createElement(StoreHero, {
          variant,
          tagline: null,
          about: null,
          slug: 'shop',
          currency: 'JOD',
          minorUnit: 3,
          products: [],
          categories: [],
        })
      );
      expect(html, `«${variant}» رَسَمَ صندوقاً فارغاً`).toBe('');
    }
  });

  it('and categoryTiles falls back to goods rather than to empty tiles', () => {
    const html = renderToStaticMarkup(
      React.createElement(StoreHero, {
        variant: 'categoryTiles',
        tagline: null,
        about: null,
        slug: 'shop',
        currency: 'JOD',
        minorUnit: 3,
        products: PRODUCTS,
        categories: [],
      })
    );
    expect(html, 'شاشةٌ أولى من مربّعاتٍ فارغة').toContain('كريم مرطّب');
  });
});

describe('the cart slot', () => {
  it('is a page, and the page exists', () => {
    expect(isRetired('cart', 'drawer'), '«drawer» ما زال معروضاً').toBe(true);
    expect(liveVariants('cart')).toEqual(['page']);
    expect(() => repoFile('src/app/s/[store]/cart/page.tsx')).not.toThrow();
  });
});

describe('a retired variant is never silent', () => {
  it('the renderer resolves it, so no dead value reaches an attribute', () => {
    expect(effectiveVariant('categoryPage', 'mixed')).toBe('grid3');
    expect(effectiveVariant('cart', 'drawer')).toBe('page');
    // And a live value is returned untouched.
    expect(effectiveVariant('categoryPage', 'list')).toBe('list');
  });

  it('`layoutOf` is where that happens — once, not at seven call sites', () => {
    const src = stripComments(repoFile('src/lib/store-theme.ts'));
    expect(src).toMatch(/return effectiveVariant\(slot, stored\)/);
  });

  it('the editor offers only what is still built', () => {
    for (const slot of Object.keys(LAYOUT_SLOTS) as LayoutSlot[]) {
      for (const v of liveVariants(slot)) {
        expect(isRetired(slot, v), `«${slot}.${v}» متقاعدٌ ومعروضٌ للبائع`).toBe(false);
      }
    }
    const panel = stripComments(repoFile('src/components/store/LayoutPanel.tsx'));
    expect(panel, 'اللوحةُ ما زالت تَعرِضُ القائمةَ الكاملة').toMatch(/liveVariants\(slot\)\.map/);
  });

  it('and the seller is told, in Arabic, naming both halves', () => {
    const note = retiredNoteAr('cart', 'drawer');
    expect(note).toBeTruthy();
    expect(note).toContain('drawer');
    expect(note, 'الملاحظةُ لا تَقولُ ما الذي يُعرَضُ بدلاً منه').toContain('page');
    expect(retiredNoteAr('cart', 'page'), 'ملاحظةٌ عن خيارٍ حيّ').toBeNull();

    const panel = stripComments(repoFile('src/components/store/LayoutPanel.tsx'));
    expect(panel, 'اللوحةُ لا تَعرِضُ الملاحظة').toMatch(/retiredNoteAr\(slot, current\[slot\]\)/);
  });
});

/**
 * THE GALLERY AND THE SHOP DRAW THE SAME HERO.
 *
 * The whole finding, held down: `SkinPreview` had five inline-styled
 * approximations of its own, which is how it could promise a first
 * screen the shop did not draw. One component now, one stylesheet slice.
 */
describe('the gallery cannot promise a hero the shop does not draw', () => {
  const preview = () => stripComments(repoFile('src/components/store/SkinPreview.tsx'));

  it('the preview renders the shop’s own component', () => {
    expect(preview()).toMatch(/<StoreHero\b/);
    expect(preview()).toMatch(/from '@\/components\/storefront\/StoreHero'/);
  });

  it('and not a drawing of its own', () => {
    // The five branches that used to live here, by the words that made
    // them: a second implementation is a second thing to forget.
    expect(preview(), 'المعاينةُ ما زالت تَرسمُ بطلَها').not.toMatch(
      /layout\.hero === '(offerStrip|categoryTiles|editorial|slider)'/
    );
  });

  it('and it loads the same rules, not a copy of them', () => {
    expect(preview()).toMatch(/HERO_CSS/);
    expect(preview()).toMatch(/from '@\/components\/storefront\/styles'/);
  });

  it('and the store home asks the template which hero to draw', () => {
    const home = stripComments(repoFile('src/app/s/[store]/page.tsx'));
    expect(home, 'الواجهةُ ما زالت تَرسمُ شكلاً ثابتاً').toMatch(
      /variant=\{layoutOf\(store\.theme, 'hero'\)\}/
    );
    // The fixed tagline box it used to draw instead.
    expect(home).not.toMatch(/<section className="sf-hero">/);
  });

  it('and the category page asks it which density', () => {
    const shop = stripComments(repoFile('src/app/s/[store]/shop/page.tsx'));
    expect(shop).toMatch(/data-catpage=\{layoutOf\(store\.theme, 'categoryPage'\)\}/);
  });
});
