import { describe, expect, it } from 'vitest';
import { FAMILY_IDS, STORE_FAMILIES } from './store-families';
import {
  CHECKOUT_FIELDS,
  DEFAULT_STORE_THEME,
  checkoutOrder,
  familyOf,
  parseStoreTheme,
  requiredCheckoutFields,
} from './store-theme';
import { parseSections } from './landing-sections';
import { BRAND_PAGE_CSS, FAMILY_CSS, FAMILY_HERO_CSS } from '@/components/storefront/styles';

/**
 * EVERY LAYER OF A FAMILY, because a family is three of them now: the
 * shop-wide part the shell carries, the first screen the home carries,
 * and «علامة»'s product page, which carries its own. A sweep that read
 * one layer would pass on the two it could not see.
 */
const LAYERS = (id: 'clinic' | 'herbalist' | 'trend' | 'brand') =>
  FAMILY_CSS[id] + FAMILY_HERO_CSS[id] + (id === 'brand' ? BRAND_PAGE_CSS : '');
import { repoFile, stripComments } from './guard-source';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * THE OWNER'S TWO RULINGS OF 15/10, HELD BY A TEST EACH.
 *
 *   ① «A theme/template changes the LOOK. It never changes the
 *      ARRANGEMENT of anything a person arranged.»
 *
 *   ② «Illustrations and ambient decoration may appear at the door, on
 *      empty states, on a section header and on a welcome card — never
 *      behind a figure, a price or an amount.»
 *
 * Both are about the storefront families, and neither is the kind of
 * thing a renderer can be trusted to keep by itself: ① is one `order:` in
 * a stylesheet away from being false, and ② is one pretty gradient away.
 *
 * ── WHY THEY ARE IN ONE FILE AND NOT IN store-families.test.ts ──
 *
 * That file asks «are the four families real and does each one reach its
 * page». This one asks «and what are they forbidden to touch». They fail
 * for different reasons and they are read by different people.
 * ═══════════════════════════════════════════════════════════════════════
 */

const themeFor = (family: string) =>
  parseStoreTheme(JSON.stringify({ ...DEFAULT_STORE_THEME, family }));

