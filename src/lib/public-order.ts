import { db } from './db';
import { normalizePhoneNumber } from './phone';
import { orderRefFields } from './order-ref';
import { computeCod } from './money';
import { matchRegion } from './regions';
import { NEUTRAL_REFUSAL, isBlocked } from './blacklist';
import { rateLimit } from './rate-limit';
import { signAddonToken } from './landing-pages';
import {
  buildPublicOrderSchema,
  mapZodFieldErrors,
  ORDER_VALIDATION_ERROR_BODY,
} from './landing-order-schema';

/**
 * TAKING AN ORDER FROM A STRANGER.
 *
 * A landing page and a storefront are two doors into one shop. Everything
 * behind the door is identical — the same validation against the same
 * country, the same blacklist, the same duplicate guard, the same customer
 * record, the same ONE cod function, the same Order row. Only the doorway
 * differs: which page it was, what the order's source says, and which
 * counter goes up.
 *
 * So the intake lives here, once. A second copy would drift on the day one
 * of them gained a rule the other did not — and the rules here are the ones
 * that decide what a customer is charged and whether a blocked number gets
 * through.
 *
 * Nothing in the request is trusted. The price, the quantity, the product,
 * the company and the country are all derived on the server from the
 * surface; the visitor supplies a name, a phone, an address, a city, a
 * chosen offer id and a note, and nothing else is read.
 */

/** Where the order came in through. Resolved by the route, never by the browser. */
export interface SellingSurface {
  companyId: string;
  store: {
    id: string;
    countryId: string;
    country: { code: string; currencyCode: string; orderPrefix: string; minorUnit: number };
  };
  product: { id: string; name: string; image: string | null; basePrice: number };
  /** The landing page, when the door was one. */
  landingPage: { id: string; name: string; slug: string } | null;
  /** What the order records as its origin. */
  source: string;
  /** Scopes the one-order-per-phone guard to this door. */
  dedupeScope: string;
  /** Title and message of the manager's notification. */
  notice: { title: string; message: (orderNumber: string) => string };
}

export type IntakeResult =
  | { ok: true; body: Record<string, unknown> }
  | { ok: false; status: number; body: Record<string, unknown>; headers?: Record<string, string> };

/**
 * Create a real order from a public visitor.
 *
 * Returns a shaped result rather than a Response so the two routes keep
 * their own CORS and their own 404s, and so this stays testable without a
 * request object.
 */
