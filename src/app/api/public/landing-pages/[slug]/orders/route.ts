import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { normalizePhoneNumber } from '@/lib/phone';
import { orderRefFields } from '@/lib/order-ref';
import { computeCod } from '@/lib/money';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import {
  LANDING_PAGE_SOURCE,
  signAddonToken,
} from '@/lib/landing-pages';
import {
  buildPublicOrderSchema,
  mapZodFieldErrors,
  ORDER_VALIDATION_ERROR_BODY,
} from '@/lib/landing-order-schema';

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

// Validation lives in the shared server-side module:
// src/lib/landing-order-schema.ts (Arabic field errors, Syrian phone/city
// validation). No raw Zod messages ever reach the visitor.

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

    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      return NextResponse.json({ error: 'بيانات غير صالحة' }, { status: 400, headers: CORS });
    }

    // ─── Resolve the landing page → company → product (server-side only) ───
    // This comes BEFORE validation: the phone format and the list of cities
    // depend on the country this page sells into. A Jordanian store must not
    // be validated against Syrian rules.
    const lp = await db.landingPage.findFirst({
      where: { slug, isPublished: true },
      include: {
        company: { select: { id: true, currency: true } },
        product: { select: { id: true, basePrice: true, name: true, image: true } },
        store: {
          select: {
            id: true,
            countryId: true,
            country: { select: { code: true, currencyCode: true, orderPrefix: true, minorUnit: true } },
          },
        },
      },
    });
    if (!lp) return NextResponse.json({ error: 'Not found' }, { status: 404, headers: CORS });
    // Every order must land in a store; a page without one cannot take orders.
    if (!lp.store) {
      return NextResponse.json({ error: 'هذه الصفحة لا تقبل الطلبات حاليًا' }, { status: 409, headers: CORS });
    }
    const store = lp.store;
    if (!lp.productId || !lp.product) {
      return NextResponse.json({ error: 'هذه الصفحة لا تقبل الطلبات حاليًا' }, { status: 409, headers: CORS });
    }

    // ─── Zod validation, against THIS country ───
    const regions = await db.region.findMany({
      where: { countryId: store.countryId, isActive: true },
      select: { id: true, name: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    const parsed = buildPublicOrderSchema({
      countryCode: store.country.code,
      regions: regions.map((r) => r.name),
    }).safeParse(raw);
    if (!parsed.success) {
      // Safe Arabic field errors only — no Zod internals leak to the visitor
      return NextResponse.json(
        { ...ORDER_VALIDATION_ERROR_BODY, fieldErrors: mapZodFieldErrors(parsed.error) },
        { status: 400, headers: CORS }
      );
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

    // The chosen city is a real region of this country, so the order carries
    // its id — that is what the delivery-fee table is keyed on.
    const region = regions.find(
      (r) => r.name.trim().toLocaleLowerCase('ar') === v.city.trim().toLocaleLowerCase('ar')
    );

    const companyId = lp.company.id; // server-derived — NEVER from the browser
    const product = lp.product;

    // ─── Offer resolution (server-authoritative) ───
    // If the client sends an offerId it MUST belong to THIS landing page;
    // quantity / freeQuantity / price all come from the DB offer — any
    // client-sent quantity/price is ignored by the schema design.
    // Pages WITHOUT offers fall back to the base product price (qty 1).
    let offer = null as
      | { id: string; name: string; quantity: number; freeQuantity: number; price: number }
      | null;
    if (v.offerId) {
      const found = await db.landingPageOffer.findFirst({
        where: { id: v.offerId, landingPageId: lp.id, isActive: true },
      });
      if (!found) {
        return NextResponse.json(
          {
            ...ORDER_VALIDATION_ERROR_BODY,
            fieldErrors: { offerId: 'يرجى اختيار أحد العروض.' },
          },
          { status: 400, headers: CORS }
        );
      }
      offer = found;
    } else {
      const offerCount = await db.landingPageOffer.count({ where: { landingPageId: lp.id, isActive: true } });
      if (offerCount > 0) {
        // The page HAS offers — an explicit selection is required
        return NextResponse.json(
          {
            ...ORDER_VALIDATION_ERROR_BODY,
            fieldErrors: { offerId: 'يرجى اختيار أحد العروض.' },
          },
          { status: 400, headers: CORS }
        );
      }
    }
    const price = offer ? offer.price : product.basePrice; // server-side price — never from the browser
    const qty = offer ? offer.quantity : 1;
    const freeQty = offer ? offer.freeQuantity : 0;

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

    // ONE COD function (contract PART 5). The offer price is the total for
    // its quantity; free units are real lines at zero price, so they never
    // enter the money maths — only stock and COGS.
    const money = computeCod({
      lines: [{ quantity: qty, unitPrice: qty > 0 ? price / qty : price, freeQuantity: freeQty }],
      minorUnit: store.country.minorUnit,
    });
    const totalAmount = money.cod;

    const order = await db.$transaction(async (tx) => {
      let created: any = null;
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          const refs = await orderRefFields(tx, companyId, store.country.orderPrefix, attempt);
          created = await tx.order.create({
            data: {
              companyId,
              countryId: store.countryId,
              storeId: store.id,
              regionId: region?.id ?? null,
              ...refs,
              customerId: customer!.id,
              productId: product.id,
              quantity: qty,
              freeQuantity: freeQty,
              sellingPrice: price,
              shippingCost: 0,
              totalAmount,
              currency: store.country.currencyCode,
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
              landingPageOfferId: offer?.id ?? null,
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

      // Order line, gift units included: they consume stock and show in COGS.
      await tx.orderItem.create({
        data: {
          companyId,
          orderId: created.id,
          productId: product.id,
          productName: product.name,
          quantity: qty,
          freeQuantity: freeQty,
          unitPrice: money.subtotal / qty,
          lineTotal: money.lineTotals[0] ?? money.subtotal,
          addedStage: 'INTAKE',
        },
      });

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
            offer: offer
              ? { name: offer.name, quantity: offer.quantity, freeQuantity: offer.freeQuantity, price: offer.price }
              : { fallback: 'basePrice', price: product.basePrice },
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

    // Short-lived add-on capability token for the success screen (upsells).
    // Stateless (no DB), LP+order scoped, 30-minute TTL.
    let addonToken: string | null = null;
    try {
      addonToken = await signAddonToken({ orderId: order.id, orderNumber: order.orderNumber });
    } catch (e) {
      console.error('Addon token signing failed (non-fatal):', e);
    }

    // Server-provided upsells for the success screen (active recommendations
    // of THIS landing page, with DB prices — client never chooses product/price)
    const recommendations = await db.landingPageRecommendation.findMany({
      where: { landingPageId: lp.id, isActive: true, product: { status: 'ACTIVE' } },
      orderBy: { sortOrder: 'asc' },
      select: {
        id: true,
        product: { select: { id: true, name: true, basePrice: true, image: true } },
      },
    });

    return NextResponse.json(
      {
        success: true,
        orderNumber: order.orderNumber,
        addonToken,
        // Server-authoritative amounts — the ONLY source for Purchase
        // conversion tracking (client/browser values are never trusted).
        total: Number(order.totalAmount),
        currency: order.currency,
        recommendations: recommendations.map((r) => ({
          id: r.id,
          name: r.product?.name || null,
          price: r.product?.basePrice ?? 0,
          image: r.product?.image || null,
        })),
      },
      { headers: CORS }
    );
  } catch (error) {
    console.error('Public landing-page order failed:', error);
    return NextResponse.json({ error: 'حدث خطأ داخلي' }, { status: 500, headers: CORS });
  }
}