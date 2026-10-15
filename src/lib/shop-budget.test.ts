import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { minifyCss } from './css-minify';
import { repoFile, stripComments } from './guard-source';
import { BLOCK_CSS } from '@/components/landing/blocks/styles';
import {
  BRAND_PAGE_SHEET,
  FAMILY_HERO_SHEET,
  FAMILY_MINI_CSS,
  FAMILY_SHEET,
  STOREFRONT_CSS,
} from '@/components/storefront/styles';
import { FAMILY_IDS } from './store-families';

/**
 * «القالب الي ما بيلتزم ما بينطلق — مهما كان جميل.»
 *
 * A performance budget that is measured once and written in a document is
 * a budget that is already broken; the measurement is true on the day it is
 * taken and nobody takes it again. These are the numbers from the brief,
 * held by a test, so the thing that breaks them is the thing that fails.
 *
 * What is guarded here is what can be guarded without a build: the bytes
 * this repository DECIDES. The JavaScript budget belongs to the bundler and
 * is measured against a production build — it is not pretended at here,
 * because a number this file invented would be worse than no number.
 */

/** «CSS أقل من 50 كيلوبايت». */
const CSS_BUDGET_KB = 50;

/**
 * ═══════════════════════════════════════════════════════════════════════
 * AND WHAT A WHOLE PAGE SENDS — THE SAME 50 KB, MEASURED PER PAGE.
 *
 * The constant above is the brief's and it does not move. What a shopper
 * downloads is the shared sheet PLUS the slices of the family the shop
 * wears, so that is what is measured here: the two shapes that exist, for
 * each of the four families.
 *
 * MEASURED 2026-10-16, minified, in bytes:
 *
 *     the shared sheet (BLOCK + STOREFRONT)                  48,385
 *     «علامة» · shop-wide slice (card, shared pieces)         1,755
 *     «علامة» · hero slice        (the home only)               934
 *     «علامة» · product-page slice (that page only)           2,057
 *     ───────────────────────────────────────────────────────────────
 *     its home          48,385 + 1,755 + 934 = 51,074   ✓ (cap 51,200)
 *     its product page  48,385 + 1,755 + 2,057 = 52,197  ✗ over by 997
 *
 * ⚠️ AND THE 997 BYTES ARE NOT THIS FAMILY'S TO GIVE BACK. The shared
 * sheet was 44,933 bytes when this branch started and is 48,385 now: S2
 * «أقسام بتبيع» added 2.83 KB of block rules that every shop ships
 * whether it draws those blocks or not, and «علامة»'s own look in that
 * same sheet — which S2's guard REQUIRES of any family a template can
 * reach — is 0.54 KB of it.
 *
 * What was already taken out of this family to get here, measured: the
 * world switcher's three pairs of `:has()` selectors became one sibling
 * rule (−820), the numbered lines became the block library's own list
 * (−342), the specification pills became its own pills (−220), the ring's
 * three positions became data on the elements (−250). The home came in
 * under the cap that way, with 126 bytes to spare.
 *
 * WHAT IS LEFT TO CUT IS WHAT THE OWNER NAMED IN §٤, and all three of
 * them together are just about the 997:
 *
 *     the ring of promises (the photograph in the middle, the three
 *       numbers around it)                                      ~480
 *     the dark panels the close-up and the video sit in          ~253
 *     the bar that follows the price up the page                 ~306
 *
 * So this is not a thing to fix by trimming: it is a decision, and it is
 * the owner's. Either the cap moves now that the shared sheet alone is
 * 47.25 KB, or the block library is split per block the way the families
 * are split in `styles.ts` — which is where the kilobytes actually are.
 * Until then this fails, loudly, on the one page it is true of.
 * ═══════════════════════════════════════════════════════════════════════
 */

const kb = (s: string) => Buffer.byteLength(s, 'utf8') / 1024;

