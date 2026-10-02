import { LandingTrackingPixels } from '@/components/tracking/LandingTrackingPixels';
import { getTrackingPixelsForPage } from '@/lib/tracking/tracking-config';
import { notFound, redirect } from 'next/navigation';
import { LandingPageView } from '@/components/landing/LandingPageView';
import { carryQuery } from '@/lib/query-string';
import Link from 'next/link';
import { db } from '@/lib/db';
import { getStorefront, storefrontCatalog, storefrontProducts } from '@/lib/storefront';
import { parseSections } from '@/lib/landing-sections';
import { paletteFor } from '@/lib/landing-theme';
import { publicizeMedia } from '@/lib/public-media';
import { PageBlocks } from '@/components/landing/blocks/PageBlocks';
import { StorefrontShell } from '@/components/storefront/StorefrontShell';
import { ProductCard } from '@/components/storefront/ProductCard';
import { CategoryNav } from '@/components/storefront/CategoryNav';
import { layoutOf } from '@/lib/store-theme';
import type { Metadata } from 'next';
import { publicTitle, storeIcons } from '@/lib/public-metadata';

/**
 * A store's front door — no login, no session, no cookies.
 *
 * A Single Product store IS its front page: the landing page the seller
 * picked, rendered right here at the store's address (and its domain) with
 * everything the page has. Rendered, not redirected — a redirect lost the
 * ?c= campaign code, and with it the credit for every sale an ad brought.
 * Until a page is picked it behaves as any store: its one product's page,
 * or its list. A shop with many products lists them — its own, and only
 * its own.
 */
export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ store: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ params }: Pick<Props, 'params'>): Promise<Metadata> {
  const { store: slug } = await params;
  const store = /^[a-z0-9-]{2,60}$/.test(slug) ? await getStorefront(slug) : null;
  if (!store) return {};
  return { title: publicTitle(store.name, store.tagline), icons: storeIcons(store) };
}

