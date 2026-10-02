import { describe, expect, it } from 'vitest';
import { breadcrumbJsonLd, jsonLdText, productJsonLd, storeJsonLd } from './structured-data';
import { sharePreview } from './public-metadata';
import { repoFile, stripComments } from './guard-source';

/**
 * WHAT A SEARCH ENGINE AND A CHAT APP ARE TOLD.
 *
 * A storefront lives on search and on sharing, which a landing page does
 * not: an advert brings its own traffic, a shop has to be found. And the
 * one rule that outranks the rest is what this file does NOT say.
 */

const product = {
  name: 'كريم الأذن',
  sku: 'EAR-01',
  description: 'لالتهاب الأذن الخارجية',
  image: '/media/ear.jpg',
  fromPrice: 18000,
  category: { name: 'العناية' },
};

const base = {
  origin: 'https://shop.example',
  storeName: 'صحة',
  storeSlug: 'sehha',
  currency: 'SYP',
};

describe('THE RATING THAT IS NOT THERE', () => {
  /**
   * The brief asks for one «من التقييمات الموثّقة فقط», and this system
   * has no verified reviews — the reviews block holds testimonials a
   * seller typed. Emitting stars from those puts a rating in Google's
   * result page, in the one place a shopper cannot check it, sourced
   * from the shop that benefits. It is the invented struck-through
   * price again, with a larger audience and a worse remedy.
   */
  it('no markup this file produces carries a rating', () => {
    const all = JSON.stringify([
      productJsonLd({ ...base, product }),
      breadcrumbJsonLd({ ...base, leaf: { name: 'x', path: '/x' } }),
      storeJsonLd({ ...base, about: null, logo: null }),
    ]);
    for (const word of ['AggregateRating', 'ratingValue', 'reviewCount', 'Review']) {
      expect(all, word).not.toContain(word);
    }
  });

  it('and the file cannot grow one quietly', () => {
    const src = stripComments(repoFile('src/lib/structured-data.ts'));
    expect(src, 'تقييم في البيانات المنظّمة').not.toMatch(/aggregateRating|ratingValue|reviewCount/i);
  });

  /** The anchor: it does say the things it is for. */
  it('but it does say what the product is', () => {
    const made = productJsonLd({ ...base, product });
    expect(made['@type']).toBe('Product');
    expect(made.name).toBe('كريم الأذن');
    expect(made.sku).toBe('EAR-01');
  });
});

describe('the price in the markup is the price on the card', () => {
  /**
   * `fromPrice` — the cheapest per unit across the bundles, which is the
   * number the card shows and the number the order path charges from. A
   * shopper who clicked a result saying 18,000 and meets 24,000 has been
   * lied to by a machine, which is harder to forgive than a typo.
   */
  it('quotes the number the shopper will see', () => {
    const offer = productJsonLd({ ...base, product }).offers as Record<string, unknown>;
    expect(offer.price).toBe(18000);
    expect(offer.priceCurrency).toBe('SYP');
  });

  it('and says how it is paid for', () => {
    const offer = productJsonLd({ ...base, product }).offers as Record<string, unknown>;
    expect(JSON.stringify(offer)).toContain('الدفع عند الاستلام');
  });

  it('makes every address absolute, because a crawler has not got ours', () => {
    const made = productJsonLd({ ...base, product });
    expect(made.image).toBe('https://shop.example/media/ear.jpg');
    expect((made.offers as Record<string, string>).url).toBe('https://shop.example/s/sehha/p/EAR-01');
  });

  it('and leaves an absolute image alone', () => {
    const made = productJsonLd({ ...base, product: { ...product, image: 'https://cdn.x/a.jpg' } });
    expect(made.image).toBe('https://cdn.x/a.jpg');
  });

  it('says nothing about a picture there is none of', () => {
    expect(productJsonLd({ ...base, product: { ...product, image: null } }).image).toBeUndefined();
  });
});

describe('the trail to this page', () => {
  it('is shop, category, product', () => {
    const made = breadcrumbJsonLd({
      ...base,
      category: { id: 'c1', name: 'العناية' },
      leaf: { name: 'كريم', path: '/s/sehha/p/EAR-01' },
    });
    const items = made.itemListElement as { position: number; name: string }[];
    expect(items.map((i) => i.name)).toEqual(['صحة', 'العناية', 'كريم']);
    expect(items.map((i) => i.position)).toEqual([1, 2, 3]);
  });

  /** A trail with an empty rung reads as a broken site. */
  it('skips the category when there is not one', () => {
    const made = breadcrumbJsonLd({ ...base, leaf: { name: 'كريم', path: '/x' } });
    expect((made.itemListElement as unknown[]).length).toBe(2);
  });
});

