import { describe, expect, it } from 'vitest';
import {
  IMAGE_WIDTHS,
  SIZES_CARD,
  SIZES_HERO,
  heroPreload,
  isOurMedia,
  srcSetFor,
} from './responsive-image';
import { repoFile, stripComments } from './guard-source';

/**
 * A 1200px PHOTOGRAPH ON A 360px PHONE.
 *
 * The upload pipeline already caps every stored picture at 1200px and
 * converts it to WebP, so the brief's «AVIF أو WebP» has been met since the
 * day uploads were written. «متجاوبة» had not: the shelf draws twelve cards
 * at about 165px each on a phone and asked for the full 1200px file every
 * time.
 */

const OURS = '/api/public/media/11111111-2222-3333-4444-555555555555/66666666-7777-8888-9999-aaaaaaaaaaaa.webp';
const VIA = '/api/public/media/00000000-0000-0000-0000-000000000000/11111111-2222-3333-4444-555555555555/66666666-7777-8888-9999-aaaaaaaaaaaa.webp';

describe('which addresses this system may resize', () => {
  it('recognises a storefront image', () => {
    expect(isOurMedia(OURS)).toBe(true);
  });

  it('and one shown through a landing page', () => {
    expect(isOurMedia(VIA)).toBe(true);
  });

  it('refuses an address that is not ours', () => {
    // A `srcset` of addresses that ignore `?w=` is the same bytes fetched
    // three times under three names — slower than no srcset at all.
    for (const other of [
      'https://cdn.example.com/a.jpg',
      '/api/media/companies/x/products/y/z.webp',
      '/uploads/a.webp',
      '',
      null,
      undefined,
    ]) {
      expect(isOurMedia(other), String(other)).toBe(false);
      expect(srcSetFor(other), String(other)).toBeNull();
    }
  });

  it('and leaves an address that already carries a query alone', () => {
    // A preview token, or anything else; the address is already doing
    // something and a width appended to it is a guess.
    expect(isOurMedia(`${OURS}?p=token`)).toBe(false);
  });
});

describe('the set of renders offered', () => {
  it('offers every width on the list, and only those', () => {
    const set = srcSetFor(OURS)!;
    expect(set).not.toBeNull();
    const widths = [...set.matchAll(/ (\d+)w/g)].map((m) => Number(m[1]));
    expect(widths).toEqual([...IMAGE_WIDTHS]);
  });

  it('asks for each one by the width the route understands', () => {
    for (const w of IMAGE_WIDTHS) expect(srcSetFor(OURS)).toContain(`${OURS}?w=${w} ${w}w`);
  });

  it('stays under the stored cap — a render wider than the original is bytes for nothing', () => {
    // storage.ts caps every upload at 1200px.
    for (const w of IMAGE_WIDTHS) expect(w).toBeLessThan(1200);
  });
});

describe('what the browser is told the picture will occupy', () => {
  /**
   * `sizes` is not a hint. It is the only thing the browser has before
   * layout, so a wrong one is worse than none — it is believed.
   */
  it('describes the shelf’s real columns', () => {
    // styles.ts: two columns, three at 720px, four at 1000px.
    expect(SIZES_CARD).toContain('max-width: 720px');
    expect(SIZES_CARD).toContain('max-width: 1000px');
  });

  it('and the breakpoints it names are the ones the stylesheet uses', () => {
    const css = repoFile('src/components/storefront/styles.ts');
    for (const bp of ['720px', '1000px']) {
      expect(css, bp).toContain(`@media (min-width: ${bp})`);
    }
  });

  it('gives the product photograph the whole phone and half the page above it', () => {
    expect(SIZES_HERO).toContain('100vw');
    expect(SIZES_HERO).toContain('max-width: 720px');
  });
});

describe('the one picture that is asked for before it is seen', () => {
  it('preloads a width the element can also choose', () => {
    // A preload with no width fetches the 1200px original while the `img`
    // beside it, obeying `sizes`, asks for a 640 — two requests for one
    // picture, which is the thing a preload exists to prevent.
    const p = heroPreload(OURS)!;
    expect(p.imageSrcSet).toBe(srcSetFor(OURS));
    const asked = Number(/\?w=(\d+)/.exec(p.href)![1]);
    expect((IMAGE_WIDTHS as readonly number[])).toContain(asked);
  });

  it('and falls back to the plain address for an image that is not ours', () => {
    const p = heroPreload('https://cdn.example.com/a.jpg')!;
    expect(p.href).toBe('https://cdn.example.com/a.jpg');
    expect(p.imageSrcSet).toBeNull();
  });

  it('says nothing at all when there is no picture', () => {
    expect(heroPreload(null)).toBeNull();
    expect(heroPreload(undefined)).toBeNull();
  });
});

describe('the route and the markup agree', () => {
  const route = stripComments(repoFile('src/app/api/public/media/[...parts]/route.ts'));

  it('the route accepts a width, from the same list', () => {
    expect(route).toContain("searchParams.get('w')");
    expect(route).toContain('IMAGE_WIDTHS');
  });

  it('and resizes rather than trusting the number it was given', () => {
    expect(route).toContain('withoutEnlargement: true');
    expect(route).toMatch(/includes\(asked\)\s*\?\s*asked\s*:\s*null/);
  });

  it('serves the original when the resizer cannot run, never nothing', () => {
    // sharp is an optional native dependency. A shop with heavier images
    // is a working shop; a shop with no images is not.
    expect(route).toContain('serving the original');
  });

  it('the card asks for the width it draws, and says how wide that is', () => {
    const card = stripComments(repoFile('src/components/storefront/ProductCard.tsx'));
    expect(card).toContain('srcSet={srcSetFor(product.image)');
    // The ATTRIBUTE, not the name: the import line carries the name, so a
    // check for it passed on a card whose `sizes` had been deleted. A
    // `srcset` without `sizes` makes the browser assume 100vw and fetch
    // the widest render on the list for a card an eighth of that.
    expect(card).toMatch(/sizes=\{srcSetFor\(product\.image\) \? SIZES_CARD/);
  });

  it('and so does the product page', () => {
    const page = stripComments(repoFile('src/app/s/[store]/p/[sku]/page.tsx'));
    expect(page).toContain('srcSet={srcSetFor(product.image)');
    expect(page).toContain('SIZES_HERO');
  });

  /**
   * A PRELOAD THAT CAUSES A SECOND FETCH IS WORSE THAN NONE.
   *
   * The preload was a `<link rel="preload">` written in the page. React
   * hoists one of those into the head, the hoisted copy loses its `href`,
   * and the copy in the page stays — measured: two preload elements for
   * one photograph and two requests for it. `ReactDOM.preload` is the
   * supported way to say the same thing and emits exactly one.
   */
  it('declares the preload through React rather than drawing the tag', () => {
    const page = stripComments(repoFile('src/app/s/[store]/p/[sku]/page.tsx'));
    expect(page).toContain('<PreloadHero');
    expect(page).not.toMatch(/rel="preload"/);

    const comp = stripComments(repoFile('src/components/storefront/PreloadHero.tsx'));
    expect(comp).toContain('ReactDOM.preload(');
    expect(comp).toContain("fetchPriority: 'high'");
    // The preload and the element must agree, or the browser fetches one
    // render and paints another.
    expect(comp).toContain('imageSizes: SIZES_HERO');
    expect(comp).toContain('imageSrcSet: p.imageSrcSet');
  });
});
