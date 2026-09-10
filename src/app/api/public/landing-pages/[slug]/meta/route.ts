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
      select: {
        id: true,
        name: true,
        slug: true,
        productId: true,
        company: { select: { name: true, currency: true } },
        product: { select: { name: true, nameEn: true, basePrice: true, image: true } },
      },
    });
    if (!lp) return NextResponse.json({ error: 'Not found' }, { status: 404, headers: CORS });

    return NextResponse.json(
      {
        name: lp.name,
        slug: lp.slug,
        company: { name: lp.company.name, currency: lp.company.currency },
        product: lp.productId
          ? {
              name: lp.product?.name || null,
              nameEn: lp.product?.nameEn || null,
              price: lp.product?.basePrice ?? 0,
              image: lp.product?.image || null,
            }
          : null,
      },
      { headers: CORS }
    );
  } catch {
    return NextResponse.json({ error: 'Internal error' }, { status: 500, headers: CORS });
  }
}