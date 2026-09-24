import { db } from './db';
import { DEFAULT_THEME, type LandingTheme } from './landing-theme';

/**
 * A STORE, SEEN FROM THE OUTSIDE.
 *
 * The store already existed — it is what an order belongs to, what a user
 * has access to, what a landing page sits inside. It simply had no public
 * face. This gives it one, and deliberately gives it nothing else: no second
 * product catalogue, no second offer system, no second order path. A
 * storefront is a view of what the company already sells.
 *
 * Two shapes from one model, because `Store.type` already said which:
 *
 *   SINGLE_PRODUCT — the home page IS a landing page: the one the seller
 *                    picked as the store's front, with every block, template,
 *                    pixel and upsell it has. No catalogue, no cart. Until a
 *                    page is picked, it is its one product's page.
 *   MULTI_PRODUCT  — home lists what is for sale, each with its own page.
 *
 * Everything is read through THIS store. The catalogue used to be read by
 * company, so one shop listed — and sold — another shop's products, and the
 * order landed on the wrong shop's stock.
 *
 * Only ACTIVE products with a price are listed. A product with no price is
 * not a product a customer can buy, and showing it teaches them the shop is
 * broken.
 */

export interface StorefrontProduct {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  image: string | null;
  basePrice: number;
  /** The cheapest per-unit bundle, for a "from" price on a listing. */
  fromPrice: number;
}

export interface Storefront {
  id: string;
  name: string;
  slug: string;
  logo: string | null;
  tagline: string | null;
  about: string | null;
  supportPhone: string | null;
  domain: string | null;
  type: 'SINGLE_PRODUCT' | 'MULTI_PRODUCT';
  theme: LandingTheme;
  currencyCode: string;
  countryCode: string;
  countryId: string;
  companyId: string;
  /** A Single Product store's front page, when one is picked. */
  landingPageId: string | null;
}

/** The stored theme, or the house one when it is missing or corrupt. */
export function storeTheme(raw: string | null | undefined): LandingTheme {
  if (!raw) return DEFAULT_THEME;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? { ...DEFAULT_THEME, ...parsed } : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

/**
 * The storefront at this slug, or null.
 *
 * A paused store and a store whose owner never turned the storefront on both
 * read as absent: a shop that is not open should not be browsable.
 */
export async function getStorefront(slug: string): Promise<Storefront | null> {
  const store = await db.store.findFirst({
    where: { slug, storefrontEnabled: true, status: 'ACTIVE' },
    // Slugs are unique across companies from now on; for any pair that
    // predates that, the older store keeps its address — deterministically.
    orderBy: { createdAt: 'asc' },
    select: {
      id: true, name: true, slug: true, logo: true, tagline: true, about: true,
      supportPhone: true, domain: true, type: true, theme: true,
      companyId: true, countryId: true, landingPageId: true,
      country: { select: { code: true, currencyCode: true } },
    },
  });
  if (!store) return null;

  return {
    id: store.id,
    name: store.name,
    slug: store.slug,
    logo: store.logo,
    tagline: store.tagline,
    about: store.about,
    supportPhone: store.supportPhone,
    domain: store.domain,
    type: store.type === 'SINGLE_PRODUCT' ? 'SINGLE_PRODUCT' : 'MULTI_PRODUCT',
    theme: storeTheme(store.theme),
    currencyCode: store.country.currencyCode,
    countryCode: store.country.code,
    countryId: store.countryId,
    companyId: store.companyId,
    landingPageId: store.type === 'SINGLE_PRODUCT' ? store.landingPageId : null,
  };
}

/**
 * What this store has for sale.
 *
 * The "from" price is the cheapest per unit across the product's bundles,
 * because that is the number a shopper compares — and it is computed from
 * the same offers the order path charges from, so a listing can never
 * advertise a price the checkout will not honour.
 */
export async function storefrontProducts(
  companyId: string,
  storeId: string,
  limit = 60
): Promise<StorefrontProduct[]> {
  const products = await db.product.findMany({
    where: { companyId, storeId, status: 'ACTIVE', basePrice: { gt: 0 } },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      id: true, sku: true, name: true, description: true, image: true, basePrice: true,
      offers: {
        where: { status: 'ACTIVE' },
        select: { quantity: true, freeQuantity: true, sellingPrice: true },
      },
      images: {
        where: { isPrimary: true },
        take: 1,
        select: { url: true },
      },
    },
  });

  return products.map((p) => {
    const perUnit = p.offers
      .map((o) => {
        const units = o.quantity + o.freeQuantity;
        return units > 0 ? o.sellingPrice / units : o.sellingPrice;
      })
      .filter((n) => n > 0);

    return {
      id: p.id,
      sku: p.sku,
      name: p.name,
      description: p.description,
      image: p.images[0]?.url ?? p.image,
      basePrice: p.basePrice,
      fromPrice: perUnit.length ? Math.min(...perUnit) : p.basePrice,
    };
  });
}

/**
 * One product of this store, by its SKU.
 *
 * The SKU is the URL because it already exists, is already unique per
 * company and is already URL-safe — a second "slug" column would be one
 * more name for the same thing, and one more place for them to disagree.
 */
export async function storefrontProduct(
  companyId: string,
  storeId: string,
  sku: string
): Promise<(StorefrontProduct & { gallery: string[] }) | null> {
  const p = await db.product.findFirst({
    where: { companyId, storeId, sku: sku.toUpperCase(), status: 'ACTIVE', basePrice: { gt: 0 } },
    select: {
      id: true, sku: true, name: true, description: true, image: true, basePrice: true,
      offers: {
        where: { status: 'ACTIVE' },
        select: { quantity: true, freeQuantity: true, sellingPrice: true },
      },
      images: {
        orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }],
        select: { url: true },
      },
    },
  });
  if (!p) return null;

  const perUnit = p.offers
    .map((o) => {
      const units = o.quantity + o.freeQuantity;
      return units > 0 ? o.sellingPrice / units : o.sellingPrice;
    })
    .filter((n) => n > 0);

  const gallery = p.images.map((i) => i.url);

  return {
    id: p.id,
    sku: p.sku,
    name: p.name,
    description: p.description,
    image: gallery[0] ?? p.image,
    basePrice: p.basePrice,
    fromPrice: perUnit.length ? Math.min(...perUnit) : p.basePrice,
    gallery,
  };
}
