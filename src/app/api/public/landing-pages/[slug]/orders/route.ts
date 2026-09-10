import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { normalizePhoneNumber } from '@/lib/phone';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { LANDING_PAGE_SOURCE, LANDING_PAGE_MIN_QTY, LANDING_PAGE_MAX_QTY } from '@/lib/landing-pages';

interface Ctx {
  params: Promise<{ slug: string }>;
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

const MAX_BODY_BYTES = 10 * 1024; // 10 KB hard request-size limit

// Zod validation — the schema intentionally has NO fields for productId,
// price, companyId, userId, status, moderatorId… anything a browser sends
// beyond the listed fields is ignored (not just unvalidated).
const publicOrderSchema = z.object({
  full_name: z.string().trim().min(2).max(80),
  phone: z
    .string()
    .trim()
    .min(7)
    .max(20)
    .refine((v) => /^[+0-9()\s-]+$/.test(v), 'رقم الهاتف غير صالح'),
  address: z.string().trim().min(3).max(200),
  city: z.string().trim().min(2).max(60),
  quantity: z.coerce.number().int().min(LANDING_PAGE_MIN_QTY).max(LANDING_PAGE_MAX_QTY).default(1),
  notes: z.string().trim().max(500).optional().default(''),
  // Spam protections (checked below, not passed to the DB)
  website: z.string().max(0, 'Spam detected').optional().default(''),
  ts: z.string().max(20).optional().default(''),
});

export async function POST(req: Request, ctx: Ctx) {
  try {
    const { slug } = await ctx.params;
    if (!/^[a-z0-9-]{2,60}$/.test(slug)) {
      return NextResponse.json({ error: 'Not found' }, { status: 404, headers: CORS });
    }

    // ─── Rate limiting ───
    const ip = getClientIp(req);
    const perIp = rateLimit(`lp_order:${ip}`, 8, 10 * 60_000);
    if (!perIp.allowed) {
      return NextResponse.json(
        { error: `محاولات كثيرة جدًا. أعد المحاولة بعد ${perIp.retryAfterSec} ثانية` },
        { status: 429, headers: { ...CORS, 'Retry-After': String(perIp.retryAfterSec) } }
      );
    }
    const perSlug = rateLimit(`lp_order_slug:${slug}`, 60, 60_000);
    if (!perSlug.allowed) {
      return NextResponse.json({ error: 'محاولات كثيرة جدًا' }, { status: 429, headers: CORS });
    }

    // ─── Request size limit (defense in depth beyond Next's own limits) ───
    const contentLength = parseInt(req.headers.get('content-length') || '0', 10);
    if (contentLength > MAX_BODY_BYTES) {
      return NextResponse.json({ error: 'البيانات كبيرة جدًا' }, { status: 413, headers: CORS });
    }

    // ─── Origin validation (soft): sandboxed iframes send Origin: null, so an
    // Origin header that IS present and mismatches the host is suspicious. ───
    const origin = req.headers.get('origin');
    if (origin && origin !== 'null') {
      try {
        const o = new URL(origin);
        const host = req.headers.get('host');
        if (host && o.host !== host) {
          return NextResponse.json({ error: 'طلب غير مسموح' }, { status: 403, headers: CORS });
        }
      } catch {
        return NextResponse.json({ error: 'طلب غير مسموح' }, { status: 403, headers: CORS });
      }
    }

    // ─── Zod validation ───
    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      return NextResponse.json({ error: 'بيانات غير صالحة' }, { status: 400, headers: CORS });
    }
    const parsed = publicOrderSchema.safeParse(raw);
    if (!parsed.success) {
      const msg = parsed.error.issues[0]?.message || 'بيانات الطلب غير صالحة';
      return NextResponse.json({ error: msg }, { status: 400, headers: CORS });
    }
    const v = parsed.data;

    // Honeypot filled → bot. Generic rejection.
    if (v.website && v.website.length > 0) {
      return NextResponse.json({ error: 'تعذر إرسال الطلب' }, { status: 400, headers: CORS });
    }

    const normalizedPhone = normalizePhoneNumber(v.phone);
    if (normalizedPhone.length < 7 || normalizedPhone.length > 15) {
      return NextResponse.json({ error: 'رقم الهاتف غير صالح' }, { status: 400, headers: CORS });
    }

    // ─── Resolve the landing page → company → product (server-side only) ───
    const lp = await db.landingPage.findFirst({
      where: { slug, isPublished: true },
      include: {
        company: { select: { id: true, currency: true } },
        product: { select: { id: true, basePrice: true, name: true, image: true } },
      },
    });
    if (!lp) return NextResponse.json({ error: 'Not found' }, { status: 404, headers: CORS });
    if (!lp.productId || !lp.product) {
      return NextResponse.json({ error: 'هذه الصفحة لا تقبل الطلبات حاليًا' }, { status: 409, headers: CORS });
    }

    const companyId = lp.company.id; // server-derived — NEVER from the browser
    const product = lp.product;
    const price = product.basePrice; // server-side price — client price ignored by schema design
    const qty = v.quantity;

    // ─── Duplicate-submission protection (per phone, per page) ───
    const dup = rateLimit(`lp_order_dup:${lp.id}:${normalizedPhone}`, 1, 5 * 60_000);
    if (!dup.allowed) {
      return NextResponse.json(
        { error: 'تم استلام طلبك بالفعل. سنتواصل معك قريبًا' },
        { status: 429, headers: { ...CORS, 'Retry-After': String(dup.retryAfterSec) } }
      );
    }

    // ─── Customer upsert (same system as manual orders) ───
    let customer = await db.customer.findUnique({
      where: { companyId_phone: { companyId, phone: normalizedPhone } },
    });
    if (!customer) {
      try {
        customer = await db.customer.create({
          data: {
            companyId,
            fullName: v.full_name,
            phone: normalizedPhone,
            rawPhone: v.phone,
            address: v.address,
            city: v.city,
            notes: v.notes || null,
            totalOrders: 0,
          },
        });
      } catch (e: any) {
        if (e?.code === 'P2002') {
          customer = await db.customer.findUnique({
            where: { companyId_phone: { companyId, phone: normalizedPhone } },
          });
        }
        if (!customer) throw e;
      }
    }

    // ─── Create the REAL order (same Order model, same defaults) ───
    const unitCost = 0; // public orders have no batch context; finance finalizes later
    const totalAmount = Number((price * qty).toFixed(2));

    const order = await db.$transaction(async (tx) => {
      let created: any = null;
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          const count = await tx.order.count({ where: { companyId } });
          const orderNumber = `ORD-${new Date().getFullYear()}-${String(count + 1 + attempt).padStart(4, '0')}`;
          created = await tx.order.create({
            data: {
              companyId,
              orderNumber,
              customerId: customer!.id,
              productId: product.id,
              quantity: qty,
              sellingPrice: price,
              shippingCost: 0,
              totalAmount,
              currency: lp.company.currency || 'USD',
              moderatorId: null, // anonymous source — no user may be assigned from the browser
              moderatorCommission: 0,
              estimatedCostOfGoods: Number((unitCost * qty).toFixed(2)),
              productNameSnapshot: product.name,
              productImageSnapshot: product.image || null,
              status: 'NEW',
              confirmationStatus: 'NEW',
              shippingStatus: 'NOT_READY',
              settlementStatus: 'NOT_APPLICABLE',
              assignedToId: null,
              claimedById: null,
              currentOwnerId: null,
              signatureStatus: 'UNSIGNED',
              version: 1,
              source: LANDING_PAGE_SOURCE,
              landingPageId: lp.id,
              customerNotes: v.notes || null,
              internalNotes: null,
            },
          });
          break;
        } catch (e: any) {
          if (e?.code === 'P2002' && attempt < 4) continue;
          throw e;
        }
      }
      if (!created) throw new Error('Failed to generate a unique order number');

      await tx.customer.update({
        where: { id: customer!.id },
        data: {
          totalOrders: { increment: 1 },
          lastOrderDate: new Date(),
          firstOrderDate: customer!.firstOrderDate || new Date(),
        },
      });

      await tx.orderActivity.create({
        data: {
          companyId,
          orderId: created.id,
          userId: null, // anonymous visitor — no user to attribute
          action: 'ORDER_CREATED',
          newStatus: 'NEW',
          metadata: JSON.stringify({
            source: LANDING_PAGE_SOURCE,
            landingPage: lp.name,
            landingPageSlug: lp.slug,
            createdBy: 'Landing Page (public visitor)',
          }),
        },
      });

      await tx.landingPage.update({
        where: { id: lp.id },
        data: { ordersCount: { increment: 1 } },
      });

      return created;
    });

    // Non-fatal manager notification
    try {
      await db.notification.create({
        data: {
          companyId,
          userId: null,
          title: 'طلب جديد من صفحة هبوط',
          message: `طلب جديد #${order.orderNumber} من صفحة الهبوط "${lp.name}" (${lp.slug}).`,
          type: 'ORDER_NEW',
          link: '/orders',
        },
      });
    } catch (e) {
      console.error('Landing-page order notification failed (non-fatal):', e);
    }

    return NextResponse.json(
      { success: true, orderNumber: order.orderNumber },
      { headers: CORS }
    );
  } catch (error) {
    console.error('Public landing-page order failed:', error);
    return NextResponse.json({ error: 'حدث خطأ داخلي' }, { status: 500, headers: CORS });
  }
}