describe('what a shop weighs', () => {
  const sheet = minifyCss(BLOCK_CSS + STOREFRONT_CSS);

  it('ships its whole stylesheet under the budget', () => {
    expect(kb(sheet)).toBeLessThan(CSS_BUDGET_KB);
  });

  /**
   * ═══════════════════════════════════════════════════════════════════
   * AND THE FAMILY IT WEARS IS PART OF WHAT IT SHIPS.
   *
   * The four families — «عيادة» · «عطّار» · «ترند» · «علامة» — are not in
   * the base sheet. MEASURED: together they are 8.6 KB, and appending
   * them put every shop at 51 KB — over the brief's 50, and over it for
   * rules the shop would never match. So a shop inlines the base plus the
   * ONE slice of its own family (`StorefrontShell`), and the budget is
   * measured in the only unit it was ever about: what one shop sends to
   * one phone.
   *
   * THE RISK THIS GUARD EXISTS FOR is that splitting looks like free
   * space. It is not: «علامة» is the heaviest family and it has about
   * half a kilobyte of room. The numbers are printed so whoever adds the
   * next rule learns that before the build tells them.
   * ═══════════════════════════════════════════════════════════════════
   */
  /**
   * MEASURED PER PAGE, because that is what a phone downloads.
   *
   * A shop's shell carries the family's shop-wide half; the HOME adds the
   * hero's rules (the only page that draws one); «علامة»'s product page
   * adds its own. So the two shapes that exist are measured, and no page
   * is charged for a layer it does not draw.
   */
  const SHAPES = FAMILY_IDS.flatMap((id) => [
    [`${id} · الواجهة`, FAMILY_SHEET[id] + FAMILY_HERO_SHEET[id]] as const,
    ...(id === 'brand'
      ? [[`${id} · صفحة المنتج`, FAMILY_SHEET[id] + BRAND_PAGE_SHEET] as const]
      : []),
  ]);

  it.each(SHAPES)('and «%s» is measured, layer by layer, and cannot grow', (what, slice) => {
    const whole = kb(sheet + slice);
    const over = whole - CSS_BUDGET_KB;
    console.log(
      `[shop] ${what}: الأساس ${kb(sheet).toFixed(2)} + الشرائح ${kb(slice).toFixed(2)} ` +
        `= ${whole.toFixed(2)} ك.ب — السقف ${CSS_BUDGET_KB}` +
        (over > 0 ? ` (فوقه بـ${over.toFixed(2)} ك.ب — قرار للمالك، اقرا التعليق)` : `، المتبقّي ${(-over).toFixed(2)}`)
    );
    expect(
      whole,
      `«${what}» بيحمّل ${whole.toFixed(2)} ك.ب من الأنماط — السقف ${CSS_BUDGET_KB}، ` +
        `والفرق ${(whole - CSS_BUDGET_KB).toFixed(2)} ك.ب. اقرا الملاحظة فوق: الورقة المشتركة ` +
        'لحالها 47.25، واللي ضلّ يتشال هو اللي سمّاه المالك بـ§٤ — دائرة الوعود واللوحات ' +
        'الداكنة والشريط اللاصق. يعني مش تشذيب، قرار.'
    ).toBeLessThan(CSS_BUDGET_KB);
  });

  it('and no shop ships more than one family’s worth', () => {
    const shell = stripComments(repoFile('src/components/storefront/StorefrontShell.tsx'));
    // One slice, picked by the family this shop wears.
    expect(shell).toMatch(/__html: FAMILY_SHEET\[family\]/);
    // And the two layers that belong to one page each are carried by that
    // page, not by the shell — which is what keeps the other pages light.
    expect(stripComments(repoFile('src/app/s/[store]/page.tsx')), 'الواجهة ما بتحمل أنماط بطلها')
      .toMatch(/FAMILY_HERO_SHEET\[familyOf\(store\.theme\)\]/);
    expect(
      stripComments(repoFile('src/components/storefront/BrandProductPage.tsx')),
      'صفحة «علامة» ما بتحمل أنماطها'
    ).toMatch(/__html: BRAND_PAGE_SHEET/);
    expect(shell, 'القشرة بتشحن أنماط البطل لكل الصفحات').not.toContain('FAMILY_HERO_SHEET');
    expect(shell, 'القشرة بتشحن أنماط صفحة المنتج').not.toContain('BRAND_PAGE_SHEET');
    // Not all four, and not the gallery's miniature rules either.
    expect(shell, 'القشرة بتشحن كل العائلات').not.toContain('ALL_FAMILY_CSS');
    expect(shell, 'القشرة بتشحن أنماط المعاينة').not.toContain('FAMILY_MINI_CSS');
  });

  it('and the miniature’s rules go out with the gallery, not with a shop', () => {
    // 0.7 KB of a shopper's render-blocking stylesheet for type sizes on
    // a screen only a seller opens.
    const preview = stripComments(repoFile('src/components/store/SkinPreview.tsx'));
    expect(preview).toContain('FAMILY_MINI_CSS');
    expect(minifyCss(FAMILY_MINI_CSS).length, 'أنماط المعاينة فرغت').toBeGreaterThan(200);
    expect(sheet, 'أنماط المعاينة رجعت لورقة المتجر').not.toContain('data-mini] .sf-bw');
  });

  it('and the budget is not met by having nothing in it', () => {
    // A rule removed by accident would pass a budget test. These are the
    // things a shop cannot be drawn without.
    const flat = sheet.replace(/\s+/g, '');
    for (const must of ['.sf-header', '.sf-card', '.lp-root', '.lp-footer', '@font-face']) {
      expect(flat.includes(must.replace(/\s/g, '')), must).toBe(true);
    }
    expect(sheet.length).toBeGreaterThan(20_000);
  });

  /**
   * The saving is real only if the thing that is shipped is the minified
   * one. A `minifyCss` that exists and is not called saves nothing.
   */
  it('is the sheet the shop actually inlines, and it has one owner', () => {
    // Built once, when the module loads — not per render, and not in two
    // places: the skeleton needs the same sheet the shell inlines, and two
    // copies of that expression is how they come to differ.
    const owner = stripComments(repoFile('src/components/storefront/styles.ts'));
    expect(owner).toMatch(/export const SHOP_SHEET = minifyCss\(BLOCK_CSS \+ STOREFRONT_CSS\)/);

    for (const rel of [
      'src/components/storefront/StorefrontShell.tsx',
      'src/components/storefront/ShopSkeleton.tsx',
    ]) {
      const src = stripComments(repoFile(rel));
      expect(src.includes('__html: SHOP_SHEET'), rel).toBe(true);
      expect(src.includes('minifyCss('), `${rel} builds its own copy`).toBe(false);
    }
  });

  /**
   * The home page inlined the block stylesheet a second time, inside a
   * shell that already carries it.
   */
  it('and no page inlines a stylesheet the shell already carries', () => {
    for (const rel of [
      'src/app/s/[store]/page.tsx',
      'src/app/s/[store]/shop/page.tsx',
      'src/app/s/[store]/p/[sku]/page.tsx',
      'src/app/s/[store]/cart/page.tsx',
      'src/app/s/[store]/checkout/page.tsx',
      'src/app/s/[store]/thanks/page.tsx',
      'src/app/s/[store]/track/page.tsx',
    ]) {
      const src = stripComments(repoFile(rel));
      expect(src.includes('BLOCK_CSS'), `${rel} inlines BLOCK_CSS`).toBe(false);
      expect(src.includes('STOREFRONT_CSS'), `${rel} inlines STOREFRONT_CSS`).toBe(false);
    }
  });
});

