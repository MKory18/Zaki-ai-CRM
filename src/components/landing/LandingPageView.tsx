import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import { ShieldCheck, Truck, PhoneCall } from 'lucide-react';
import { db } from '@/lib/db';
import { ruleFor } from '@/lib/phone-rules';
import { verifyPreviewToken, clampStoredHtml } from '@/lib/landing-pages';
import { sellingCurrency } from '@/lib/selling-currency';
import OrderForm from '@/components/landing/OrderForm';
import { LandingFormBridge } from '@/components/landing/LandingFormBridge';
import { detectOrderIntent } from '@/lib/landing-dynamic';
import { LandingTrackingPixels } from '@/components/tracking/LandingTrackingPixels';
import { getTrackingPixelsForPage } from '@/lib/tracking/tracking-config';
import { parseSections, ensureForm } from '@/lib/landing-sections';
import { paletteFor, paletteVars, DEFAULT_THEME } from '@/lib/landing-theme';
import { parseStoreTheme, themeForPage } from '@/lib/store-theme';
import { directionOf } from '@/lib/store-languages';
import { loadStoreFonts } from '@/lib/fonts/load-store-fonts';
import { PageBlocks } from '@/components/landing/blocks/PageBlocks';
import { BLOCK_CSS_WITH_DEV_FONTS, fontHref } from '@/components/landing/blocks/styles';
import { availableStock } from '@/lib/reservation';
import { deviceClassOf, recordLandingView } from '@/lib/landing-views';
import { resolveCampaign } from '@/lib/campaigns-server';
import { afterResponse } from '@/lib/notify';
import { publicizeMedia } from '@/lib/public-media';

/**
 * A LANDING PAGE, RENDERED — THE ONE RENDERER.
 *
 * Reached two ways: at /lp/<slug>, and as the front of a Single Product
 * store at /s/<store> (or the store's own domain). Both are this component,
 * so a store's front has every block, template, pixel, upsell and view
 * count a landing page has — there is no second page system to keep level.
 *
 * NO login, NO getCurrentUser(), no session cookies. Only PUBLISHED pages
 * are served; a preview token (the dashboard's, short-lived and signed) may
 * show an unpublished one to its author, and a preview is not a visit: it
 * loads no pixel and counts no view.
 *
 * Composition, for a page built from raw HTML:
 *   1. [Uploaded HTML]      → sandboxed iframe (opaque origin, untrusted)
 *   2. [Native Order Form]  → trusted React UI rendered by us, below it.
 * The iframe has sandbox="allow-scripts allow-forms allow-popups" WITHOUT
 * allow-same-origin: no session cookie, no storage, no credentialed calls.
 *
 * Analytics: one view = one successful public render. No cookies, no IPs,
 * no personal data.
 */

/**
 * The offers this page sells. They belong to the PRODUCT, so raising a
 * price in the catalogue reaches every page selling it.
 */
async function fetchOffers(companyId: string, productId: string | null) {
  if (!productId) return [];
  const fromProduct = await db.offer.findMany({
    where: { companyId, productId, status: 'ACTIVE' },
    orderBy: [{ sortOrder: 'asc' }, { quantity: 'asc' }],
    select: {
      id: true, name: true, quantity: true, freeQuantity: true,
      sellingPrice: true, compareAtPrice: true, isDefault: true,
    },
  });
  return fromProduct.map((o) => ({
    id: o.id,
    name: o.name,
    quantity: o.quantity,
    freeQuantity: o.freeQuantity,
    price: o.sellingPrice,
    // A "was" price that is not above the price is not a saving.
    compareAtPrice: o.compareAtPrice !== null && o.compareAtPrice > o.sellingPrice ? o.compareAtPrice : null,
    isDefault: o.isDefault,
  }));
}

/**
 * A page's OVERRIDE of its store's theme, or nothing.
 *
 * The store owns the look now. A page that saved no theme of its own wears
 * its store's template, which is why an absent value is `null` here rather
 * than DEFAULT_THEME — returning the house theme would have every page
 * silently overriding its store with the factory colours.
 */
function pageThemeOverride(raw: string | null | undefined): Partial<typeof DEFAULT_THEME> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

async function loadLpData(landingPageId: string, companyId: string, productId: string | null) {
  const [offers, recs] = await Promise.all([
    fetchOffers(companyId, productId),
    db.landingPageRecommendation.findMany({
      where: { landingPageId, isActive: true, product: { status: 'ACTIVE' } },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, product: { select: { name: true, basePrice: true, image: true } } },
    }),
  ]);
  // A recommendation needs a name and a price to be an offer at all: one
  // without them read "add it to my order — 0 USD" over a blank line, at the
  // moment the customer has just trusted us with their phone number.
  const recViews = recs
    .map((r) => ({
      id: r.id,
      name: (r.product?.name || '').trim(),
      price: r.product?.basePrice ?? 0,
      image: r.product?.image || null,
    }))
    .filter((r) => r.name && r.price > 0);
  return [offers, recViews] as const;
}

