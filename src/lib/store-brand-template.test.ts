import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
import {
  ALWAYS,
  BRAND_SECTIONS,
  badgesFrom,
  brandContent,
  brandSections,
  latinWord,
  readProductText,
  stepsFrom,
  videoFrom,
} from './store-brand-template';
import { repoFile, stripComments } from './guard-source';
import type { StorefrontProduct } from './storefront';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * §١٠ — THE TEST THE OWNER WROTE, AND IT IS THE WHOLE ACCEPTANCE.
 *
 *   ١. منتج تجريبي سادس فيه صورة واسم بس → صفحته وكرته بيطلعوا كاملين
 *      ومقروءين: ما في كلمة ضخمة، ما في دائرة وعود، ما في فيديو، ما في
 *      لقطة — ولا فراغ ولا قسم مكسور.
 *   ٢. منتج بكلّ الحقول → بيطلع زي أرمور بالصورة.
 *   ٣. ولون النص بيعدّي AA فوق كل خلفيّة عالم محسوبة.
 *
 * The third is `store-world.test.ts`, which measures every ink of every
 * world. The first two are here, and they are asserted on the RENDERED
 * page rather than on the data: «ولا فراغ ولا قسم مكسور» is a claim about
 * markup, and a function returning a shorter list is not the same thing
 * as a page that closes up.
 *
 * ── WHY THE FORM IS A STUB AND NOTHING ELSE IS ──
 *
 * `OrderForm` is the real order path — a client component with the
 * checkout fields, the offer bridge and the endpoint. It is stubbed here
 * because rendering it would be testing the order form, which has its own
 * suite, and because this file's claim is about WHICH SECTIONS APPEAR. The
 * claim that the page uses the real one is kept honestly, by reading the
 * source: the import, the endpoint and the bridge are all pinned below.
 * ═══════════════════════════════════════════════════════════════════════
 */

vi.mock('@/components/landing/OrderForm', () => ({
  default: () => React.createElement('form', { 'data-stub-form': '1' }),
}));
vi.mock('@/components/landing/LandingFormBridge', () => ({
  LandingFormBridge: ({ children }: { children?: React.ReactNode }) => children ?? null,
}));
vi.mock('@/components/landing/blocks/OfferCards', () => ({
  OfferCards: () => React.createElement('div', { className: 'lp-offers' }),
}));
vi.mock('@/components/storefront/PreloadHero', () => ({ PreloadHero: () => null }));

const { BrandProductPage } = await import('@/components/storefront/BrandProductPage');

const SHOP = {
  slug: 'alama',
  currency: 'JOD',
  minorUnit: 3,
  dir: 'rtl' as const,
  supportPhone: '+962790000000',
};

/**
 * «منتج تجريبي سادس فيه صورة واسم بس» — §١٠.١.
 *
 * Typed as the real shelf row (`StorefrontProduct` plus its gallery) and
 * not left to inference: a literal infers `image: string` and `nameEn:
 * null`, and the «no photograph at all» case below then does not
 * type-check. The product under test has to have the product's type.
 */
const BARE: StorefrontProduct & { gallery: string[] } = {
  id: 'p6',
  sku: 'P6',
  handle: 'p6',
  name: 'كريم الليل',
  nameEn: null,
  description: null,
  image: '/api/public/media/a/b.webp',
  basePrice: 12000,
  fromPrice: 12000,
  category: null,
  attributes: {},
  gallery: ['/api/public/media/a/b.webp'],
};

/** «منتج بكلّ الحقول» — §١٠.٢, the one that should come out like ARMOR. */
const FULL = {
  ...BARE,
  id: 'p1',
  sku: 'P1',
  handle: 'armor',
  name: 'درعك ضد الحرارة',
  nameEn: 'ARMOR',
  description: 'قناع شعر بخلاصة الأرز\nتقوية الشعر\nإصلاح الشعر الجاف والمتقصّف\nتغذية ولمعان',
  gallery: ['/api/public/media/a/b.webp', '/api/public/media/a/close.webp'],
  attributes: {
    need: 'قناع شعر',
    made: 'صُنع في الأردن',
    ingredients: 'خلاصة الأرز — بروتين بيشدّ الشعرة من جوّا.',
    howTo: 'وزّعه على شعر رطب\nاتركه ١٠ دقايق\nاشطفه بمي فاترة',
    video: 'https://example.com/armor.mp4',
    world: '#c0803c',
  },
};

