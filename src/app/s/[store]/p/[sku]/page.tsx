import { LandingTrackingPixels } from '@/components/tracking/LandingTrackingPixels';
import { SIZES_HERO, srcSetFor } from '@/lib/responsive-image';
import { PreloadHero } from '@/components/storefront/PreloadHero';
import { getTrackingPixelsForPage } from '@/lib/tracking/tracking-config';
import { notFound, redirect } from 'next/navigation';
import { carryQuery } from '@/lib/query-string';
import { db } from '@/lib/db';
import { activeOffersFor } from '@/lib/offers';
import { getStorefront, storefrontProduct } from '@/lib/storefront';
import { StorefrontShell } from '@/components/storefront/StorefrontShell';
import Link from 'next/link';
import { RecentlyViewed } from '@/components/storefront/RecentlyViewed';
import { ProductCard } from '@/components/storefront/ProductCard';
import { layoutOf } from '@/lib/store-theme';
import { boughtTogether } from '@/lib/store-facts';
import { storefrontProducts } from '@/lib/storefront';
import { moneyText } from '@/lib/money';
import { OfferCards } from '@/components/landing/blocks/OfferCards';
import { LandingFormBridge } from '@/components/landing/LandingFormBridge';
import OrderForm from '@/components/landing/OrderForm';
import { ruleFor } from '@/lib/phone-rules';
import type { Metadata } from 'next';
import { publicOrigin, publicTitle, sharePreview, storeIcons } from '@/lib/public-metadata';
import { breadcrumbJsonLd, jsonLdText, productJsonLd } from '@/lib/structured-data';

/**
 * A product, in a store, orderable.
 *
 * Every piece here already existed: the offer cards from the block builder,
 * the trusted order form from the landing page, the offers from the product.
 * A storefront that grew its own copy of any of them would be a second place
 * for a price to be right.
 */
export const dynamic = 'force-dynamic';

/**
 * WHAT MAY BE IN A PRODUCT'S ADDRESS.
 *
 * The readable one is Arabic letters, Latin letters, digits and the
 * separator; the SKU is the Latin set it always was. Both are accepted
 * because both are real links out there — and the page then settles the
 * shopper on the current one.
 */
const HANDLE = /^[\u0621-\u063A\u0641-\u064AA-Za-z0-9._-]{1,80}$/;

/**
 * THE ADDRESS AS A PERSON WROTE IT.
 *
 * A route parameter arrives percent-encoded when it is not ASCII, so an
 * Arabic address reaches here as `%D8%B3%D9%8A…` and the pattern above
 * refuses it for the `%`.
 *
 * A malformed escape throws rather than answering with nonsense, so the
 * raw value is kept and the pattern refuses that instead.
 */
function readable(param: string): string {
  try {
    return decodeURIComponent(param);
  } catch {
    return param;
  }
}


interface Props {
  params: Promise<{ store: string; sku: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ params }: Pick<Props, 'params'>): Promise<Metadata> {
  const { store: slug, sku: raw } = await params;
  const sku = readable(raw);
  if (!/^[a-z0-9-]{2,60}$/.test(slug) || !HANDLE.test(sku)) return {};
  const store = await getStorefront(slug);
  if (!store) return {};
  const product = await storefrontProduct(store.companyId, store.id, sku);
  if (!product) return { title: publicTitle(null, store.name), icons: storeIcons(store) };

  /**
   * THE SHARE PREVIEW CARRIES THE PRICE.
   *
   * «المنتجات بتنتشر بواتساب، والرابط بلا معاينة ما حدا بيضغطه». Most
   * chat apps render the description and ignore everything else, so the
   * price goes in it — it is the thing somebody forwarding a product
   * wants shown, and the reason the next person taps.
   */
  const country = await db.country.findUnique({
    where: { id: store.countryId },
    select: { currencyCode: true, minorUnit: true },
  });
  const price = moneyText(product.fromPrice, country?.currencyCode ?? null, country?.minorUnit ?? 2);

  return {
    title: publicTitle(product.name, store.name),
    icons: storeIcons(store),
    ...sharePreview({
      title: `${product.name} — ${store.name}`,
      description: `${price} · الدفع عند الاستلام`,
      image: product.image,
      path: `/s/${store.slug}/p/${encodeURIComponent(product.handle)}`,
    }),
  };
}