describe('the share preview', () => {
  /**
   * The origin is CONFIGURED, never taken from a request header: a header
   * can be forged, and an Open Graph image pointing at somebody else's
   * host is a shop advertising on their behalf.
   */
  const withOrigin = <T,>(run: () => T): T => {
    const had = process.env.NEXT_PUBLIC_APP_URL;
    process.env.NEXT_PUBLIC_APP_URL = 'https://shop.example';
    try {
      return run();
    } finally {
      if (had === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
      else process.env.NEXT_PUBLIC_APP_URL = had;
    }
  };

  /**
   * A RELATIVE IMAGE IS DROPPED when there is no origin to make it
   * absolute — a chat app cannot resolve one, and a broken image in a
   * preview is cached by every app that saw it. Better no picture than a
   * picture nobody can load, and better still: set the variable.
   */
  it('shows no picture it cannot make absolute', () => {
    const meta = sharePreview({ title: 'x', image: '/media/ear.jpg', path: '/a' });
    expect(JSON.stringify(meta.openGraph)).not.toContain('/media/ear.jpg');
  });

  /**
   * «المنتجات بتنتشر بواتساب، والرابط بلا معاينة ما حدا بيضغطه». Most
   * chat apps render the description and ignore the rest, so the price
   * goes in it — it is what somebody forwarding a product wants shown.
   */
  it('carries a picture, a name and a price', () => {
    const meta = withOrigin(() =>
      sharePreview({
        title: 'كريم — صحة',
        description: '18,000 SYP · الدفع عند الاستلام',
        image: '/media/ear.jpg',
        path: '/s/sehha/p/EAR-01',
      })
    );
    expect(meta.openGraph?.title).toBe('كريم — صحة');
    expect(JSON.stringify(meta.openGraph)).toContain('18,000');
    expect(JSON.stringify(meta.openGraph)).toContain('/media/ear.jpg');
  });

  /**
   * One address per page. Every storefront page can be reached with a
   * query string on it; without a canonical each of those is a separate
   * page competing with the others.
   */
  it('names the one address this page should be known by', () => {
    const meta = sharePreview({ title: 'x', path: '/s/sehha/shop' });
    expect(String(meta.alternates?.canonical)).toContain('/s/sehha/shop');
    expect(String(meta.alternates?.canonical)).not.toContain('?');
  });

  it('asks for a large card only when there is a picture to fill it', () => {
    // Next's `Twitter` type is a union; the card is read off the object
    // rather than through it, which is what the renderer does too.
    const card = (meta: ReturnType<typeof sharePreview>) =>
      (meta.twitter as { card?: string } | undefined)?.card;
    expect(card(withOrigin(() => sharePreview({ title: 'x', path: '/a', image: '/i.jpg' })))).toBe(
      'summary_large_image'
    );
    expect(card(sharePreview({ title: 'x', path: '/a' }))).toBe('summary');
  });
});

describe('the markup cannot close its own tag', () => {
  /**
   * `</script>` inside a description would end the block and turn the
   * rest of a seller's words into markup on their own shop.
   */
  it('escapes the one sequence that could', () => {
    const text = jsonLdText({ description: '</script><img onerror=x>' });
    expect(text).not.toContain('</script>');
    expect(text).toContain('\\u003c');
  });
});

describe('the product page really carries it', () => {
  const page = () => stripComments(repoFile('src/app/s/[store]/p/[sku]/page.tsx'));

  it('writes both blocks', () => {
    expect(page()).toContain('productJsonLd(');
    expect(page()).toContain('breadcrumbJsonLd(');
    expect(page()).toMatch(/type="application\/ld\+json"/);
  });

  it('and its preview says the price', () => {
    expect(page()).toContain('sharePreview(');
    expect(page()).toMatch(/description: `\$\{price\} · الدفع عند الاستلام`/);
  });
});

describe('the shop’s map', () => {
  const route = () => stripComments(repoFile('src/app/s/[store]/sitemap.xml/route.ts'));

  /**
   * Per shop, never one for the platform: these are different businesses
   * on one installation, and a single map hands every seller's catalogue
   * to anybody who asks.
   */
  it('lists one shop’s pages, and asks for that shop first', () => {
    expect(route()).toContain('getStorefront(slug)');
    expect(route()).toContain('storefrontProducts(store.companyId, store.id)');
  });

  /**
   * The cart, the checkout, the thank-you and the tracking page are a
   * device's state or one customer's. A map that listed them would
   * invite a crawler to walk a form.
   */
  it.each(['/cart', '/checkout', '/thanks', '/track'])('never lists %s', (path) => {
    expect(route(), path).not.toContain(`${path}\``);
  });

  it('stamps a row’s own date, not today’s', () => {
    expect(route()).toMatch(/lastmod: p\.updatedAt/);
    expect(route(), 'ختم اليوم على كل شيء').not.toMatch(/lastmod: new Date\(\)/);
  });

  it('escapes what goes into the XML', () => {
    expect(route()).toMatch(/escape\(e\.loc\)/);
  });
});