export async function createPublicOrder(
  surface: SellingSurface,
  raw: unknown
): Promise<IntakeResult> {
  const { companyId, store, product } = surface;

  // ─── Validation, against THIS country ───
  // The phone format and the list of cities depend on the country the shop
  // sells into. A Jordanian store must not be validated against Syrian rules.
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
    // Safe Arabic field errors only — no Zod internals leak to the visitor.
    return {
      ok: false,
      status: 400,
      body: { ...ORDER_VALIDATION_ERROR_BODY, fieldErrors: mapZodFieldErrors(parsed.error) },
    };
  }
  const v = parsed.data;

  // Honeypot filled → bot. Generic rejection.
  if (v.website && v.website.length > 0) {
    return { ok: false, status: 400, body: { error: 'تعذر إرسال الطلب' } };
  }

  const normalizedPhone = normalizePhoneNumber(v.phone);
  if (normalizedPhone.length < 7 || normalizedPhone.length > 15) {
    return { ok: false, status: 400, body: { error: 'رقم الهاتف غير صالح' } };
  }

  // The chosen city is a real region of this country, so the order carries
  // its id — that is what the delivery-fee table is keyed on. Same matcher
  // every other intake path uses.
  const region = matchRegion(regions, v.city);

  // ─── Offer resolution (server-authoritative) ───
  // The offers belong to the PRODUCT: one bundle, one price, wherever it is
  // sold. quantity / freeQuantity / price all come from the row — a quantity
  // or a price sent by the browser is ignored.
  const productOffers = await db.offer.findMany({
    where: { companyId, productId: product.id, status: 'ACTIVE' },
    orderBy: [{ sortOrder: 'asc' }, { quantity: 'asc' }],
    select: { id: true, name: true, quantity: true, freeQuantity: true, sellingPrice: true },
  });

  let offer: { id: string; name: string; quantity: number; freeQuantity: number; price: number } | null = null;
  if (v.offerId) {
    const found = productOffers.find((o) => o.id === v.offerId);
    if (!found) {
      return {
        ok: false,
        status: 400,
        body: { ...ORDER_VALIDATION_ERROR_BODY, fieldErrors: { offerId: 'يرجى اختيار أحد العروض.' } },
      };
    }
    offer = { ...found, price: found.sellingPrice };
  } else if (productOffers.length > 0) {
    // Offers exist — an explicit selection is required.
    return {
      ok: false,
      status: 400,
      body: { ...ORDER_VALIDATION_ERROR_BODY, fieldErrors: { offerId: 'يرجى اختيار أحد العروض.' } },
    };
  }

  const price = offer ? offer.price : product.basePrice; // server-side — never from the browser
  const qty = offer ? offer.quantity : 1;
  const freeQty = offer ? offer.freeQuantity : 0;

  // ─── Blacklist, company-wide ───
  // The message says nothing: telling somebody they are blacklisted invites
  // them to try another number, and tells them which one is burned. The RAW
  // phone as typed — normalizing first would drop the leading + that marks
  // an international form, and a block stored from "+963…" would then miss a
  // local "0…", which is the exact way around a block.
  if (await isBlocked(db, companyId, v.phone)) {
    return { ok: false, status: 400, body: { error: NEUTRAL_REFUSAL } };
  }

  // ─── Duplicate-submission protection (per phone, per door) ───
  const dup = rateLimit(`pub_order_dup:${surface.dedupeScope}:${normalizedPhone}`, 1, 5 * 60_000);
  if (!dup.allowed) {
    return {
      ok: false,
      status: 429,
      body: { error: 'تم استلام طلبك بالفعل. سنتواصل معك قريبًا' },
      headers: { 'Retry-After': String(dup.retryAfterSec) },
    };
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
    } catch (e: unknown) {
      // Two visitors submitting the same number at once: the loser reads the
      // row the winner created rather than failing the order.
      if ((e as { code?: string })?.code === 'P2002') {
        customer = await db.customer.findUnique({
          where: { companyId_phone: { companyId, phone: normalizedPhone } },
        });
      }
      if (!customer) throw e;
    }
  }

  // ─── Create the REAL order (same Order model, same defaults) ───
  const unitCost = 0; // public orders have no batch context; finance finalizes later

  // ONE COD function (contract PART 5). The offer price is the total for its
  // quantity; free units are real lines at zero price, so they never enter
  // the money maths — only stock and COGS.
  const money = computeCod({
    lines: [{ quantity: qty, unitPrice: qty > 0 ? price / qty : price, freeQuantity: freeQty }],
    minorUnit: store.country.minorUnit,
  });
  const totalAmount = money.cod;

  const order = await db.$transaction(async (tx) => {
    let created: Awaited<ReturnType<typeof tx.order.create>> | null = null;
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
            source: surface.source,
            landingPageId: surface.landingPage?.id ?? null,
            offerId: offer?.id ?? null,
            customerNotes: v.notes || null,
            internalNotes: null,
          },
        });
        break;
      } catch (e: unknown) {
        if ((e as { code?: string })?.code === 'P2002' && attempt < 4) continue;
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
          source: surface.source,
          landingPage: surface.landingPage?.name ?? null,
          landingPageSlug: surface.landingPage?.slug ?? null,
          offer: offer
            ? { name: offer.name, quantity: offer.quantity, freeQuantity: offer.freeQuantity, price: offer.price }
            : { fallback: 'basePrice', price: product.basePrice },
          createdBy: 'public visitor',
        }),
      },
    });

    if (surface.landingPage) {
      await tx.landingPage.update({
        where: { id: surface.landingPage.id },
        data: { ordersCount: { increment: 1 } },
      });
    }

    return created;
  });

  // Non-fatal manager notification
  try {
    await db.notification.create({
      data: {
        companyId,
        userId: null,
        title: surface.notice.title,
        message: surface.notice.message(order.orderNumber),
        type: 'ORDER_NEW',
        link: '/orders',
      },
    });
  } catch (e) {
    console.error('Public order notification failed (non-fatal):', e);
  }

  // Short-lived add-on capability token for the success screen (upsells).
  // Stateless (no DB), order-scoped, 30-minute TTL.
  let addonToken: string | null = null;
  try {
    addonToken = await signAddonToken({ orderId: order.id, orderNumber: order.orderNumber });
  } catch (e) {
    console.error('Addon token signing failed (non-fatal):', e);
  }

  // Server-provided upsells for the success screen. A storefront has no
  // recommendation list of its own yet, so it simply offers none — better
  // than inventing a suggestion nobody configured.
  const recommendations = surface.landingPage
    ? await db.landingPageRecommendation.findMany({
        where: { landingPageId: surface.landingPage.id, isActive: true, product: { status: 'ACTIVE' } },
        orderBy: { sortOrder: 'asc' },
        select: { id: true, product: { select: { id: true, name: true, basePrice: true, image: true } } },
      })
    : [];

  return {
    ok: true,
    body: {
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
  };
}
