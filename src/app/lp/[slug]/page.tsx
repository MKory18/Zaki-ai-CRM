import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { ruleFor } from '@/lib/phone-rules';
import { verifyPreviewToken, clampStoredHtml } from '@/lib/landing-pages';
import OrderForm from '@/components/landing/OrderForm';
import { ShieldCheck, Truck, PhoneCall } from 'lucide-react';
import { LandingFormBridge } from '@/components/landing/LandingFormBridge';
import { detectOrderIntent } from '@/lib/landing-dynamic';
import { LandingTrackingPixels } from '@/components/tracking/LandingTrackingPixels';
import { getTrackingPixelsForPage } from '@/lib/tracking/tracking-config';
import { parseSections, ensureForm } from '@/lib/landing-sections';
import { paletteFor, paletteVars, DEFAULT_THEME } from '@/lib/landing-theme';
import { PageBlocks } from '@/components/landing/blocks/PageBlocks';
import { BLOCK_CSS_WITH_DEV_FONTS, fontHref } from '@/components/landing/blocks/styles';
import { availableStock } from '@/lib/reservation';

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ p?: string }>;
}

/**
 * Public landing page — NO login, NO getCurrentUser(), no session cookies.
 * Only PUBLISHED pages are served; unpublished/missing → 404.
 *
 * Composition:
 *   1. [Uploaded HTML]      → sandboxed iframe (opaque origin, untrusted)
 *   2. [Native Order Form]  → trusted React UI rendered by Zaki AI itself,
 *      below the content. The uploaded HTML can never touch this form.
 *
 * Isolation: the iframe has sandbox="allow-scripts allow-forms allow-popups"
 * WITHOUT allow-same-origin → opaque origin: no CRM session cookie
 * (salesflow_session), no localStorage/JWT/CSRF access, no credentialed
 * calls to admin APIs.
 *
 * Analytics: one view = one successful public render (preview renders are
 * excluded). No cookies, no IPs, no personal data (viewsCount only).
 */
export const dynamic = 'force-dynamic';

/**
 * The offers this page sells.
 *
 * They belong to the PRODUCT, so raising a price in the catalogue reaches
 * every page selling it. There was once a second, per-page copy of the same
 * tiers; it is gone, along with the drift between them.
 */