const PAGE_SELECT = {
  id: true,
  name: true,
  slug: true,
  isPublished: true,
  htmlContent: true,
  builderMode: true,
  theme: true,
  sections: true,
  product: { select: { id: true, name: true, basePrice: true } },
  company: { select: { id: true } },
  storeId: true,
  store: {
    select: {
      countryId: true, name: true, logo: true, favicon: true, supportPhone: true, theme: true, language: true,
      country: { select: { code: true, currencyCode: true } },
    },
  },
} as const;

export type LandingPageTarget = (
  /** /lp/<slug>, optionally previewed with the dashboard's token. */
  | { slug: string; previewToken?: string }
  /** A Single Product store's front: its picked page, published only. */
  | { frontPageId: string; storeId: string }
) & {
  /** The ?c= campaign code the visit arrived with, if any. */
  campaign?: string;
};

export async function LandingPageView({ target }: { target: LandingPageTarget }) {
  let previewing = false;
  let lp = null as Awaited<ReturnType<typeof findPage>>;

  async function findPage(where: Record<string, unknown>) {
    // Oldest first: a slug shared by two companies from before slugs were
    // made unique resolves the same way here as in the order route.
    return db.landingPage.findFirst({ where, select: PAGE_SELECT, orderBy: { createdAt: 'asc' } });
  }

  if ('slug' in target) {
    if (target.previewToken) {
      const tok = await verifyPreviewToken(target.previewToken);
      if (tok) {
        lp = await findPage({ id: tok.lpId, slug: target.slug });
        if (lp) previewing = true;
      }
    }
    if (!lp) lp = await findPage({ slug: target.slug, isPublished: true });
  } else {
    // The page must still belong to the store that shows it: a page moved or
    // re-bound elsewhere must not keep answering at this store's address.
    lp = await findPage({ id: target.frontPageId, storeId: target.storeId, isPublished: true });
  }
  if (!lp || (!previewing && !lp.isPublished)) notFound();
  const companyId = lp.company!.id;

  const [offers, recs] = await loadLpData(lp.id, companyId, lp.product?.id ?? null);
  const previewToken = 'slug' in target && previewing ? target.previewToken : undefined;
  // A visitor has no session: every stored image this page shows goes out
  // through the public media route, naming this page (public-media.ts). A
  // preview is the signed-in seller in the dashboard's frame — the private
  // links work for them, and do not expire under a lazy-loaded image the way
  // a ten-minute token would.
  const forVisitors = <T,>(value: T): T => (previewing ? value : publicizeMedia(value, { via: lp.id }));
  const recommendations = forVisitors(recs);

  if (!previewing) {
    // A visit: counted once in the page's lifetime total and once in its
    // day's row (device and campaign), both after the page has gone out. A
    // link-preview crawler is not a visitor and counts in neither.
    const device = deviceClassOf((await headers()).get('user-agent'));
    if (device) {
      const page = { id: lp.id, storeId: lp.storeId ?? null };
      const code = target.campaign;
      afterResponse(async () => {
        await db.landingPage.update({ where: { id: page.id }, data: { viewsCount: { increment: 1 } } });
        const campaignId = code && page.storeId ? await resolveCampaign(companyId, page.storeId, code) : null;
        await recordLandingView({ companyId, storeId: page.storeId, landingPageId: page.id, campaignId, device });
      });
    }
  }

  // The cities offered and the phone format come from the country this page
  // sells into — never from a hard-coded list.
  const countryCode = lp.store?.country.code ?? null;
  const regions = lp.store
    ? (
        await db.region.findMany({
          where: { countryId: lp.store.countryId, isActive: true },
          select: { name: true },
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        })
      ).map((r) => r.name)
    : [];

  const rawSrc = `/lp/${encodeURIComponent(lp.slug)}/raw${previewToken ? `?p=${encodeURIComponent(previewToken)}` : ''}`;
  const productName = lp.product?.name || lp.name;
  const price = lp.product?.basePrice ?? 0;
  // The currency of the COUNTRY this page sells into, not of the company.
  const currency = await sellingCurrency(lp.store, companyId);

  // ── Form visibility rule ──
  //  - Legacy pages (NO data-zaki-* markers at all): the trusted OrderForm
  //    renders below the content exactly as it always did.
  //  - Behaviour-layer pages (any data-zaki-* marker): the custom HTML owns
  //    the design; the trusted form exists ONLY when the page asks for
  //    ordering (data-zaki-action="order"/"scroll-order", legacy
  //    data-zaki-order, or the optional data-zaki-order-form anchor).
  const html = clampStoredHtml(lp.htmlContent) || '';
  const usesBehaviorLayer = /data-zaki-(?:action|offer|order|position|product)/.test(html);
  const showOrderForm = usesBehaviorLayer ? detectOrderIntent(html) : true;

  // ── Tracking — server-resolved pixels of the page's company, re-validated
  // before any script may load. A preview loads none: the seller checking
  // their own page is not a PageView to report to their ad account.
  const trackingPixels = previewing ? [] : await getTrackingPixelsForPage(companyId, 'LANDING_PAGES');
  const viewContent = lp.product
    ? { contentIds: [lp.product.id], contentName: lp.product.name || null, value: lp.product.basePrice ?? null, currency }
    : null;

  // A block page may carry its own `offers` block. Then THAT is the picker
  // and the form must not draw a second one.
  const sections = lp.builderMode === 'BLOCKS' ? forVisitors(ensureForm(parseSections(lp.sections))) : [];
  const pageHasOffersBlock = sections.some((s) => s.type === 'offers' && s.enabled);
  // What the customer reads after ordering — the seller's words when the page
  // has a thank-you block, ours when it does not.
  const thanks = sections.find((s) => s.type === 'thankyou' && s.enabled);
  const thankYou = thanks && thanks.type === 'thankyou' ? { title: thanks.title, message: thanks.message } : undefined;

  const orderForm = (
    <LandingFormBridge
      offers={offers.map((o) => ({ ...o }))}
      currency={currency}
      product={lp.product ? { id: lp.product.id, name: lp.product.name } : null}
    >
      <OrderForm
        slug={lp.slug}
        productName={productName}
        basePrice={price}
        currency={currency}
        offers={offers.map((o) => ({ ...o }))}
        recommendations={recommendations}
        regions={regions}
        phonePlaceholder={ruleFor(countryCode)?.example}
        showOfferPicker={!pageHasOffersBlock}
        thankYou={thankYou}
      />
    </LandingFormBridge>
  );

  // ── Mode A: the block builder ──
  // Nothing on it is untrusted, because nothing on it was written as
  // markup — the seller chose blocks and filled in text.
  if (sections.length > 0) {
    // The store is the template; the page may depart from it. One place
    // decides, so a shop cannot end up with two answers to what colour it is.
    const theme = forVisitors(themeForPage(parseStoreTheme(lp.store?.theme), pageThemeOverride(lp.theme)));
    const palette = paletteFor(theme);
    // The theme's font AND every font a block chose.
    const href = fontHref(theme.font ?? DEFAULT_THEME.font, ...sections.map((b) => b.look?.text?.font));
    // The store's own uploaded faces — filtered by the page's store, never
    // by the company: a font licensed to one brand is not the next brand's.
    const storeFonts = await loadStoreFonts(lp.storeId);
    // Real stock of THIS store, for the one block allowed to mention it.
    // Unknown stays unknown: the block renders nothing rather than inventing.
    let stock: number | null = null;
    if (lp.product) {
      stock = await availableStock(db, companyId, lp.product.id, undefined, lp.storeId).catch(() => null);
    }

    return (
      // Its store's language and direction, not a hard-coded rtl: a page
      // selling in English was being mirrored.
      <div
        dir={directionOf(lp.store?.language)}
        lang={lp.store?.language ?? 'ar'}
        className="lp-root"
        style={paletteVars(palette) as React.CSSProperties}
      >
        {href && <link rel="stylesheet" href={href} />}
        <style dangerouslySetInnerHTML={{ __html: BLOCK_CSS_WITH_DEV_FONTS }} />
        {storeFonts.css && <style dangerouslySetInnerHTML={{ __html: storeFonts.css }} />}
        <LandingTrackingPixels pixels={trackingPixels} viewContent={viewContent} />
        <PageBlocks
          sections={sections}
          ctx={{
            palette, productName, price, currency, stock, offers, form: orderForm,
            store: lp.store ? { name: lp.store.name, logo: lp.store.logo, phone: lp.store.supportPhone } : null,
          }}
        />
      </div>
    );
  }

  // ── Mode B: raw HTML ──
  return (
    <div dir="rtl" className="flex min-h-screen flex-col bg-[#f7f7f8]">
      <LandingTrackingPixels pixels={trackingPixels} viewContent={viewContent} />
      <iframe
        src={rawSrc}
        title={lp.name}
        sandbox="allow-scripts allow-forms allow-popups"
        className="w-full border-none"
        style={{ height: '70vh', minHeight: 480, display: 'block' }}
      />
      {showOrderForm && orderForm}
      <footer className="border-t border-[#e3e8ef] bg-white px-4 py-8">
        <div className="mx-auto flex max-w-md flex-col items-center gap-4 text-center sm:flex-row sm:justify-center sm:gap-8">
          <span className="flex items-center gap-2 text-xs font-medium text-[#364152]">
            <ShieldCheck className="h-4 w-4 text-[#00c853]" /> طلب آمن
          </span>
          <span className="flex items-center gap-2 text-xs font-medium text-[#364152]">
            <Truck className="h-4 w-4 text-[#b8256e]" /> توصيل سريع
          </span>
          <span className="flex items-center gap-2 text-xs font-medium text-[#364152]">
            <PhoneCall className="h-4 w-4 text-[#3e97ff]" /> دعم متواصل
          </span>
        </div>
        <p className="mt-4 text-center text-[11px] text-[#9aa4b2]">جميع الحقوق محفوظة</p>
      </footer>
    </div>
  );
}