/**
 * THE MARKUP, WITHOUT THE STYLESHEET THE PAGE CARRIES.
 *
 * «علامة»'s product page inlines its own rules — the layer only it draws
 * — and those rules NAME every section by its class. So «the page does
 * not contain `sf-bp-ring`» was true of the markup and false of the
 * document, and the §١٠.١ assertions below were failing on a selector in
 * a stylesheet rather than on an element. Stripped here, once, because
 * what rule 0 is about is what gets DRAWN.
 */
const drawn = (html: string) => html.replace(/<style[^>]*>[\s\S]*?<\/style>/g, '');

const draw = (
  product: StorefrontProduct & { gallery: string[] },
  over: Partial<Parameters<typeof BrandProductPage>[0]> = {}
) =>
  drawn(renderToStaticMarkup(
    React.createElement(BrandProductPage, {
      shop: SHOP,
      product: product as never,
      content: brandContent({ ...product, orderedCount: null, siblings: 0 }),
      offers: [],
      compareAt: null,
      regions: ['عمّان'],
      endpoint: '/api/public/stores/alama/products/P1/orders',
      series: [],
      deliveryDays: null,
      returns: null,
      ...over,
    })
  ));

describe('§١٠.١ — a product with a name and a photograph and nothing else', () => {
  const content = brandContent({ ...BARE, orderedCount: null, siblings: 0 });
  const html = draw(BARE);

  it('draws the sections that are not a field’s to take away', () => {
    const drawn = brandSections(content);
    for (const must of ALWAYS) expect(drawn, `${must} اختفى`).toContain(must);
  });

  it('and not one of the sections whose field is empty', () => {
    const drawn = brandSections(content);
    for (const absent of ['ghost', 'badges', 'promises', 'closeup', 'video', 'howto', 'proof', 'series']) {
      expect(drawn, `«${absent}» انرسم لمنتج بلا حقله`).not.toContain(absent as never);
    }
  });

  it('no huge faint word, no ring of promises, no video, no close-up — in the markup', () => {
    // The owner's own list, checked where he would check it: on the page.
    expect(html, 'كلمة ضخمة لمنتج بلا اسم لاتيني').not.toContain('sf-bw-ghost');
    expect(html, 'دائرة وعود بلا وعود').not.toContain('sf-bp-ring');
    expect(html, 'قسم فيديو بلا فيديو').not.toContain('sf-bp-video');
    expect(html, 'قسم لقطة بلا لقطة').not.toContain('sf-bp-close');
    expect(html, 'خطوات بلا خطوات').not.toContain('sf-bp-vows');
  });

  /**
   * «ولا فراغ ولا قسم مكسور» — THE HALF A SECTION LIST CANNOT PROVE.
   *
   * A heading with nothing under it, a figure box with no figure, an
   * empty list: each of them is a section that «appeared» and broke. So
   * the markup is swept for an element whose text content is empty.
   */
  it('and no heading, list or paragraph is left standing over nothing', () => {
    const holes = [
      ...html.matchAll(/<(h1|h2|p|ol|ul|li|section)([^>]*)>\s*<\/\1>/g),
    ].map((m) => m[0]);
    expect(holes, `أقسام فاضية:\n${holes.join('\n')}`).toEqual([]);
  });

  it('and the page still sells: a price, a way to order, and the questions', () => {
    expect(html).toContain('sf-bp-price');
    expect(html).toContain('اطلب الآن — الدفع عند الاستلام');
    expect(html).toContain('كيف بدفع؟');
    expect(html).toContain('sf-bp-sticky');
    // And the photograph it does have is the one the page is measured by.
    expect(html).toContain('sf-gallery-main');
  });

  it('and a product with no photograph at all still has a designed empty state', () => {
    const noPhoto = { ...BARE, image: null, gallery: [] };
    const bare = draw(noPhoto);
    expect(bare, 'صورة مكسورة بدل الحالة البديلة').toContain('sf-card-none');
    expect(bare).toContain('sf-bp-price');
  });
});