export default async function StorefrontHome({ params, searchParams }: Props) {
  const { store: slug } = await params;
  if (!/^[a-z0-9-]{2,60}$/.test(slug)) notFound();

  const store = await getStorefront(slug);
  if (!store) notFound();

  // ── A home page the seller built and PUBLISHED wins ──
  //
  // Read before the single-product branch below, because a seller who has
  // published a shop home has said what they want their address to open:
  // the shop, with its pages inside it. Until they publish one, nothing
  // changes — the front page still renders here exactly as it did.
  const home = parseSections(store.homeLive).filter((s) => s.enabled);

  if (store.type === 'SINGLE_PRODUCT' && home.length === 0) {
    if (store.landingPageId) {
      const { c } = await searchParams;
      return (
        <LandingPageView
          target={{ frontPageId: store.landingPageId, storeId: store.id, campaign: typeof c === 'string' ? c : undefined }}
        />
      );
    }
    // No front page picked yet: with one product, that product's page (the
    // campaign code carried along); otherwise the store's own products, as
    // any store shows them, until a front page is picked. A store that was
    // open before front pages existed must not go dark on the day they did.
    const only = await storefrontProducts(store.companyId, store.id, 2);
    if (only.length === 1) redirect(`/s/${store.slug}/p/${only[0].sku}${carryQuery(await searchParams)}`);
  }

  const pixelsForHome = await getTrackingPixelsForPage(store.companyId, 'PUBLIC');

  // ── A home page the seller built ──
  // Only what was PUBLISHED: the draft is the seller's own workbench, and a
  // half-finished page must never be what a customer opens. Drawn by the
  // SAME renderer the builder previews with, so what they approved is what
  // ships. A shop that has published nothing keeps the product list it
  // always had.
  if (home.length > 0) {
    /**
     * THE CATALOGUE'S CONTENTS, READ ONLY IF SOMETHING ASKS FOR THEM.
     *
     * A home page of a hero and a footer must not pay for two queries it
     * never renders, so this is fetched when a `catalog` block is actually
     * on the page.
     */
    const wantsCatalog = home.some((b) => b.type === 'catalog');
    const catalogue = wantsCatalog
      ? await storefrontCatalog(store.companyId, store.id, store.slug)
      : null;

    // The shopper's chosen category, from the query string. A link and a
    // server render rather than client state: this page is a server
    // component, and a shopper with no JavaScript still gets to browse.
    const { cat } = await searchParams;
    const activeCategory =
      typeof cat === 'string' && catalogue?.categories.some((c) => c.id === cat) ? cat : null;

    return (
      <StorefrontShell store={store}>
        <LandingTrackingPixels page="PUBLIC" pixels={pixelsForHome} viewContent={null} />
        {/*
          The block stylesheet was inlined HERE as well, inside a
          `StorefrontShell` that already inlines it — so any shop that had
          actually built a home page served 25 KB of identical CSS twice,
          on the one page that matters most for how fast the shop feels.
          The shell is the owner; this was the copy.
        */}
        <PageBlocks
          // Stored images are linked privately by the builder; a shopper has
          // no session, so they are made public for this render.
          sections={publicizeMedia(home, { via: store.id })}
          ctx={{
            palette: paletteFor(store.theme),
            productName: store.name,
            price: 0,
            currency: store.currencyCode,
            stock: null,
            offers: [],
            // A home page sells nothing directly: the order form belongs to a
            // product's page and to a landing page, where there is something
            // to order. A form block here renders as nothing rather than as a
            // form that cannot say what it is buying.
            form: null,
            store: { name: store.name, logo: store.logo, phone: store.supportPhone },
            catalog: catalogue
              ? {
                  ...catalogue,
                  activeCategory,
                  // Back to the same address with one parameter changed:
                  // nothing else about where the shopper is gets lost.
                  categoryHref: (id: string | null) =>
                    id ? `/s/${store.slug}?cat=${encodeURIComponent(id)}` : `/s/${store.slug}`,
                }
              : null,
          }}
        />
      </StorefrontShell>
    );
  }

  const products = await storefrontProducts(store.companyId, store.id);

  /**
   * The country's own minor unit, for the one formatter.
   *
   * This page used to write prices with a `toLocaleString` of its own —
   * a fifth way to spell an amount, two decimals wherever the country
   * says otherwise. `ProductCard` goes through `moneyText` like every
   * other surface.
   */
  // The categories this shop's own products carry — derived, like the
  // catalogue block's, never a per-store table.
  const categories = [
    ...new Map(products.flatMap((p) => (p.category ? [[p.category.id, p.category] as const] : []))).values(),
  ];

  const minorUnit =
    (await db.country.findUnique({ where: { id: store.countryId }, select: { minorUnit: true } }))
      ?.minorUnit ?? 2;

  return (
    <StorefrontShell store={store}>
      <LandingTrackingPixels page="PUBLIC" pixels={pixelsForHome} viewContent={null} />
      {/*
        THE FIRST SCREEN SHOWS SOMETHING TO BUY.
        It was `<h1>{store.tagline || store.name}</h1>` — the shop's name,
        alone, under a header already carrying the name and the tagline.
        «اسم المتجر مكرر ثلاث مرات بأول شاشة؛ البطل ضايع على الاسم» and
        «أول شاشة ما فيها منتج ولا عرض ولا فئة» are the brief's own words
        for that screen.

        The tagline stays when there IS one — it says what the shop sells,
        which the name usually does not. The bare name never does: the
        header has it, the tab title has it, and a third telling sells
        nothing.
      */}
      {store.tagline && (
        <section className="sf-hero">
          <h1>{store.tagline}</h1>
          {store.about && <p>{store.about}</p>}
        </section>
      )}

      <CategoryNav
        categories={categories}
        activeId={null}
        hrefFor={(id) => (id ? `/s/${store.slug}/shop?cat=${encodeURIComponent(id)}` : `/s/${store.slug}/shop`)}
        variant={layoutOf(store.theme, 'categoryNav')}
      />

      {products.length === 0 ? (
        <p className="sf-empty">لا منتجات معروضة حالياً.</p>
      ) : (
        <div className="sf-grid-wrap">
          <div className="sf-grid">
            {products.map((p) => (
              <ProductCard
                key={p.id}
                slug={store.slug}
                product={p}
                currency={store.currencyCode}
                minorUnit={minorUnit}
                variant={layoutOf(store.theme, 'productCard')}
              />
            ))}
          </div>
        </div>
      )}
    </StorefrontShell>
  );
}