export default async function StorefrontProductPage({ params, searchParams }: Props) {
  const { store: slug, sku: raw } = await params;
  const sku = readable(raw);
  if (!/^[a-z0-9-]{2,60}$/.test(slug) || !HANDLE.test(sku)) notFound();

  const store = await getStorefront(slug);
  if (!store) notFound();

  // A store with a front page has no product pages: the front IS the shop.
  if (store.type === 'SINGLE_PRODUCT' && store.landingPageId) {
    redirect(`/s/${store.slug}${carryQuery(await searchParams)}`);
  }

  const product = await storefrontProduct(store.companyId, store.id, sku);
  if (!product) notFound();

  /**
   * ONE PRODUCT, ONE ADDRESS.
   *
   * The link that arrived may be an address this product used to have,
   * or its SKU from before readable ones existed. Both still work —
   * they are the shop's own advertising, out in family groups — and
   * both land here, which sends the shopper to the current address.
   *
   * Permanent, so a search engine moves its index rather than keeping
   * two pages that compete with each other.
   */
  if (product.handle !== sku) {
    redirect(`/s/${store.slug}/p/${encodeURIComponent(product.handle)}`);
  }

  // The same offers the order path will charge from. A listing that reads a
  // different source is a listing that can advertise a price the checkout
  // refuses.
  // The country's own minor unit: the same one every price on this page
  // is written with.
  const minorUnit =
    (await db.country.findUnique({ where: { id: store.countryId }, select: { minorUnit: true } }))
      ?.minorUnit ?? 2;

  const offers = await activeOffersFor(db, store.companyId, product.id, minorUnit);

  // Already the shape every surface renders, and already measured against
  // real delivered orders — see price-honesty.ts. This used to be a copy of
  // the mapping, and a copy is a place the rule can be got wrong quietly.
  const offerViews = offers;

  /**
   * «يُشترى معه عادةً» — FROM ORDERS THAT REALLY CARRIED BOTH.
   *
   * `boughtTogether` returns nothing below its sample floor, and nothing
   * is what gets drawn: a section asking the customer to add something to
   * their order has to be standing on more than a coincidence. The
   * products come from the same shelf read the grid uses, so a pair whose
   * other half has been retired quietly shrinks the row.
   */

  const pairs = await boughtTogether(db, { companyId: store.companyId, storeId: store.id }, product.id);
  const shelf = pairs.length > 0 ? await storefrontProducts(store.companyId, store.id) : [];
  const alsoBought = pairs
    .map((pair) => shelf.find((s) => s.id === pair.productId))
    .filter((s): s is NonNullable<typeof s> => Boolean(s));

  const regions = (
    await db.region.findMany({
      where: { countryId: store.countryId, isActive: true },
      select: { name: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    })
  ).map((r) => r.name);

  // A single-product shop's product page IS its home page, so there is
  // nowhere to go back to.
  const back = store.type === 'SINGLE_PRODUCT' ? undefined : { href: `/s/${store.slug}`, label: 'كل المنتجات' };

  // A storefront page is a selling page: the store's company's pixels, the
  // ones not limited to landing pages.
  const pixels = await getTrackingPixelsForPage(store.companyId, 'PUBLIC', {
    storeId: store.id,
    countryId: store.countryId,
  });

  return (
    <StorefrontShell store={store} back={back}>
      <LandingTrackingPixels
        page="PUBLIC"
        pixels={pixels}
        viewContent={{
          contentIds: [product.id],
          contentName: product.name,
          value: product.basePrice,
          currency: store.currencyCode,
        }}
      />
      {/*
        THE GALLERY BESIDE THE DETAILS, OR ABOVE THEM.
        On a phone there is only one answer and both variants give it:
        the gallery, then the locked core — price, «أضف للسلة»,
        «اطلب الآن», the cash-on-delivery line — and only then the prose.
        The variant decides the wide screen.
      */}
      {/*
        WHAT A SEARCH ENGINE IS TOLD, and it is the same thing the page
        shows: the price here is the price on the card, which is the
        price the order path charges. A shopper who clicked a result
        saying 18,000 and meets 24,000 has been lied to by a machine.

        No rating. There are no verified reviews in this system, and
        stars in a search result are the one claim a shopper cannot
        check — see structured-data.ts.
      */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdText(
            productJsonLd({
              origin: publicOrigin(),
              storeName: store.name,
              storeSlug: store.slug,
              currency: store.currencyCode,
              product,
            })
          ),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdText(
            breadcrumbJsonLd({
              origin: publicOrigin(),
              storeName: store.name,
              storeSlug: store.slug,
              category: product.category,
              leaf: { name: product.name, path: `/s/${store.slug}/p/${encodeURIComponent(product.handle)}` },
            })
          ),
        }}
      />
      <article className="sf-product" data-product={layoutOf(store.theme, 'productPage')}>
        <div className="sf-product-top">
          <div className="sf-gallery">
            {product.image ? (
              <>
                {/*
                  THE ONE IMAGE THE PAGE IS MEASURED BY.

                  This is the product photograph — on almost every product
                  page it is the largest thing painted, so it IS the LCP.
                  Without the preload the browser does not learn the URL
                  until it has parsed its way down to this element; with
                  it, the request starts while the rest of the document is
                  still arriving.

                  `fetchPriority="high"` on BOTH: the preload states the
                  intent and the element must agree, or the browser sees
                  two requests for one picture at two priorities.

                  No `loading` attribute: eager is the default, and
                  `loading="lazy"` on the LCP image is the single most
                  common way to make a page slower while believing you
                  made it faster.
                */}
                {/*
                  `ReactDOM.preload`, NOT A `<link>` WRITTEN BY HAND.

                  A hand-written `<link rel="preload">` in a server
                  component is hoisted into the head by React — and the
                  copy it hoists loses its `href`, while the one written
                  here stays in the body. Measured: two preload elements
                  for one photograph and an extra request for it, which is
                  precisely what a preload exists to prevent.

                  This is the supported way to say the same thing, and
                  React emits exactly one element.
                */}
                <PreloadHero image={product.image} />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={product.image}
                  srcSet={srcSetFor(product.image) ?? undefined}
                  sizes={srcSetFor(product.image) ? SIZES_HERO : undefined}
                  alt={product.name}
                  className="sf-gallery-main"
                  fetchPriority="high"
                  decoding="async"
                />
              </>
            ) : (
              <span className="sf-card-none" aria-hidden />
            )}
            {product.gallery.length > 1 && (
              <div className="sf-gallery-strip">
                {product.gallery.slice(1, 5).map((src, i) => (
                  // A thumbnail is never wider than about 90px, so the
                  // smallest render is the right one and no `sizes` is
                  // needed to say so.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={i}
                    src={srcSetFor(src) ? `${src}?w=320` : src}
                    alt=""
                    loading="lazy"
                    decoding="async"
                  />
                ))}
              </div>
            )}
          </div>

          <div>
            <h1>{product.name}</h1>
            {product.description && <p className="sf-product-desc">{product.description}</p>}

            {offerViews.length > 0 && (
              <>
                <h2 className="lp-h2" style={{ textAlign: 'start', marginBottom: 12 }}>
                  اختر العرض المناسب
                </h2>
                <OfferCards offers={offerViews} currency={store.currencyCode} />
              </>
            )}
          </div>
        </div>

        <section className="lp-section lp-form-section">
          <h2 className="lp-h2">أكمل الطلب</h2>
          <p className="lp-sub">ادفع عند الاستلام — لا حاجة لبطاقة</p>

          <LandingFormBridge
            offers={offerViews.map((o) => ({ id: o.id, price: o.price }))}
            currency={store.currencyCode}
            product={{ id: product.id, name: product.name }}
          >
            <OrderForm
              slug={`${store.slug}/${product.sku}`}
              productName={product.name}
              basePrice={product.basePrice}
              currency={store.currencyCode}
              offers={offerViews.map((o) => ({ ...o, isDefault: o.isDefault }))}
              recommendations={[]}
              regions={regions}
              phonePlaceholder={ruleFor(store.countryCode)?.example}
              // The page's own offer cards are the picker; the form states
              // which one is chosen rather than listing them a second time.
              showOfferPicker={offerViews.length === 0}
              // The shop's own direction, not the landing page's default:
              // a shop selling in English mirrors, and the form mirrors
              // with it.
              dir={store.dir}
              // Same number the header's WhatsApp button uses.
              whatsapp={store.supportPhone}
              endpoint={`/api/public/stores/${store.slug}/products/${product.sku}/orders`}
            />
          </LandingFormBridge>
        </section>

        {alsoBought.length > 0 && (
          <section className="sf-row" aria-labelledby="sf-also">
            <h2 id="sf-also">يُشترى معه عادةً</h2>
            <div className="sf-grid">
              {alsoBought.map((other) => (
                <ProductCard
                  key={other.id}
                  slug={store.slug}
                  product={other}
                  currency={store.currencyCode}
                  minorUnit={minorUnit}
                  variant={layoutOf(store.theme, 'productCard')}
                />
              ))}
            </div>
          </section>
        )}

        {/* Reads the device, adds this page to it, and draws nothing when
            there is nothing — see RecentlyViewed. */}
        <RecentlyViewed slug={store.slug} minorUnit={minorUnit} currentProductId={product.id} />
      </article>
    </StorefrontShell>
  );
}
