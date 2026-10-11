import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireContext, listAccessibleStores } from '@/lib/geo-context';
import { requirePermission } from '@/lib/authorization';
import { apiErrorResponse } from '@/lib/api-error';
import { publicPath } from '@/lib/public-address';
import { parseStoreTheme } from '@/lib/store-theme';
import { templateById } from '@/lib/store-templates';

/**
 * EVERY STORE — ONE CARD EACH.
 *
 * The screen at `/store` lists all of the seller's shops whatever their
 * type: logo, name, open/closed, address, template, how many products are
 * actually shown, how many published pages are still hidden, and the
 * store's health (logo · policy pages · domain · one shown product).
 * Deliberately NOT filtered to the selected store — "which of my shops
 * needs work?" cannot be asked from inside one of them. ACCESS bounds it
 * instead, through the same rows the store switcher obeys.
 *
 * The old single-product list keeps its own door
 * (`/api/growth/storefronts`); this one never picks a front page and
 * never opens a store — those stay writes on their own routes.
 */
export async function GET() {
  try {
    const { user, companyId, countryId, storeId: currentStoreId } = await requireContext();
    await requirePermission('geo.manage')
      .catch(async () => requirePermission('reports.view'))
      .catch(async () => requirePermission('storefront.view'));

    const accessible = (await listAccessibleStores(user, companyId, countryId)) ?? [];
    const ids = accessible.map((s) => s.id);
    if (ids.length === 0) return NextResponse.json({ stores: [] });

    const stores = await db.store.findMany({
      where: { id: { in: ids }, companyId },
      select: {
        id: true, name: true, slug: true, logo: true, type: true, status: true, companyId: true,
        storefrontEnabled: true, tagline: true, about: true, domain: true, domainVerifiedAt: true,
        theme: true, countryId: true,
        country: { select: { currencyCode: true } },
        landingPageId: true,
        landingPages: {
          orderBy: { createdAt: 'desc' },
          select: { id: true, name: true, slug: true, isPublished: true, domain: true, productId: true, product: { select: { name: true } } },
        },
      },
      orderBy: { name: 'asc' },
    });

    const list = await Promise.all(
      stores.map(async (s) => {
        const [publishedPages, shownPages, policyPages] = await Promise.all([
          db.landingPage.count({ where: { companyId, storeId: s.id, isPublished: true } }),
          db.landingPage.findMany({
            where: { companyId, storeId: s.id, isPublished: true, showInStore: true },
            select: { productId: true },
          }),
          db.storePage.count({
            where: { storeId: s.id, isPublished: true, kind: { in: ['TERMS', 'PRIVACY', 'REFUND'] } },
          }),
        ]);
        const shownProductIds = new Set(
          shownPages.map((p) => p.productId).filter((id): id is string => !!id)
        );
        let template: string | null = null;
        try {
          const key = parseStoreTheme(s.theme).template;
          template = (key && templateById(key)?.name) || null;
        } catch {
          template = null;
        }
        return {
          id: s.id,
          name: s.name,
          slug: s.slug,
          logo: s.logo,
          type: s.type,
          status: s.status,
          live: s.storefrontEnabled,
          tagline: s.tagline,
          about: s.about,
          domain: s.domain,
          domainVerifiedAt: s.domainVerifiedAt,
          currency: s.country.currencyCode,
          countryId: s.countryId,
          path: publicPath({ kind: 'store', slug: s.slug }),
          current: s.id === currentStoreId,
          template,
          shownProducts: shownProductIds.size,
          hiddenPublishedPages: publishedPages - shownPages.length,
          health: {
            hasLogo: !!s.logo,
            policyPages: policyPages > 0,
            domainOk: !s.domain || !!s.domainVerifiedAt,
            hasShownProduct: shownProductIds.size > 0,
          },
          /**
           * The front-page picker lives on, for Single Product shops only:
           * their address IS one of these pages. Multi-product shops have
           * no front page — their address is the catalogue.
           */
          frontPage: s.type === 'SINGLE_PRODUCT'
            ? (s.landingPages.find((p) => p.id === s.landingPageId) ?? null)
            : null,
          pages: s.type === 'SINGLE_PRODUCT'
            ? s.landingPages.map(({ productId: _p, ...page }) => page)
            : [],
        };
      })
    );

    return NextResponse.json({ stores: list });
  } catch (e) {
    return apiErrorResponse(e);
  }
}