describe('§١٠.٢ — a product with every field', () => {
  const content = brandContent({ ...FULL, orderedCount: 46, siblings: 3 });
  const html = draw(FULL, {
    content,
    series: [FULL as never],
    deliveryDays: 3,
    returns: { href: '/s/alama/pages/returns', label: 'سياسة الإرجاع' },
    compareAt: 22000,
  });

  it('draws every section the template has', () => {
    expect(brandSections(content)).toEqual([...BRAND_SECTIONS]);
  });

  it('and each one is built from its own field', () => {
    // The faint Latin word is `nameEn`, uppercased, and nothing else.
    expect(content.latin).toBe('ARMOR');
    expect(html).toContain('sf-bw-ghost');
    expect(html).toContain('ARMOR');
    // The sentence under the title is the description's first line; the
    // promises are the lines after it, three at most.
    expect(content.line).toBe('قناع شعر بخلاصة الأرز');
    expect(content.promises).toEqual(['تقوية الشعر', 'إصلاح الشعر الجاف والمتقصّف', 'تغذية ولمعان']);
    // The specification line is the category's own short answers.
    expect(content.badges).toContain('صُنع في الأردن');
    // The close-up is the second photograph; the ingredient is the answer.
    expect(content.closeup).toBe('/api/public/media/a/close.webp');
    expect(content.ingredient).toMatch(/خلاصة الأرز/);
    expect(content.steps).toHaveLength(3);
  });

  it('and the ring carries three numbers, never a fourth', () => {
    const numbers = [...html.matchAll(/class="sf-bp-num"/g)];
    expect(numbers).toHaveLength(3);
    const four = brandContent({
      ...FULL,
      description: 'سطر\nواحد\nاثنان\nثلاثة\nأربعة',
    });
    expect(four.promises, 'وعد رابع دخل الدائرة').toHaveLength(3);
  });

  it('the video waits for the scroll and shows a picture first', () => {
    // «ما بيتحمّل إلا لما يوصله السكرول، وقبله بتطلع صورة».
    const video = /<video[^>]*>/.exec(html)?.[0] ?? '';
    expect(video, 'ما في فيديو').not.toBe('');
    expect(video, 'الفيديو بيتحمّل قبل ما يوصله السكرول').toContain('preload="none"');
    expect(video, 'بلا صورة قبله').toContain('poster=');
    expect(video, 'فيديو بيشغّل نفسه').not.toContain('autoplay');
  });

  it('and the counted line says it was counted', () => {
    expect(html).toContain('انطلب 46 مرة');
    expect(html, 'رقم بلا مصدر').toContain('من طلبات وصلت فعلاً');
  });

  it('and the struck-through price is the one handed in, never one it worked out', () => {
    expect(html).toContain('وفّر');
    const src = stripComments(repoFile('src/components/storefront/BrandProductPage.tsx'));
    // Nothing here reads an offer's own price arithmetic or recomputes a
    // bundle — the figure arrives decided. See price-honesty.ts.
    expect(src, 'الصفحة صارت تحسب سعر').not.toMatch(/sellingPrice|quantity \+ freeQuantity|\/ units/);
  });
});

