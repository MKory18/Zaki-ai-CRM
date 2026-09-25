import { LandingTrackingPixels } from '@/components/tracking/LandingTrackingPixels';
import { getTrackingPixelsForPage } from '@/lib/tracking/tracking-config';
import { notFound, redirect } from 'next/navigation';
import { LandingPageView } from '@/components/landing/LandingPageView';
import { carryQuery } from '@/lib/query-string';
import Link from 'next/link';
import { getStorefront, storefrontProducts } from '@/lib/storefront';
import { parseSections } from '@/lib/landing-sections';
import { paletteFor } from '@/lib/landing-theme';
import { publicizeMedia } from '@/lib/public-media';
import { PageBlocks } from '@/components/landing/blocks/PageBlocks';
import { BLOCK_CSS } from '@/components/landing/blocks/styles';
import { StorefrontShell } from '@/components/storefront/StorefrontShell';
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

  if (store.type === 'SINGLE_PRODUCT') {
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
  const home = parseSections(store.homeLive).filter((s) => s.enabled);
  if (home.length > 0) {
    return (
      <StorefrontShell store={store}>
        <LandingTrackingPixels page="PUBLIC" pixels={pixelsForHome} viewContent={null} />
        <style dangerouslySetInnerHTML={{ __html: BLOCK_CSS }} />
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
          }}
        />
      </StorefrontShell>
    );
  }

  const products = await storefrontProducts(store.companyId, store.id);

  const money = (n: number) =>
    `${Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 })} ${store.currencyCode}`;
  return (
    <StorefrontShell store={store}>
      <LandingTrackingPixels page="PUBLIC" pixels={pixelsForHome} viewContent={null} />
      <section className="sf-hero">
        <h1>{store.tagline || store.name}</h1>
        {store.about && <p>{store.about}</p>}
      </section>

      {products.length === 0 ? (
        <p className="sf-empty">لا منتجات معروضة حالياً.</p>
      ) : (
        <div className="sf-grid-wrap">
          <div className="sf-grid">
            {products.map((p) => (
              <Link key={p.id} href={`/s/${store.slug}/p/${p.sku}`} className="sf-card">
                {p.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.image} alt={p.name} className="sf-card-img" loading="lazy" />
                ) : (
                  <span className="sf-card-none" aria-hidden />
                )}
                <span className="sf-card-body">
                  <span className="sf-card-name">{p.name}</span>
                  <span className="sf-card-price" dir="ltr">
                    {/* The cheapest per unit across its bundles — the number a
                        shopper compares, computed from the offers the order
                        path charges from. */}
                    {p.fromPrice < p.basePrice && <small>من </small>}
                    {money(p.fromPrice)}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </StorefrontShell>
  );
}
