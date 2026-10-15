import { describe, expect, it } from 'vitest';
import { LAYOUT_SLOTS } from './layout-slots';
import { landingSectionSchema } from './landing-sections';
import { repoFile, stripComments } from './guard-source';

/**
 * THE FIRST SCREEN OF A PAGE, AND THE SHAPE OF A PRODUCT'S.
 *
 * «البطل بيعرض منتجات أو عروض أو فئات — أبداً مش اسم المتجر لحاله». The
 * rule is in the VOCABULARY rather than in a check somewhere else: there
 * is no name a template can choose that means «the shop's name, alone».
 */

const blocks = () => repoFile('src/components/landing/blocks/styles.ts');
const sheet = () => repoFile('src/components/storefront/styles.ts');
const page = () => stripComments(repoFile('src/components/landing/blocks/PageBlocks.tsx'));

const hero = (over: Record<string, unknown> = {}) =>
  landingSectionSchema.safeParse({ id: 'h', type: 'hero', ...over });

describe('what the first screen leads with', () => {
  it('is named by what it shows, not by its shape', () => {
    for (const name of LAYOUT_SLOTS.hero) {
      expect(name, name).not.toMatch(/name|title|brand|logo/i);
    }
    expect(LAYOUT_SLOTS.hero).toContain('productFirst');
    expect(LAYOUT_SLOTS.hero).toContain('offerStrip');
    expect(LAYOUT_SLOTS.hero).toContain('categoryTiles');
  });

  it('the block takes one, and defaults to leading with the product', () => {
    const parsed = hero();
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.type === 'hero' && parsed.data.variant).toBe('productFirst');
  });

  it('and refuses one nobody built', () => {
    expect(hero({ variant: 'justTheName' }).success).toBe(false);
  });

  it.each(LAYOUT_SLOTS.hero)('accepts «%s»', (variant) => {
    expect(hero({ variant }).success, variant).toBe(true);
  });

  it('the renderer asks for it', () => {
    expect(page()).toMatch(/data-hero=\{s\.variant\}/);
  });

  it.each(LAYOUT_SLOTS.hero)('and «%s» is drawn', (variant) => {
    expect(blocks(), variant).toContain(`data-hero='${variant}'`);
  });

  /**
   * Every arrangement keeps the price and the button. A first screen
   * showing neither has asked a wary customer to scroll before telling
   * them anything they came for.
   */
  it('no arrangement hides the price or the button', () => {
    for (const part of ['lp-price', 'lp-cta']) {
      expect(blocks(), part).not.toMatch(new RegExp(`data-hero[^{]*\\.${part}[^}]*display:\\s*none`));
    }
  });
});

describe('the hero’s price goes through the one door', () => {
  /**
   * It wrote the price with a `toLocaleString` of its own — no minor
   * unit, so a currency that keeps three decimals was rendered with
   * none, on the first screen of the page that sells it.
   */
  it('uses the formatter, not a locale call', () => {
    const body = page().slice(page().indexOf('function Hero'), page().indexOf('function Trust'));
    expect(body).toContain('moneyText(');
    expect(body, 'منسّق مال في البطل').not.toContain('toLocaleString');
  });

  /**
   * AND THE FIGURE IT FORMATS IS THE ONE THE VISITOR IS BUYING.
   *
   * It formatted `ctx.price`, the product's BASE price, while every one of
   * the ten structures declares `firstScreen.priceWithOffer: true`. A page
   * selling «3 قطع بـ45» opened with «20» and the visitor met the real
   * number for the first time at the button. `shown` is the preselected
   * bundle's price, falling back to the base price only when the page sells
   * no bundles at all.
   */
  it('and it is the price of the bundle the form preselected', () => {
    const body = page().slice(page().indexOf('function Hero'), page().indexOf('function Trust'));
    expect(body).toContain("ctx.offers.find((o) => o.isDefault) ?? ctx.offers[0]");
    expect(body).toContain('const shown = selected ? selected.price : ctx.price');
    expect(body).toContain('moneyText(shown, ctx.currency, ctx.minorUnit ?? 2)');
  });

  it('and the block context carries the country’s decimals', () => {
    expect(page()).toMatch(/minorUnit\?: number;/);
    /*
     * AND SOMETHING ACTUALLY PUTS THEM IN IT.
     *
     * The field was declared, documented and read, and the one renderer
     * that serves a visitor never passed it — so every price on every
     * block-built page took the `?? 2` fallback, and a currency that keeps
     * three decimals was rendered with two on the page that sells it. A
     * field nobody fills is the same bug the field was added to fix.
     */
    const view = stripComments(repoFile('src/components/landing/LandingPageView.tsx'));
    expect(view, 'السياق بيعلن الفواصل وما حدا بيعطيها').toMatch(/minorUnit: lp\.store\?\.country\.minorUnit \?\? 2/);
  });
});

describe('the product page’s shape', () => {
  const product = () => stripComments(repoFile('src/app/s/[store]/p/[sku]/page.tsx'));

  it('asks which variant it wears', () => {
    expect(product()).toMatch(/data-product=\{layoutOf\(store\.theme, 'productPage'\)\}/);
  });

  it.each(LAYOUT_SLOTS.productPage)('and «%s» is drawn', (variant) => {
    expect(sheet(), variant).toContain(`data-product='${variant}'`);
  });

  /**
   * On a phone there is one answer and every variant gives it: the
   * gallery, then the locked core, then the prose. The variants are
   * about a wide screen, where there is a choice to make.
   */
  it('every arrangement is a wide-screen choice only', () => {
    const start = sheet().indexOf('@media (min-width: 900px)');
    expect(start).toBeGreaterThan(0);
    const before = sheet().slice(0, start);
    expect(before, 'ترتيب صفحة المنتج مفروض على الجوال').not.toContain("data-product='");
  });

  it('and the sticky gallery clears the header', () => {
    const rule = sheet().slice(sheet().indexOf("data-product='sticky'] .sf-gallery"));
    expect(rule.slice(0, 200)).toMatch(/var\(--store-header-h\)/);
  });
});
