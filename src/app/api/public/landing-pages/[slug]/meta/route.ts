import { sellingCurrency, SELLING_STORE_SELECT } from '@/lib/selling-currency';
import { publicizeMedia } from '@/lib/public-media';
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

interface Ctx {
  params: Promise<{ slug: string }>;
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

/**
 * Public (no login): public metadata for a PUBLISHED landing page.
 * Product/price/company are always resolved server-side from the DB.
 * No PII, no session data — safe to expose.
 */
export async function GET(_req: Request, ctx: Ctx) {
  try {
    const { slug } = await ctx.params;
    if (!/^[a-z0-9-]{2,60}$/.test(slug)) {
      return NextResponse.json({ error: 'Not found' }, { status: 404, headers: CORS });
    }

    const lp = await db.landingPage.findFirst({
      where: { slug, isPublished: true },
      orderBy: { createdAt: 'asc' }, // one resolution for a slug everywhere — the oldest page keeps it
      select: {
        id: true,
        name: true,
        slug: true,
        productId: true,
        companyId: true,
        company: { select: { name: true } },
        store: SELLING_STORE_SELECT,
        product: { select: { name: true, nameEn: true, basePrice: true, image: true } },
      },
    });
    if (!lp) return NextResponse.json({ error: 'Not found' }, { status: 404, headers: CORS });

    return NextResponse.json(
      {
        name: lp.name,
        slug: lp.slug,
        // `company.currency` keeps its place in the answer so an embed already
        // pasted on a seller's site keeps reading it — the value is the
        // country's now, the one the order from this form is booked in.
        company: { name: lp.company.name, currency: await sellingCurrency(lp.store, lp.companyId) },
        product: lp.productId
          ? {
              name: lp.product?.name || null,
              nameEn: lp.product?.nameEn || null,
              price: lp.product?.basePrice ?? 0,
              // Read by visitors on the seller's site, who have no session.
              image: lp.product?.image ? publicizeMedia(lp.product.image, { via: lp.id }) : null,
            }
          : null,
      },
      { headers: CORS }
    );
  } catch {
    return NextResponse.json({ error: 'Internal error' }, { status: 500, headers: CORS });
  }
}