describe('the fields, read exactly as the owner described them', () => {
  it('the Latin word is Latin, short, and otherwise absent', () => {
    expect(latinWord('ARMOR')).toBe('ARMOR');
    expect(latinWord('gladius')).toBe('GLADIUS');
    // Arabic in the Latin field is a seller's mistake, not a huge word.
    expect(latinWord('درعك ضد الحرارة')).toBeNull();
    // A sentence does not fit across a photograph at 120px.
    expect(latinWord('Armor Hair Mask For Damaged Hair')).toBeNull();
    expect(latinWord('')).toBeNull();
    expect(latinWord(null)).toBeNull();
  });

  it('one paragraph is one sentence and no promises', () => {
    // Chopping somebody's paragraph on its full stops and arranging the
    // halves as promises reads as a machine rewriting their copy.
    const { line, promises } = readProductText('كريم مرطّب للوجه. يناسب البشرة الجافة. بلا عطر.');
    expect(promises).toEqual([]);
    expect(line).toMatch(/^كريم مرطّب/);
  });

  it('and a very long first line is cut rather than left to overflow', () => {
    const { line } = readProductText('ا'.repeat(300));
    expect(line!.length).toBeLessThanOrEqual(140);
    expect(line!.endsWith('…')).toBe(true);
  });

  it('badges are the short answers, three at most, prose left out', () => {
    expect(badgesFrom({ need: 'قناع شعر', ml: 150, ingredients: 'جملة طويلة عن المكوّنات' })).toEqual([
      'قناع شعر',
    ]);
    expect(badgesFrom({ a: 'أ', b: 'ب', c: 'ج', d: 'د' })).toHaveLength(3);
    expect(badgesFrom(null)).toEqual([]);
  });

  /**
   * A VIDEO ADDRESS WE WILL ACTUALLY LOAD, OR NONE.
   *
   * A seller's text field reaching a `src` is the one place in this
   * family where «whatever the field says» would be a security question
   * and not a layout one.
   */
  it('a video address is ours or https, and never anything else', () => {
    expect(videoFrom({ video: 'https://example.com/a.mp4' })).toBe('https://example.com/a.mp4');
    expect(videoFrom({ video: '/api/public/media/a/b.mp4' })).toBe('/api/public/media/a/b.mp4');
    for (const bad of ['javascript:alert(1)', 'data:video/mp4;base64,AAAA', 'http://example.com/a.mp4', '//evil.com/a.mp4', 'نعم']) {
      expect(videoFrom({ video: bad }), bad).toBeNull();
    }
  });

  it('the steps are the seller’s own lines, four at most', () => {
    expect(stepsFrom({ howTo: 'واحد\nاثنان' })).toEqual(['واحد', 'اثنان']);
    expect(stepsFrom({ 'طريقة الاستعمال': '١. واحد · ٢. اثنان' })).toEqual(['واحد', 'اثنان']);
    expect(stepsFrom({ howTo: 'أ\nب\nج\nد\nه' })).toHaveLength(4);
    expect(stepsFrom({})).toEqual([]);
  });
});

describe('what the page does not touch', () => {
  const src = () => stripComments(repoFile('src/components/storefront/BrandProductPage.tsx'));

  it('the order path is the one every other door uses', () => {
    const body = src();
    expect(body).toMatch(/import OrderForm from '@\/components\/landing\/OrderForm'/);
    expect(body).toMatch(/<LandingFormBridge/);
    // The endpoint is handed in by the route — the page does not build a
    // door of its own.
    expect(body).toMatch(/endpoint=\{endpoint\}/);
    expect(body, 'الصفحة بتبني مسار طلب لحالها').not.toMatch(/\/api\/public\/stores\//);
  });

  it('and the checkout fields are not among the things it decides', () => {
    const body = src();
    for (const field of ['fieldOrder', 'checkoutOrder', 'requiredCheckoutFields']) {
      expect(body, `الصفحة بتقرّر ${field}`).not.toContain(field);
    }
  });

  it('and nothing on it is a number nobody counted', () => {
    const body = src();
    // No invented proof, no fabricated stock, no countdown out of thin
    // air — the honesty rule, read off the source.
    expect(body).not.toMatch(/Math\.random|Date\.now\(\) \+|setInterval/);
    // The counted line comes from the facts engine, through the route.
    expect(body).toMatch(/content\.orderedCount/);
  });
});
