import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { verifyAddonToken } from '@/lib/landing-pages';
import { ORDER_NUMBER_RE } from '@/lib/order-ref';

interface Ctx {
  params: Promise<{ slug: string; orderNumber: string }>;
}

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

const MAX_BODY_BYTES = 2 * 1024;

// Client sends ONLY the signed token + the recommendationId (from the
// server-provided success-screen list). No price / product / quantity /
// company — everything is derived server-side.
const addonSchema = z.object({
  token: z.string().min(20).max(2048),
  recommendationId: z.string().min(10).max(64),
});

/**
 * Public add-product-to-existing-order endpoint (upsells).
 *
 * Security model:
 *  - the short-lived signed addon token (30m, issued right after order
 *    creation) proves this anonymous visitor owns THIS order — knowing the
 *    orderNumber alone is NOT enough to modify someone else's order.
 *  - the recommendation must belong to the SAME landing page.
 *  - price/total are taken from the DB product — client values ignored.
 *  - no status changes, no customer changes, no cross-order access.
 */
export async function POST(req: Request, ctx: Ctx) {
  try {
    const { slug, orderNumber } = await ctx.params;
    if (!/^[a-z0-9-]{2,60}$/.test(slug)) {
      return NextResponse.json({ error: 'Not found' }, { status: 404, headers: CORS });
    }
    // The shape comes from the generator, not from a copy kept here: this
    // check used to demand a literal "ORD-" that nothing has produced since
    // numbering became per-store, and so refused every upsell before it
    // could be looked up. The token is what proves ownership; this only
    // keeps a malformed id out of the query.
    if (!ORDER_NUMBER_RE.test(decodeURIComponent(orderNumber))) {
      return NextResponse.json({ error: 'Not found' }, { status: 404, headers: CORS });
    }

    // Rate limit add-ons (per orderNumber — a token is bound to one order)
    const rl = rateLimit(`lp_addon:${orderNumber}`, 5, 30 * 60_000);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: `محاولات كثيرة جدًا. أعد المحاولة بعد ${rl.retryAfterSec} ثانية` },
        { status: 429, headers: { ...CORS, 'Retry-After': String(rl.retryAfterSec) } }
      );
    }

    const contentLength = parseInt(req.headers.get('content-length') || '0', 10);
    if (contentLength > MAX_BODY_BYTES) {
      return NextResponse.json({ error: 'البيانات كبيرة جدًا' }, { status: 413, headers: CORS });
    }

    // Soft origin validation (same policy as the orders endpoint)
    const origin = req.headers.get('origin');
    if (origin && origin !== 'null') {
      try {
        const o = new URL(origin);
        if (req.headers.get('host') && o.host !== req.headers.get('host')) {
          return NextResponse.json({ error: 'طلب غير مسموح' }, { status: 403, headers: CORS });
        }
      } catch {
        return NextResponse.json({ error: 'طلب غير مسموح' }, { status: 403, headers: CORS });
      }
    }

    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      return NextResponse.json({ error: 'بيانات غير صالحة' }, { status: 400, headers: CORS });
    }
    const parsed = addonSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'بيانات غير صالحة' },
        { status: 400, headers: CORS }
      );
    }
    const v = parsed.data;

    // ─── Signed token: proves ownership of this order, 30-minute TTL ───
    const tok = await verifyAddonToken(v.token);
    if (!tok || tok.orderNumber !== decodeURIComponent(orderNumber)) {
      return NextResponse.json({ error: 'رابط الإضافة غير صالح أو منتهي الصلاحية' }, { status: 401, headers: CORS });
    }

    // ─── Resolve order: token orderId + orderNumber + landing-page slug must all match ───
    const order = await db.order.findFirst({
      where: { id: tok.orderId, orderNumber: tok.orderNumber },
      include: { landingPage: { select: { id: true, name: true, slug: true, isPublished: true } } },
    });
    if (!order || !order.landingPage || order.landingPage.slug !== slug) {
      return NextResponse.json({ error: 'غير مسموح' }, { status: 404, headers: CORS });
    }
    // Unpublished page → upsells disappear for everyone (fail-closed)
    if (!order.landingPage.isPublished) {
      return NextResponse.json({ error: 'غير مسموح' }, { status: 403, headers: CORS });
    }

    // ─── Recommendation must belong to THIS landing page and be active ───
    const rec = await db.landingPageRecommendation.findFirst({
      where: { id: v.recommendationId, landingPageId: order.landingPage.id, isActive: true },
      include: { product: { select: { id: true, name: true, basePrice: true, image: true, status: true } } },
    });
    if (!rec) {
      return NextResponse.json(
        { error: 'المنتج المقترح غير متاح' },
        { status: 400, headers: CORS }
      );
    }
    if (!rec.product || rec.product.status !== 'ACTIVE') {
      return NextResponse.json({ error: 'المنتج غير متاح حاليًا' }, { status: 409, headers: CORS });
    }

    const unitPrice = rec.product.basePrice; // server-side price — never from the browser
    const addQty = 1; // one unit per add — client cannot choose quantity
    const addTotal = Number((unitPrice * addQty).toFixed(2));

    // ─── Update the SAME order server-side (no new order, total from DB) ───
    const result = await db.$transaction(async (tx) => {
      const addOn = await tx.orderAddOn.create({
        data: {
          companyId: order.companyId,
          orderId: order.id,
          productId: rec.product.id,
          landingPageId: order.landingPage!.id,
          productName: rec.product.name,
          quantity: addQty,
          price: unitPrice,
          total: addTotal,
        },
      });
      const updated = await tx.order.update({
        where: { id: order.id },
        data: { totalAmount: { increment: addTotal } },
      });
      await tx.landingPage.update({
        where: { id: order.landingPage!.id },
        data: {
          upsellAddsCount: { increment: 1 },
          upsellRevenue: { increment: addTotal },
        },
      });
      await tx.orderActivity.create({
        data: {
          companyId: order.companyId,
          orderId: order.id,
          userId: null,
          action: 'UPSELL_ADDED',
          newStatus: null,
          metadata: JSON.stringify({
            source: 'Landing Page',
            addOnId: addOn.id,
            product: rec.product.name,
            quantity: addQty,
            price: unitPrice,
            landingPage: order.landingPage!.name,
          }),
        },
      });
      return { addOn, order: updated };
    });

    return NextResponse.json(
      {
        success: true,
        orderNumber: result.order.orderNumber,
        addOn: { id: result.addOn.id, productName: result.addOn.productName, price: result.addOn.price, quantity: result.addOn.quantity },
        newTotal: result.order.totalAmount,
      },
      { headers: CORS }
    );
  } catch (error) {
    console.error('Public add-product failed:', error);
    return NextResponse.json({ error: 'حدث خطأ داخلي' }, { status: 500, headers: CORS });
  }
}