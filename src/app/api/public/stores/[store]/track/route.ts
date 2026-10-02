import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getClientIp, rateLimit } from '@/lib/rate-limit';
import { getStorefront } from '@/lib/storefront';
import { normalizePhoneNumber } from '@/lib/phone';
import { deliveryWindows } from '@/lib/delivery-time';
import { TRACKING_NOT_FOUND, trackingView } from '@/lib/order-tracking';

/**
 * WHERE IS MY ORDER — WITH NO ACCOUNT.
 *
 * The phone and the reference together, and nothing back but a status.
 *
 * POST, NOT GET, ON PURPOSE. A phone number is personal data and a GET puts
 * it in the URL — which is the browser's history, the server's access log,
 * the referrer header of the next page and anything sitting between. The
 * shape of the request is the privacy decision here, not a comment about
 * one.
 *
 * AND EVERY FAILURE ANSWERS IDENTICALLY. A wrong reference, a wrong phone,
 * another shop's reference and a reference that never existed all get
 * `TRACKING_NOT_FOUND` with the same status. Any difference between them is
 * a way to ask «does this order exist» one guess at a time — which is how
 * somebody with a list of phone numbers finds out who bought what.
 */

interface Ctx {
  params: Promise<{ store: string }>;
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

/** Never a body; just two short strings. */
const MAX_BODY_BYTES = 2 * 1024;

const notFound = () =>
  NextResponse.json({ error: TRACKING_NOT_FOUND }, { status: 404, headers: CORS });

export async function POST(req: Request, ctx: Ctx) {
  try {
    const { store: slug } = await ctx.params;
    if (!/^[a-z0-9-]{2,60}$/.test(slug)) return notFound();

    /**
     * TWO LIMITS, AND THEY GUARD DIFFERENT THINGS.
     *
     * The IP limit stops one machine walking a list. The phone limit stops
     * the same number being probed from many machines for the reference
     * that goes with it — which is the attack that actually pays, because
     * the phone is the half somebody already has.
     */
    const ip = getClientIp(req);
    const byIp = rateLimit(`track_ip:${ip}`, 20, 10 * 60_000);
    if (!byIp.allowed) {
      return NextResponse.json(
        { error: `محاولات كثيرة جدًا. أعد المحاولة بعد ${byIp.retryAfterSec} ثانية` },
        { status: 429, headers: { ...CORS, 'Retry-After': String(byIp.retryAfterSec) } }
      );
    }

    const contentLength = parseInt(req.headers.get('content-length') || '0', 10);
    if (contentLength > MAX_BODY_BYTES) return notFound();

    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      return notFound();
    }

    const body = (raw ?? {}) as { phone?: unknown; orderNumber?: unknown };
    const phone = typeof body.phone === 'string' ? body.phone.trim().slice(0, 25) : '';
    const orderNumber = typeof body.orderNumber === 'string' ? body.orderNumber.trim().slice(0, 40) : '';
    if (!phone || !orderNumber) return notFound();

    const normalized = normalizePhoneNumber(phone);
    if (normalized.length < 7) return notFound();

    const byPhone = rateLimit(`track_phone:${normalized}`, 10, 10 * 60_000);
    if (!byPhone.allowed) {
      return NextResponse.json(
        { error: `محاولات كثيرة جدًا. أعد المحاولة بعد ${byPhone.retryAfterSec} ثانية` },
        { status: 429, headers: { ...CORS, 'Retry-After': String(byPhone.retryAfterSec) } }
      );
    }

    // A shop that is not open reads as absent here too — and it answers the
    // same sentence, so a closed storefront is not discoverable either.
    const store = await getStorefront(slug);
    if (!store) return notFound();

    /**
     * THE PAIR, IN THIS SHOP.
     *
     * The phone is matched through the customer record, which is where the
     * normalised number lives, and the store scope is on the order — so a
     * reference from another shop, even with the right phone, is not found.
     *
     * The select is the whole privacy rule: four fields, none of them
     * personal, and `trackingView` cannot return what it was never given.
     */
    const order = await db.order.findFirst({
      where: {
        companyId: store.companyId,
        storeId: store.id,
        orderNumber,
        customer: { phone: normalized },
      },
      select: {
        orderNumber: true,
        createdAt: true,
        shippingStatus: true,
        confirmationStatus: true,
        claimedById: true,
        regionId: true,
      },
    });
    if (!order) return notFound();

    // This governorate's measured delivery time, or nothing. Asked only for
    // an order still on its way — a finished order needs no estimate, and
    // this is a scan of delivered orders.
    let window = null;
    if (order.regionId) {
      const windows = await deliveryWindows({ companyId: store.companyId, storeId: store.id });
      window = windows.get(order.regionId) ?? null;
    }

    return NextResponse.json(trackingView(order, window), {
      headers: { ...CORS, 'Cache-Control': 'no-store' },
    });
  } catch (e) {
    console.error('POST /api/public/stores/[store]/track', e);
    return NextResponse.json({ error: 'تعذّر عرض حالة الطلب الآن' }, { status: 500, headers: CORS });
  }
}