/**
 * A SKELETON MUST BE DRAWN IN CLASSES THE SHEET ACTUALLY DEFINES.
 *
 * The first version of `ShopSkeleton` laid itself out in `.sf-wrap`, a
 * class this stylesheet has never had. It rendered: a column of unstyled
 * boxes at full width, which is exactly the thing a skeleton exists to
 * prevent, and nothing would have failed. A skeleton is the one screen
 * nobody opens on purpose, so it is the one that has to be checked by a
 * machine.
 */
describe('the shape shown before the page arrives', () => {
  const sheet = minifyCss(BLOCK_CSS + STOREFRONT_CSS);
  const skeleton = repoFile('src/components/storefront/ShopSkeleton.tsx');

  /** Every class the skeleton puts on an element. */
  const used = [...stripComments(skeleton).matchAll(/className="([^"]+)"/g)]
    .flatMap((m) => m[1].split(/\s+/))
    .filter(Boolean);

  it('uses classes, and enough of them to be a layout', () => {
    expect(new Set(used).size).toBeGreaterThan(6);
  });

  it('and every one of them is defined in the sheet it ships', () => {
    const missing = [...new Set(used)].filter((c) => !sheet.includes(`.${c}`));
    expect(missing).toEqual([]);
  });

  it('lays out in the containers the real pages lay out in', () => {
    // `.sf-page` is the shelf's container and `.sf-product` the product's;
    // a skeleton with a container of its own is a layout shift written on
    // purpose.
    expect(used).toContain('sf-page');
    expect(used).toContain('sf-product');
    expect(used).toContain('sf-grid');
  });

  it('says what it is to a screen reader, and does not loop', () => {
    // EVERY skeleton, not "a skeleton somewhere in the file". The file
    // holds two, and a check for one string is satisfied by either — so
    // dropping it from one of them passed.
    const roots = skeleton.match(/<div className="lp-root sf-root sf-skel"[^>]*>/g) ?? [];
    expect(roots.length).toBe(2);
    for (const root of roots) expect(root).toContain('aria-busy="true"');
    // One entrance. The brief's motion rule is `repeat: false`, and it
    // applies here too.
    expect(sheet).not.toMatch(/sf-skel[^}]*animation[^}]*infinite/);
    expect(sheet).toContain('prefers-reduced-motion');
  });

  it('is reached by the shelf, which is slow enough to need it', () => {
    // RENDERED, not merely imported. `return null` leaves the import in
    // place, so a check for the name passes on a route that draws nothing.
    expect(stripComments(repoFile('src/app/s/[store]/shop/loading.tsx')))
      .toContain('<ShopSkeleton');
  });

  /**
   * AND IT IS KEPT OFF THE PAGE A SHOP IS FOUND BY.
   *
   * A `loading.tsx` opens a Suspense boundary, and a streamed response has
   * sent its status line before the page inside resolves — so `notFound()`
   * under one cannot set the status. Measured on this route: with the file,
   * `/s/main/p/NOPE` answered **200** with the not-found page in the body;
   * without it, 404. A soft 404 tells a search engine that every mistyped
   * product URL is a live page.
   *
   * The shelf keeps its skeleton because the only `notFound()` reachable
   * under it — «no such shop» — was moved up into the layout, which runs
   * before the boundary. A `sku` is not a segment a layout can read.
   */
  it('and off the product page, where it would make every 404 a 200', () => {
    expect(existsSync(join(process.cwd(), 'src/app/s/[store]/p/[sku]/loading.tsx'))).toBe(false);
    // The reason is written next to the absence, or the next person adds
    // the file back and nothing tells them why it was not there.
    expect(repoFile('src/app/s/[store]/p/[sku]/NO-LOADING.md')).toContain('404');
  });

  it('because the shop’s existence is settled in the layout, not in the page', () => {
    const layout = stripComments(repoFile('src/app/s/[store]/layout.tsx'));
    expect(layout).toContain('if (!store) notFound()');
    expect(layout).toContain("from 'next/navigation'");
  });
});