async function fetchOffers(_landingPageId: string, companyId: string, productId: string | null) {
  if (productId) {
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

  // No product, no offers. The form then shows the page's own base price.
  return [];
}

/**
 * The stored theme, or the default when it is missing or corrupt.
 * A page whose theme JSON went bad still sells, in the house colours.
 */
function safeTheme(raw: string | null | undefined): Partial<typeof DEFAULT_THEME> {
  if (!raw) return DEFAULT_THEME;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

async function loadLpData(landingPageId: string, companyId: string, productId: string | null) {
  const [offers, recs] = await Promise.all([
    fetchOffers(landingPageId, companyId, productId),
    db.landingPageRecommendation.findMany({
      where: { landingPageId, isActive: true, product: { status: 'ACTIVE' } },
      orderBy: { sortOrder: 'asc' },
      select: {
        id: true,
        product: { select: { name: true, basePrice: true, image: true } },
      },
    }),
  ]);
  // A recommendation needs a name and a price to be an offer at all. One
  // without them still rendered: the success screen said "add it to my
  // order — 0 USD" over a blank line, which reads as a broken page at the
  // exact moment the customer has just trusted us with their phone number.
  // The seller has not finished setting that product up; until they do, it
  // simply is not shown.
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

export default async function PublicLandingPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { p: previewToken } = await searchParams;
  if (!/^[a-z0-9-]{2,60}$/.test(slug)) notFound();

  // Preview renders (dashboard, short-lived signed token) may show unpublished pages
  let lp: {
    id: string;
    name: string;
    slug: string;
    isPublished?: boolean;
    htmlContent?: string | null;
    builderMode?: string | null;
    theme?: string | null;
    sections?: string | null;
    product?: { id: string; name: string; basePrice: number } | null;
    company?: { id: string; currency: string };
    store?: { countryId: string; country: { code: string; currencyCode: string } } | null;
  } | null = null;

  // Active offers + post-order recommendations (server-side, DB prices only)
  let offers: Awaited<ReturnType<typeof fetchOffers>> = [];
  let recommendations: { id: string; name: string; price: number; image: string | null }[] = [];

  if (previewToken) {
    const tok = await verifyPreviewToken(previewToken);
    if (tok) {
      lp = await db.landingPage.findFirst({
        where: { id: tok.lpId, slug },
        select: {
          id: true,
          name: true,
          slug: true,
          htmlContent: true,
          builderMode: true,
          theme: true,
          sections: true,
          product: { select: { id: true, name: true, basePrice: true } },
          company: { select: { id: true, currency: true } },
          store: { select: { countryId: true, country: { select: { code: true, currencyCode: true } } } },
        },
      });
      if (lp) {
        [offers, recommendations] = await loadLpData(lp.id, lp.company!.id, lp.product?.id ?? null);
      }
    }
  }

  if (!lp) {
    lp = await db.landingPage.findFirst({
      where: { slug, isPublished: true },
      select: {
        id: true,
        name: true,
        slug: true,
        isPublished: true,
        htmlContent: true,
        builderMode: true,
        theme: true,
        sections: true,
        company: { select: { id: true, currency: true } },
        product: { select: { id: true, name: true, basePrice: true } },
        store: { select: { countryId: true, country: { select: { code: true, currencyCode: true } } } },
      },
    });
    if (!lp || !lp.isPublished) notFound();

    [offers, recommendations] = await loadLpData(lp.id, lp.company!.id, lp.product?.id ?? null);

    // Fire-and-forget view counter (non-fatal, no PII)
    db.landingPage
      .update({ where: { id: lp.id }, data: { viewsCount: { increment: 1 } } })
      .catch(() => {});
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
  // The currency of the COUNTRY this page sells into, not of the company that
  // owns it. A Syrian buyer was being shown Jordanian dinars because the
  // company happens to be Jordanian, and the offer prices on the page were
  // never in dinars — they were entered for this store.
  const currency = lp.store?.country.currencyCode || lp.company?.currency || 'USD';

  // ── Form visibility rule ──
  //  - Legacy pages (NO data-zaki-* markers at all): trusted OrderForm renders
  //    below the content exactly as it always did (backward compatibility).
  //  - Behavior-layer pages (any data-zaki-* marker): the custom HTML owns the
  //    design; the trusted form exists ONLY when the user asked for ordering
  //    (data-zaki-action="order"/"scroll-order", legacy data-zaki-order, or
  //    the optional data-zaki-order-form anchor).
  const html = clampStoredHtml(lp.htmlContent) || '';
  const usesBehaviorLayer = /data-zaki-(?:action|offer|order|position|product)/.test(html);
  const showOrderForm = usesBehaviorLayer ? detectOrderIntent(html) : true;

  // ── Global Tracking Engine — single tracking source for this page. ──
  // Server-resolved pixels (GLOBAL + PUBLIC + LANDING_PAGES scopes of the
  // page's company), re-validated before any script may load. The uploaded
  // iframe can never fire or influence any of this. No pixels → no-op.
  const trackingPixels = lp.company?.id
    ? await getTrackingPixelsForPage(lp.company.id, 'LANDING_PAGES')
    : [];
  const viewContent = lp.product
    ? {
        contentIds: [lp.product.id],
        contentName: lp.product.name || null,
        value: lp.product.basePrice ?? null,
        currency,
      }
    : null;

  // ── Where the offer list lives ──
  // A block page may carry its own `offers` block. Then THAT is the picker
  // and the form must not draw a second one: the visitor was choosing among
  // three tiers and would suddenly be looking at six.
  const sections = lp.builderMode === 'BLOCKS' ? ensureForm(parseSections(lp.sections)) : [];
  const pageHasOffersBlock = sections.some((s) => s.type === 'offers' && s.enabled);

  // The trusted form is identical in both modes; only its surroundings differ.
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
      />
    </LandingFormBridge>
  );

  // ── Mode A: the block builder ──
  // A page authored from themed blocks. No iframe: nothing on it is
  // untrusted, because nothing on it was written as markup — the seller
  // chose blocks and filled in text, and this renderer drew them.
  if (sections.length > 0) {
    const palette = paletteFor(safeTheme(lp.theme));
    // The theme's font AND every font a block chose — asking for the
    // theme's alone left a block's pick falling back to the system stack.
    const href = fontHref(
      safeTheme(lp.theme).font ?? DEFAULT_THEME.font,
      ...sections.map((b) => b.look?.text?.font)
    );

    // Real stock, for the one block allowed to mention it. Unknown stays
    // unknown: the block renders nothing rather than inventing a number.
    let stock: number | null = null;
    if (lp.product && lp.company) {
      stock = await availableStock(db, lp.company.id, lp.product.id).catch(() => null);
    }

    return (
      <div dir="rtl" className="lp-root" style={paletteVars(palette) as React.CSSProperties}>
        {href && <link rel="stylesheet" href={href} />}
        <style dangerouslySetInnerHTML={{ __html: BLOCK_CSS_WITH_DEV_FONTS }} />
        <LandingTrackingPixels pixels={trackingPixels} viewContent={viewContent} />
        <PageBlocks
          sections={sections}
          ctx={{ palette, productName, price, currency, stock, offers, form: orderForm }}
        />
      </div>
    );
  }

  // ── Mode B: raw HTML, unchanged ──
  return (
    <div dir="rtl" className="flex min-h-screen flex-col bg-[#f7f7f8]">
      {/* 0. Global Tracking (Meta/TikTok/Snapchat) — trusted page only;
          the sandboxed iframe has no access to it. */}
      <LandingTrackingPixels pixels={trackingPixels} viewContent={viewContent} />
      {/* 1. Untrusted uploaded HTML — sandboxed opaque-origin iframe.
          data-zaki-* placeholders inside are resolved server-side (raw route);
          offer clicks / CTA clicks reach this page ONLY via LandingFormBridge,
          which validates every message against this page's own DB offers. */}
      <iframe
        src={rawSrc}
        title={lp.name}
        sandbox="allow-scripts allow-forms allow-popups"
        className="w-full border-none"
        style={{ height: '70vh', minHeight: 480, display: 'block' }}
      />

      {/* 2. Trusted native order form — rendered only when the page asks for
          ordering (or on legacy pages without behavior-layer markers) */}
      {showOrderForm && orderForm}

      {/* 3. Footer */}
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