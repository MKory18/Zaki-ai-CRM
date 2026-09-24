import { db } from './db';

/**
 * WHEN A STOREFRONT MAY OPEN — ONE RULE, EVERY DOOR.
 *
 * A storefront is switched on from two screens: the store's own panel in
 * /settings/geo and the Single Product screen. They used to carry two rules
 * — one refused an empty shop, the other opened anything — so the same
 * store was "not ready" on one screen and live on the other. Both call this
 * now, and so does a change of type on a store that is already open.
 *
 * A refusal is a reason a visitor would meet a broken page: an empty shelf,
 * a page that answers 404, a product nobody can buy. Things that merely
 * make a shop worse (no support phone) are warnings, never refusals.
 */

export interface StorefrontFacts {
  type: string;
  status: string;
  /** ACTIVE products of THIS store with a price — what a catalogue would list. */
  sellableProducts: number;
  /** The Single Product store's front page, when one is picked. */
  frontPage: { isPublished: boolean; productActive: boolean } | null;
}

/** Why this store may not open, or null when it may. */
export function openRefusal(f: StorefrontFacts): string | null {
  if (f.status !== 'ACTIVE') return 'المتجر نفسه موقوف — فعّله من «البلدان والمتاجر» أولاً';
  if (f.type === 'SINGLE_PRODUCT') {
    if (f.frontPage) {
      if (!f.frontPage.isPublished) return 'صفحة واجهة المتجر غير منشورة — انشرها أولاً، وإلا فتح الرابط صفحة غير موجودة';
      if (!f.frontPage.productActive) return 'منتج صفحة الواجهة غير فعّال — لا شيء يُباع فيها';
      return null;
    }
    // No page picked yet: the store is its one product's page — so there
    // must be exactly one.
    if (f.sellableProducts === 1) return null;
    return 'اختر صفحة هبوط لتكون واجهة المتجر';
  }
  if (f.sellableProducts === 0) return 'لا منتجات فعّالة بسعر في هذا المتجر — الزائر سيجد رفوفاً فارغة';
  return null;
}

/** What a seller should still fix, though the store can open without it. */
export function openWarnings(store: { supportPhone: string | null }): string[] {
  return store.supportPhone ? [] : ['لا رقم دعم للزبون'];
}

/** The facts, read from the database, for one store as it would be. */
export async function storefrontFacts(
  store: { id: string; companyId: string; type: string; status: string; landingPageId: string | null }
): Promise<StorefrontFacts> {
  const [sellableProducts, page] = await Promise.all([
    db.product.count({
      where: { companyId: store.companyId, storeId: store.id, status: 'ACTIVE', basePrice: { gt: 0 } },
    }),
    store.type === 'SINGLE_PRODUCT' && store.landingPageId
      ? db.landingPage.findFirst({
          where: { id: store.landingPageId, companyId: store.companyId, storeId: store.id },
          select: { isPublished: true, product: { select: { status: true } } },
        })
      : Promise.resolve(null),
  ]);
  return {
    type: store.type,
    status: store.status,
    sellableProducts,
    frontPage: page ? { isPublished: page.isPublished, productActive: page.product?.status === 'ACTIVE' } : null,
  };
}

/** The refusal for opening this store, read fresh. */
export async function refusalToOpen(
  store: { id: string; companyId: string; type: string; status: string; landingPageId: string | null }
): Promise<string | null> {
  return openRefusal(await storefrontFacts(store));
}
