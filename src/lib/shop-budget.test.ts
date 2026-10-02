import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { minifyCss } from './css-minify';
import { repoFile, stripComments } from './guard-source';
import { BLOCK_CSS } from '@/components/landing/blocks/styles';
import { STOREFRONT_CSS } from '@/components/storefront/styles';

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

const kb = (s: string) => Buffer.byteLength(s, 'utf8') / 1024;

describe('what a shop weighs', () => {
  const sheet = minifyCss(BLOCK_CSS + STOREFRONT_CSS);

  it('ships its whole stylesheet under the budget', () => {
    expect(kb(sheet)).toBeLessThan(CSS_BUDGET_KB);
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
