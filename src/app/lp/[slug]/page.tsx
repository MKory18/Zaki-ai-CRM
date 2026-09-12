import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { verifyPreviewToken } from '@/lib/landing-pages';
import OrderForm from '@/components/landing/OrderForm';
import { ShieldCheck, Truck, PhoneCall } from 'lucide-react';
import { LandingFormBridge } from '@/components/landing/LandingFormBridge';

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

async function fetchOffers(landingPageId: string) {
  return db.landingPageOffer.findMany({
    where: { landingPageId, isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { price: 'asc' }],
    select: { id: true, name: true, quantity: true, freeQuantity: true, price: true, isDefault: true },
  });
}

async function loadLpData(landingPageId: string) {
  const [offers, recs] = await Promise.all([
    fetchOffers(landingPageId),
    db.landingPageRecommendation.findMany({
      where: { landingPageId, isActive: true, product: { status: 'ACTIVE' } },
      orderBy: { sortOrder: 'asc' },
      select: {
        id: true,
        product: { select: { name: true, basePrice: true, image: true } },
      },
    }),
  ]);
  const recViews = recs.map((r) => ({
    id: r.id,
    name: r.product?.name || '',
    price: r.product?.basePrice ?? 0,
    image: r.product?.image || null,
  }));
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
    product?: { name: string; basePrice: number } | null;
    company?: { currency: string };
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
          product: { select: { name: true, basePrice: true } },
          company: { select: { currency: true } },
        },
      });
      if (lp) {
        [offers, recommendations] = await loadLpData(lp.id);
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
        company: { select: { currency: true } },
        product: { select: { name: true, basePrice: true } },
      },
    });
    if (!lp || !lp.isPublished) notFound();

    [offers, recommendations] = await loadLpData(lp.id);

    // Fire-and-forget view counter (non-fatal, no PII)
    db.landingPage
      .update({ where: { id: lp.id }, data: { viewsCount: { increment: 1 } } })
      .catch(() => {});
  }

  const rawSrc = `/lp/${encodeURIComponent(lp.slug)}/raw${previewToken ? `?p=${encodeURIComponent(previewToken)}` : ''}`;
  const productName = lp.product?.name || lp.name;
  const price = lp.product?.basePrice ?? 0;
  const currency = lp.company?.currency || 'USD';

  return (
    <div dir="rtl" className="flex min-h-screen flex-col bg-[#f7f7f8]">
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

      {/* 2. Trusted native order form — part of Zaki AI, after the content */}
      <LandingFormBridge offers={offers.map((o) => ({ ...o }))}>
        <OrderForm
          slug={lp.slug}
          productName={productName}
          basePrice={price}
          currency={currency}
          offers={offers.map((o) => ({ ...o }))}
          recommendations={recommendations}
        />
      </LandingFormBridge>

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