import { describe, expect, it } from 'vitest';
import {
  MAX_HISTORY,
  MAX_SLUG,
  isSlug,
  parseHistory,
  rememberSlug,
  slugify,
  uniqueSlug,
} from './slug';
import { REDIRECT_FROM } from './store-redirects';
import { repoFile, stripComments } from './guard-source';

/**
 * A READABLE ADDRESS, IN THE LANGUAGE THE SHOP IS WRITTEN IN.
 *
 * `/p/EAR-01` tells a shopper nothing and a search engine less.
 * `/p/كريم-الاذن` is the product's own name — and a link is read before
 * it is tapped, especially the ones that go round a family group.
 */

describe('the address a name gives', () => {
  it('keeps the Arabic, and does not transliterate it', () => {
    expect(slugify('كريم الأذن')).toBe('كريم-الاذن');
    // A transliteration would be a third spelling nobody chose: the
    // seller did not write it and the shopper will not type it.
    expect(slugify('كريم الأذن')).not.toMatch(/[a-z]/);
  });

  /**
   * THE SPELLING RULE IS THE ONE THAT ALREADY EXISTS. Without it «الأذن»
   * and «الاذن» are two addresses for one product — duplicate content in
   * its most literal form.
   */
  it('gives one address to one product, however the name was spelled', () => {
    expect(slugify('الأذن')).toBe(slugify('الاذن'));
    expect(slugify('كريمة')).toBe(slugify('كريمه'));
  });

  it('turns everything else into the separator, once', () => {
    expect(slugify('كريم  —  مرطّب / لليدين')).toBe('كريم-مرطب-لليدين');
    expect(slugify('  جلّ  ')).toBe('جل');
  });

  /** An underscore is invisible under a link's underline. */
  it('does not use an underscore', () => {
    expect(slugify('a_b')).toBe('a-b');
  });

  it('keeps Latin and digits for the shops that use them', () => {
    expect(slugify('Vitamin C 1000')).toBe('vitamin-c-1000');
  });

  /**
   * An empty answer is a real one: a product named «١٢٣» or «...» has no
   * readable address, and the caller falls back to the SKU rather than
   * inventing one.
   */
  it.each([['...', ''], ['---', ''], ['', ''], ['   ', '']])('gives «%s» nothing', (name, want) => {
    expect(slugify(name)).toBe(want);
  });

  it('never ends on a separator, even when cut short', () => {
    const long = slugify('كلمة '.repeat(40));
    expect(long.length).toBeLessThanOrEqual(MAX_SLUG);
    expect(long.endsWith('-')).toBe(false);
  });

  it('and everything it makes is an address this system accepts', () => {
    for (const name of ['كريم الأذن', 'Vitamin C', 'زيت الزيتون البكر', 'جل 50']) {
      expect(isSlug(slugify(name)), name).toBe(true);
    }
  });

  it('refuses what is not one', () => {
    for (const bad of ['-leading', 'has space', 'has/slash', 'has?query', '']) {
      expect(isSlug(bad), bad).toBe(false);
    }
  });
});

describe('two products with one name', () => {
  /** An ordinary thing in a shop, and the second one still needs an address. */
  it('numbers the second, at the end where it is read last', () => {
    expect(uniqueSlug('كريم', [])).toBe('كريم');
    expect(uniqueSlug('كريم', ['كريم'])).toBe('كريم-2');
    expect(uniqueSlug('كريم', ['كريم', 'كريم-2'])).toBe('كريم-3');
  });

  it('and the number never pushes it past the limit', () => {
    const base = 'ا'.repeat(MAX_SLUG);
    expect(uniqueSlug(base, [base]).length).toBeLessThanOrEqual(MAX_SLUG);
  });

  it('gives nothing when the name gave nothing', () => {
    expect(uniqueSlug('', ['x'])).toBe('');
  });
});