describe('① a family changes the look, never the arrangement', () => {
  /**
   * THE SELLER'S OWN HOME PAGE, BLOCK BY BLOCK.
   *
   * A published home page is an ordered `LandingSection[]` the seller
   * arranged in the builder. The store home draws it with `PageBlocks` in
   * exactly that order and returns — long before any family code. So the
   * claim is checked where it could break: the order that comes out of
   * the parser is the order that went in, whatever the shop wears.
   */
  const ARRANGED = JSON.stringify([
    { id: 'a', type: 'announcement', enabled: true, text: 'عرض' },
    { id: 'b', type: 'catalog', enabled: true },
    { id: 'c', type: 'hero', enabled: true },
    { id: 'd', type: 'faq', enabled: true },
    { id: 'e', type: 'trust', enabled: true },
  ]);

  it('a published home page keeps the seller’s own order under every family', () => {
    const order = parseSections(ARRANGED).map((s) => s.type);
    expect(order, 'المحلّل نفسه رتّب').toEqual(['announcement', 'catalog', 'hero', 'faq', 'trust']);
    for (const family of FAMILY_IDS) {
      // The theme is the only thing that changes; the sections are the
      // seller's and nothing in the family can see them.
      const theme = themeFor(family);
      expect(familyOf(theme)).toBe(family);
      expect(parseSections(ARRANGED).map((s) => s.type), family).toEqual(order);
    }
  });

  it('and the home route draws the seller’s blocks before any family runs', () => {
    const home = stripComments(repoFile('src/app/s/[store]/page.tsx'));
    const published = home.indexOf('if (home.length > 0)');
    const familyLine = home.indexOf("familyOf(store.theme) === 'brand'");
    expect(published, 'فرع الصفحة المنشورة انزاح').toBeGreaterThan(0);
    expect(familyLine, 'العائلة ما بتوصل الواجهة').toBeGreaterThan(0);
    // The published branch RETURNS above it, so the family's own row
    // cannot be inserted into, pushed out of, or reordered within a page
    // somebody arranged.
    expect(familyLine, 'شي من العائلة صار قبل فرع الصفحة المنشورة').toBeGreaterThan(published);
  });

  it('and no family’s stylesheet reorders anything', () => {
    /*
     * The CSS way to break ①: `order`, a reversed flex or grid flow, or
     * a `direction` of its own. Each would move a thing a person placed
     * — and `direction` would also fight the shop's own language, which
     * is derived from what it sells in and never from a template.
     */
    const FORBIDDEN = [
      /(^|[;{\s])order\s*:/,
      /(row|column)-reverse/,
      /(^|[;{\s])direction\s*:/,
      /grid-auto-flow\s*:\s*dense/,
    ];
    for (const id of FAMILY_IDS) {
      for (const rx of FORBIDDEN) {
        expect(LAYERS(id), `عائلة «${id}» بتعيد الترتيب: ${rx}`).not.toMatch(rx);
      }
    }
  });

  it('and a family cannot touch the checkout’s fields or their order', () => {
    // «الحقول زي ما هي» — the checkout is the seller's and the engine's,
    // and the four families must be indistinguishable here.
    for (const family of FAMILY_IDS) {
      const theme = themeFor(family);
      expect(checkoutOrder(theme), family).toEqual([...CHECKOUT_FIELDS]);
      expect(requiredCheckoutFields(theme), family).toEqual(
        requiredCheckoutFields(DEFAULT_STORE_THEME)
      );
    }
  });

  it('and a seller’s own checkout order survives every family', () => {
    const mine = ['phone', 'name', 'region', 'address', 'note', 'altPhone'];
    for (const family of FAMILY_IDS) {
      const theme = parseStoreTheme(
        JSON.stringify({ ...DEFAULT_STORE_THEME, family, checkout: { fieldOrder: mine } })
      );
      expect(checkoutOrder(theme), family).toEqual(mine);
    }
  });

  it('and the family data itself holds nothing but a look', () => {
    /*
     * The strongest form: a family cannot reorder what it cannot see. Its
     * shape is typography, rhythm, imagery and one variant per slot —
     * there is no field on it for a section order, a menu or a field
     * list, so no renderer can be handed one.
     */
    for (const f of STORE_FAMILIES) {
      expect(Object.keys(f).sort()).toEqual(
        ['id', 'imagery', 'layout', 'line', 'name', 'rhythm', 'suggestedFor', 'type'].sort()
      );
    }
  });

  it('and nothing in the family library reads a menu, a section order or a field', () => {
    const src = stripComments(repoFile('src/lib/store-families.ts'));
    for (const forbidden of ['menus', 'homeLive', 'homeDraft', 'sections', 'checkout', 'fieldOrder']) {
      expect(src, `مكتبة العائلات بتقرا ${forbidden}`).not.toContain(forbidden);
    }
  });
});

describe('② decoration never stands behind a figure, a price or an amount', () => {
  /**
   * WHERE DECORATION IS ALLOWED: at the door, on an empty state, on a
   * section heading, on a welcome card. In this family there is exactly
   * one piece of it — the huge faint Latin word — and it belongs to the
   * PHOTOGRAPH's box.
   */
  it('the faint word is a child of the picture, in both places it is drawn', () => {
    /*
     * Read inside the ONE branch that draws it, in each file. Searching
     * the whole of `StoreHero` found the first `sf-hx-price` in the file
     * — another variant's, hundreds of lines above — and compared the
     * wrong two positions. A guard that reads the wrong region passes for
     * the wrong reason, which is worse than no guard.
     */
    for (const [rel, from, priceClass] of [
      ['src/components/storefront/StoreHero.tsx', "case 'worldFirst'", 'sf-hx-price'],
      ['src/components/storefront/BrandProductPage.tsx', 'sf-bp-hero', 'sf-bp-price'],
    ] as const) {
      const whole = stripComments(repoFile(rel));
      const start = whole.indexOf(from);
      expect(start, `${rel}: ما لقيت «${from}»`).toBeGreaterThan(0);
      const src = whole.slice(start);

      const ghost = src.indexOf('sf-bw-ghost');
      expect(ghost, `${rel}: ما في كلمة باهتة`).toBeGreaterThan(0);
      // The picture's box opens before it: the word is inside the art.
      const art = src.lastIndexOf('sf-bw-art', ghost);
      expect(art, `${rel}: الكلمة الباهتة مش جوّا صندوق الصورة`).toBeGreaterThanOrEqual(0);
      // And the price comes after the art closes — a sibling, never a
      // thing the faint word sits behind.
      const price = src.indexOf(priceClass);
      expect(price, `${rel}: السعر قبل الكلمة الباهتة أو مش موجود`).toBeGreaterThan(ghost);
    }
  });

  it('and no rule puts a wash, a gradient or a glyph behind a figure', () => {
    /*
     * Swept over every family's rules: a selector that names a price, a
     * number or an amount may not carry a background image, a gradient,
     * an opacity-faded layer or generated content.
     */
    const FIGURE = /(price|-num|amount|total|money)/;
    const offenders: string[] = [];
    for (const id of FAMILY_IDS) {
      for (const rule of LAYERS(id).split('}')) {
        const [selector, body = ''] = rule.split('{');
        if (!FIGURE.test(selector)) continue;
        /*
         * `.sf-bp-num` IS a filled circle, and that is not decoration
         * behind a figure — it is the figure's own badge, with its text
         * colour measured against it (`store-world.ts`). What is
         * forbidden is a layer the figure sits ON TOP of.
         */
        if (/background:\s*(linear|radial|url|var\(--store-accent\))/.test(body) && !/sf-bp-num/.test(selector)) {
          offenders.push(`${id}: ${selector.trim()}`);
        }
        if (/content\s*:/.test(body)) offenders.push(`${id}: ${selector.trim()} (content)`);
      }
    }
    expect(offenders, `زخرفة ورا رقم:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('and the price row says out loud that it has nothing behind it', () => {
    expect(BRAND_PAGE_CSS, 'صفّ السعر ما بيلغي خلفيّته').toMatch(
      /\.sf-bp-price \{[^}]*background:\s*none/
    );
  });

  /**
   * AND THE ONE WASH THAT EXISTS IS UNDER A NAME, NOT UNDER A PRICE.
   *
   * «ترند»'s tile card puts the product's name over the photograph, and
   * text on a seller's own image is the one place a palette cannot
   * promise contrast — so there is a gradient under it. The price keeps
   * its own line on the card's own surface, which is what makes that
   * gradient legal.
   */
  it('«ترند»’s only gradient is under the name', () => {
    const rules = TREND_RULES();
    const gradient = rules.filter(([, body]) => /linear-gradient/.test(body));
    expect(gradient.length, 'تدرّج زايد أو ناقص بـ«ترند»').toBe(1);
    expect(gradient[0][0], 'التدرّج مش تحت الاسم').toContain('.sf-card-name');
    // And the price is not inside that element: a separate rule, a
    // separate line.
    expect(rules.some(([sel]) => sel.includes('sf-card-price'))).toBe(true);
  });

  function TREND_RULES(): [string, string][] {
    return LAYERS('trend')
      .split('}')
      .map((r) => r.split('{'))
      .filter((p) => p.length === 2)
      .map(([s, b]) => [s.trim(), b] as [string, string]);
  }

  it('and the empty state is still allowed its letter — decoration where it belongs', () => {
    // The designed empty state («الحرف الأول») is exactly one of the four
    // places the ruling allows: an empty state. It must survive this
    // sweep rather than be tidied away by it.
    const css = repoFile('src/components/storefront/styles.ts');
    expect(css).toMatch(/\.sf-card-none[^{]*\{[^}]*content:\s*attr\(data-letter\)/);
  });
});