/**
 * THE TWO REQUESTS THAT DECIDE HOW FAST A SHOP FEELS.
 *
 * On a slow connection the cost is not bytes, it is round trips — and both
 * of these are a round trip the browser would otherwise not start until it
 * had finished something else first.
 */
describe('what the browser is told to fetch early', () => {
  const shell = stripComments(repoFile('src/components/storefront/StorefrontShell.tsx'));
  const product = stripComments(repoFile('src/app/s/[store]/p/[sku]/page.tsx'));

  it('opens the font connections before it asks for the font', () => {
    expect(shell).toContain('rel="preconnect" href="https://fonts.googleapis.com"');
    expect(shell).toContain('rel="preconnect" href="https://fonts.gstatic.com"');
  });

  it('and gives the gstatic one a crossOrigin, or it buys nothing', () => {
    // A font is fetched in CORS mode. A preconnect without crossOrigin
    // opens a connection the font request cannot reuse: the handshake is
    // paid for and then thrown away.
    expect(shell).toMatch(/fonts\.gstatic\.com"\s+crossOrigin=""/);
  });

  it('asks for the product photograph as early as it can', () => {
    // The preload is declared through `ReactDOM.preload`, not written as a
    // tag: React hoists a hand-written one and the hoisted copy loses its
    // `href`, leaving two preload elements and two requests for one
    // picture. See PreloadHero.
    expect(product).toContain('<PreloadHero');
    const preloader = stripComments(repoFile('src/components/storefront/PreloadHero.tsx'));
    expect(preloader).toContain('ReactDOM.preload(');
    expect(preloader).toContain("as: 'image'");
  });

  it('and the element agrees with the preload about the priority', () => {
    // Two requests for one picture at two priorities is worse than one
    // request at the wrong one.
    const preloader = stripComments(repoFile('src/components/storefront/PreloadHero.tsx'));
    const img = product.match(/className="sf-gallery-main"[\s\S]{0,200}?\/>/)?.[0] ?? '';
    expect(preloader).toContain("fetchPriority: 'high'");
    expect(img).toContain('fetchPriority="high"');
  });

  it('never makes the largest image a lazy one', () => {
    // `loading="lazy"` on the LCP image is the most common way to make a
    // page slower while believing it was made faster.
    const img = product.match(/className="sf-gallery-main"[\s\S]{0,200}?\/>/)?.[0] ?? '';
    expect(img).not.toContain('loading="lazy"');
    expect(img.length).toBeGreaterThan(40);
  });

  it('while the ones below the fold stay lazy', () => {
    for (const rel of [
      'src/components/storefront/ProductCard.tsx',
      'src/components/storefront/CategoryNav.tsx',
    ]) {
      const src = stripComments(repoFile(rel));
      const imgs = src.match(/<img[\s\S]{0,300}?\/>/g) ?? [];
      expect(imgs.length).toBeGreaterThan(0);
      for (const img of imgs) expect(img, rel).toContain('loading="lazy"');
    }
  });
});

/**
 * «صفحة المنتج بتتحمّل مسبقاً لما بطاقتها تقرب من الشاشة».
 *
 * This one was already true, and the useful thing a test can do is stop it
 * from quietly becoming false. Next's `<Link>` prefetches a route when the
 * link enters the viewport; measured on a production build at 360px, the
 * shelf fired 22 RSC prefetches as the cards scrolled past — every product
 * route by its readable address — for 13.6 KB in total.
 *
 * `prefetch={false}` is one word, it looks like a saving, and on this shelf
 * it would cost a full round trip on every tap for the 13.6 KB it saved.
 */
describe('what is fetched before it is tapped', () => {
  it('no storefront link opts out of prefetching', () => {
    for (const rel of [
      'src/components/storefront/ProductCard.tsx',
      'src/components/storefront/CategoryNav.tsx',
      'src/components/storefront/CartLink.tsx',
      'src/components/storefront/StorefrontShell.tsx',
    ]) {
      const src = stripComments(repoFile(rel));
      expect(src.includes('prefetch={false}'), rel).toBe(false);
      expect(src.includes('prefetch="false"'), rel).toBe(false);
    }
  });

  it('and the card is a real Link, which is what does the prefetching', () => {
    // An `<a>` would render the same and prefetch nothing.
    const card = stripComments(repoFile('src/components/storefront/ProductCard.tsx'));
    expect(card).toContain("import Link from 'next/link'");
    expect(card).toMatch(/<Link href=\{`\/s\/\$\{slug\}\/p\//);
  });
});