describe('what a changed address leaves behind', () => {
  /**
   * «تغيير رابط منتج بيولّد إعادة توجيه تلقائية». A product renamed
   * after its link has spread must not answer 404 — that link is the
   * shop's advertising and it keeps being tapped for weeks.
   */
  it('remembers the one it replaced, newest first', () => {
    expect(rememberSlug([], 'قديم', 'جديد')).toEqual(['قديم']);
    expect(rememberSlug(['قديم'], 'أقدم', 'جديد')).toEqual(['أقدم', 'قديم']);
  });

  /** A product renamed back and forth would otherwise redirect to itself. */
  it('never keeps the address it has now', () => {
    expect(rememberSlug(['جديد', 'قديم'], 'وسط', 'جديد')).toEqual(['وسط', 'قديم']);
  });

  it('does not repeat one', () => {
    expect(rememberSlug(['قديم'], 'قديم', 'جديد')).toEqual(['قديم']);
  });

  it('remembers a few, not every rename ever', () => {
    let history: string[] = [];
    for (let i = 0; i < MAX_HISTORY + 6; i++) history = rememberSlug(history, `s${i}`, 'now');
    expect(history.length).toBe(MAX_HISTORY);
  });

  it('reads whatever is in the column without throwing', () => {
    expect(parseHistory('["كريم","جل"]')).toEqual(['كريم', 'جل']);
    expect(parseHistory('{{')).toEqual([]);
    expect(parseHistory(null)).toEqual([]);
    // And drops anything that is not an address — the lookup matches on
    // the quoted string, so what may be written there is guarded.
    expect(parseHistory('["كريم","has space","a/b"]')).toEqual(['كريم']);
  });
});

describe('the seller’s own redirects stopped being Latin-only', () => {
  /**
   * `REDIRECT_FROM` was `[A-Za-z0-9/_.-]`, so a seller whose shop is
   * written in Arabic could not redirect any address their shop
   * actually has — which also made «تغيير رابط منتج بيولّد إعادة توجيه
   * تلقائية» impossible to honour even by hand.
   */
  it('accepts an Arabic path', () => {
    expect(REDIRECT_FROM.test('/عناية-بالبشرة')).toBe(true);
    expect(REDIRECT_FROM.test('/s/sehha/p/كريم-الاذن')).toBe(true);
  });

  /** And nothing was loosened on the way. */
  it.each([
    ['//evil.example', 'a protocol-relative URL'],
    ['/a\\b', 'a backslash'],
    ['/a b', 'whitespace'],
    ['/a?x=1', 'a query'],
    ['/a#b', 'a fragment'],
    ['no-leading-slash', 'no leading slash'],
  ])('still refuses %s (%s)', (path) => {
    expect(REDIRECT_FROM.test(path)).toBe(false);
  });
});

describe('the shop links by the address, everywhere', () => {
  const SURFACES = [
    'src/components/storefront/ProductCard.tsx',
    'src/app/s/[store]/p/[sku]/page.tsx',
  ];

  it.each(SURFACES)('%s links by the handle, not the SKU', (file) => {
    const src = stripComments(repoFile(file));
    expect(src, 'رابط بالـSKU').not.toMatch(/\/p\/\$\{[\w.]*\.sku\}/);
    expect(src).toMatch(/\/p\/\$\{encodeURIComponent\([\w.]*\.handle\)\}/);
  });

  /**
   * ONE PRODUCT, ONE ADDRESS. An old link still arrives — it is the
   * shop's own advertising — and is sent on permanently, so a search
   * engine moves its index rather than keeping two competing pages.
   */
  it('and an old address is sent to the current one', () => {
    const page = stripComments(repoFile('src/app/s/[store]/p/[sku]/page.tsx'));
    expect(page).toMatch(/if \(product\.handle !== sku\)/);
    expect(page).toMatch(/redirect\(`\/s\/\$\{store\.slug\}\/p\//);
  });

  it('and the lookup answers to all three', () => {
    const src = stripComments(repoFile('src/lib/storefront.ts'));
    expect(src).toMatch(/\{ slug: handle \}/);
    expect(src).toMatch(/\{ sku: handle\.toUpperCase\(\) \}/);
    expect(src).toMatch(/previousSlugs: \{ contains:/);
  });
});
