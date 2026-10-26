import { db } from '@/lib/db';
import { publicOrigin } from '@/lib/public-metadata';

/**
 * «وصف بسيط للمنتجات بالكروس سيل، او رابط بيثير الفضول لصفحة المنتج او صفحة الهبوط».
 *
 * A suggestion on the thank-you screen was a name and a price — nothing a
 * customer who has never heard of the product can decide on. It now carries
 * one short line and, where the product has a page of its own, a link to it.
 *
 * THE LINE: the seller's own words for this page when they wrote some;
 * otherwise the start of the product's description, cut on a word. Nothing
 * at all when neither exists — an invented sentence about a product is a
 * claim nobody made.
 *
 * THE LINK: the product's own published landing page in the same store,
 * else its page inside the shop when the shop is open and has product pages.
 * Absolute when the app's address is configured, because this screen may be
 * on a seller's own domain, which answers only for its own page.
 */

export const BLURB_MAX = 140;
const FROM_DESCRIPTION = 90;

export function blurbOf(own: string | null | undefined, description: string | null | undefined): string | null {
  const mine = own?.trim();
  if (mine) return mine.slice(0, BLURB_MAX);
  const text = (description ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  if (!text) return null;
  if (text.length <= FROM_DESCRIPTION) return text;
  const cut = text.slice(0, FROM_DESCRIPTION);
  const space = cut.lastIndexOf(' ');
  return `${(space > FROM_DESCRIPTION / 2 ? cut.slice(0, space) : cut).trim()}…`;
}

export interface ShopForLinks {
  slug: string;
  storefrontEnabled: boolean;
  status: string;
  type: string;
  landingPageId: string | null;
}

/** The shop answers `/s/<slug>/p/<handle>` only when it is open and is not a one-page shop with a front page. */
export function shopHasProductPages(shop: ShopForLinks | null | undefined): shop is ShopForLinks {
  return !!shop && shop.storefrontEnabled && shop.status === 'ACTIVE' && !(shop.type === 'SINGLE_PRODUCT' && shop.landingPageId);
}

export interface LinkableProduct {
  id: string;
  sku: string;
  slug: string | null;
}

/**
 * productId → the address of that product's own page, for the products that
 * have one. `exceptPageId` is the page the customer is on: it is never "the
 * product's page" for another product, and never a link back to itself.
 */
export async function productPageLinks(args: {
  companyId: string;
  storeId: string | null;
  exceptPageId: string | null;
  products: LinkableProduct[];
  shop: ShopForLinks | null;
}): Promise<Map<string, string>> {
  const links = new Map<string, string>();
  if (args.products.length === 0) return links;
  const origin = publicOrigin();

  const pages = await db.landingPage.findMany({
    where: {
      companyId: args.companyId,
      storeId: args.storeId,
      isPublished: true,
      productId: { in: args.products.map((p) => p.id) },
      ...(args.exceptPageId ? { id: { not: args.exceptPageId } } : {}),
    },
    orderBy: { updatedAt: 'desc' },
    select: { productId: true, slug: true },
  });
  for (const page of pages) {
    if (page.productId && !links.has(page.productId)) links.set(page.productId, `${origin}/lp/${page.slug}`);
  }

  if (shopHasProductPages(args.shop)) {
    for (const p of args.products) {
      if (!links.has(p.id)) links.set(p.id, `${origin}/s/${args.shop.slug}/p/${encodeURIComponent(p.slug || p.sku)}`);
    }
  }
  return links;
}
