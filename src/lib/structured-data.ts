/**
 * WHAT A SEARCH ENGINE AND A CHAT APP ARE TOLD ABOUT A PAGE.
 *
 * A storefront lives on search and on sharing, which a landing page does
 * not: an advert brings its own traffic, a shop has to be found. So each
 * product page states what it is in the one vocabulary both Google and
 * WhatsApp read.
 *
 * NO AggregateRating. THIS IS THE WHOLE POINT OF THIS FILE.
 *
 * The brief asks for one «من التقييمات الموثّقة فقط», and this system has
 * no verified reviews — the reviews block holds testimonials a seller
 * typed. Emitting stars from those would put a rating in Google's result
 * page, in the one place a shopper cannot check it, sourced from the shop
 * that benefits. It is the invented struck-through price again, with a
 * larger audience and a worse remedy.
 *
 * So there is no rating here, and `structured-data.test.ts` makes sure
 * there never quietly is. When verified reviews exist, a rating becomes
 * one more field — and until then its absence is the honest answer.
 *
 * AND EVERY FIGURE COMES FROM THE SAME PLACE THE PAGE SHOWS. The price in
 * the markup is the price on the card, which is the price the order path
 * charges. A shopper who clicked a search result saying 18,000 and meets
 * 24,000 has been lied to by a machine, which is harder to forgive.
 */

export interface ProductForMarkup {
  name: string;
  sku: string;
  description: string | null;
  image: string | null;
  /** The number the card shows — the cheapest per unit across its bundles. */
  fromPrice: number;
  category: { name: string } | null;
}

/** An absolute address, because a crawler and a chat app do not have ours. */
function absolute(origin: string, path: string): string {
  if (!path) return origin;
  if (/^https?:\/\//.test(path)) return path;
  return `${origin.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

/**
 * One product, as `Product` with its `Offer`.
 *
 * `availability` is stated as in-stock only because the page itself is:
 * `storefrontProduct` serves nothing that is not ACTIVE with a price. A
 * page that is not there says nothing at all, which is the correct
 * answer and better than a page saying «out of stock» forever.
 */
export function productJsonLd(args: {
  origin: string;
  storeName: string;
  storeSlug: string;
  currency: string;
  product: ProductForMarkup;
}): Record<string, unknown> {
  const { origin, storeName, storeSlug, currency, product } = args;
  const url = absolute(origin, `/s/${storeSlug}/p/${product.sku}`);

  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    sku: product.sku,
    ...(product.description ? { description: product.description } : {}),
    ...(product.image ? { image: absolute(origin, product.image) } : {}),
    ...(product.category ? { category: product.category.name } : {}),
    brand: { '@type': 'Brand', name: storeName },
    offers: {
      '@type': 'Offer',
      url,
      priceCurrency: currency,
      price: product.fromPrice,
      availability: 'https://schema.org/InStock',
      // Cash on delivery, everywhere this sells. Saying so in the markup
      // is saying the one thing that decides the sale.
      acceptedPaymentMethod: {
        '@type': 'PaymentMethod',
        name: 'الدفع عند الاستلام',
      },
    },
  };
}

/**
 * Where this page sits — shop, category, product.
 *
 * The category step is included only when the product has one: a trail
 * with an empty rung in it reads as a broken site to a crawler and to
 * anybody looking at the result.
 */
export function breadcrumbJsonLd(args: {
  origin: string;
  storeName: string;
  storeSlug: string;
  category?: { id: string; name: string } | null;
  leaf?: { name: string; path: string } | null;
}): Record<string, unknown> {
  const { origin, storeName, storeSlug, category, leaf } = args;
  const items: { name: string; item: string }[] = [
    { name: storeName, item: absolute(origin, `/s/${storeSlug}`) },
  ];
  if (category) {
    items.push({
      name: category.name,
      item: absolute(origin, `/s/${storeSlug}/shop?cat=${encodeURIComponent(category.id)}`),
    });
  }
  if (leaf) items.push({ name: leaf.name, item: absolute(origin, leaf.path) });

  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((entry, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: entry.name,
      item: entry.item,
    })),
  };
}

/**
 * The shop itself, for its front page.
 *
 * `Store` rather than `Organization`: it is a shop, it has an address
 * only in the sense of a region it delivers to, and claiming a postal
 * address it does not have would be markup nobody can verify.
 */
export function storeJsonLd(args: {
  origin: string;
  storeName: string;
  storeSlug: string;
  about: string | null;
  logo: string | null;
}): Record<string, unknown> {
  const { origin, storeName, storeSlug, about, logo } = args;
  return {
    '@context': 'https://schema.org',
    '@type': 'Store',
    name: storeName,
    url: absolute(origin, `/s/${storeSlug}`),
    ...(about ? { description: about } : {}),
    ...(logo ? { logo: absolute(origin, logo) } : {}),
  };
}

/**
 * The markup as a string for a `<script type="application/ld+json">`.
 *
 * `</script>` inside a value would close the tag and turn a description
 * into markup — so the one sequence that can do that is escaped, and
 * nothing else about the JSON is touched.
 */
export function jsonLdText(value: Record<string, unknown>): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}
