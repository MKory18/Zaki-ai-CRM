import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireContext } from '@/lib/geo-context';
import { orderRefFields } from '@/lib/order-ref';
import { resolveRegionId } from '@/lib/regions';
import { computeCod } from '@/lib/money';
import { parseOrderText, matchProduct, normalizeArabic, ParsedOrder } from '@/lib/order-parser';
import { normalizePhoneNumber } from '@/lib/phone';
import { logAudit } from '@/lib/audit';
import { createNotification } from '@/lib/notification';
import { apiError } from '@/lib/api-error';
import { requirePermission } from '@/lib/authorization';

/**
 * POST /api/orders/ai-intake
 * mode 1: { text, dryRun: true }  -> parse text, match product, return preview (no DB writes)
 * mode 2: { parsed, confirm: true } -> create customer + order from confirmed fields
 */

async function aiAssistedParse(text: string): Promise<ParsedOrder | null> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return null;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://salesflow.io',
        'X-Title': 'SALESFLOW Order Intake',
      },
      body: JSON.stringify({
        model: process.env.OPENROUTER_MODEL || 'meta-llama/llama-3.3-70b-instruct:free',
        messages: [
          {
            role: 'system',
            content: `You are an order-intake extraction engine for an Arabic e-commerce store.
Extract order fields from the user's free text and return ONLY valid JSON:
{"customerName":"","phone":"","governorate":"","address":"","productQuery":"","quantity":1,"price":null,"notes":"","source":""}
Rules: keep original Arabic text, quantity is a number, price is a number without currency symbols, source = page name. If a field is missing use "" (or null for price, 1 for quantity).`,
          },
          { role: 'user', content: text },
        ],
        response_format: { type: 'json_object' },
        temperature: 0,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (res.ok) {
      const json = await res.json();
      const content = json.choices?.[0]?.message?.content;
      if (content) {
        const parsed = JSON.parse(content);
        return {
          customerName: parsed.customerName || '',
          phone: parsed.phone || '',
          governorate: parsed.governorate || '',
          address: parsed.address || '',
          productQuery: parsed.productQuery || '',
          quantity: parseInt(parsed.quantity, 10) || 1,
          price: parsed.price != null ? Number(parsed.price) : null,
          notes: parsed.notes || '',
          source: parsed.source || '',
        };
      }
    }
  } catch (e) {
    console.warn('AI parse failed, using deterministic parser:', e);
  }
  return null;
}

export async function POST(req: Request) {
  try {
    const { user, companyId, storeId, countryId, country } = await requireContext();
    await requirePermission('orders.create');

    const body = await req.json();

    // ─── Mode 2: Confirm & Create ───
    if (body.confirm) {
      // Server-side Zod validation — the client-confirmed payload is never
      // trusted with raw values (same rules as POST /api/orders).
      const confirmSchema = z.object({
        customerName: z.string().trim().min(2).max(80),
        phone: z.string().trim().min(7).max(20),
        address: z.string().trim().max(200).optional().nullable(),
        governorate: z.string().trim().max(60).optional().nullable(),
        productId: z.string().min(10).max(64),
        quantity: z.coerce.number().int().min(1).max(999),
        finalPrice: z.coerce.number().min(0).max(100000),
        moderatorId: z.string().min(10).max(64).optional().nullable(),
        notes: z.string().trim().max(500).optional().nullable(),
        source: z.string().trim().max(40).optional().nullable(),
      });
      const check = confirmSchema.safeParse(body.parsed);
      if (!check.success) {
        return NextResponse.json(
          { error: check.error.issues[0]?.message || 'بيانات الطلب غير صالحة' },
          { status: 400 }
        );
      }
      const p = check.data;

      if (!p.customerName || !p.phone || !p.productId) {
        return NextResponse.json(
          { error: 'الاسم والرقم والمنتج مطلوبة' },
          { status: 400 }
        );
      }

      const normalizedPhone = normalizePhoneNumber(p.phone);
      let customer = await db.customer.findUnique({
        where: { companyId_phone: { companyId, phone: normalizedPhone } },
      });

      if (!customer) {
        customer = await db.customer.create({
          data: {
            companyId,
            fullName: p.customerName.trim(),
            phone: normalizedPhone,
            rawPhone: p.phone.trim(),
            address: p.address?.trim() || '',
            city: p.governorate?.trim() || '',
          },
        });
      }

      // Tenant-validate — products must belong to THIS company
      const product = await db.product.findFirst({
        where: { id: p.productId, companyId },
        include: { batches: { where: { quantityRemaining: { gt: 0 } }, orderBy: { productionDate: 'asc' }, take: 1 } },
      });
      if (!product) {
        return NextResponse.json({ error: 'المنتج غير موجود' }, { status: 404 });
      }

      const qty = p.quantity;
      // Same business rule as POST /orders: zero/absent price falls back to
      // the product's own base price — the client never dictates the price.
      const price = p.finalPrice || product.basePrice;
      const unitCost = product.batches[0]?.costPerUnit || 0;

      // Moderator assignment — must belong to THIS company (same rule as POST /orders)
      const assignedModeratorId = p.moderatorId || (user.role === 'MODERATOR' ? user.id : null);
      let moderatorCommission = 0;
      if (assignedModeratorId) {
        const mod = await db.user.findFirst({ where: { id: assignedModeratorId, companyId } });
        if (!mod) {
          return NextResponse.json({ error: 'الموديريتور غير موجود في شركتك' }, { status: 404 });
        }
        if (mod.commissionRate > 0) {
          moderatorCommission = Number(((price * mod.commissionRate) / 100).toFixed(2));
        }
      }

      const refs = await orderRefFields(db, companyId, country.orderPrefix);
      // ONE COD function (contract PART 5); no delivery fee at intake.
      const money = computeCod({
        lines: [{ quantity: qty, unitPrice: qty > 0 ? price / qty : price }],
        minorUnit: country.minorUnit,
      });

      // Bind the governorate written in the message to a real Region: the
      // delivery fee is keyed on it, so an order without one cannot be priced
      // or shipped.
      const resolvedRegionId = await resolveRegionId(db, countryId, p.governorate ?? customer.city);

      const order = await db.order.create({
        data: {
          companyId,
          countryId,
          storeId,
          regionId: resolvedRegionId,
          ...refs,
          customerId: customer.id,
          productId: product.id,
          quantity: qty,
          sellingPrice: price,
          shippingCost: 0,
          totalAmount: money.cod,
          currency: country.currencyCode,
        moderatorId: assignedModeratorId,
        moderatorCommission,
        estimatedCostOfGoods: Number((unitCost * qty).toFixed(2)),
        productNameSnapshot: product.name,
        productImageSnapshot: product.image || null,
        status: 'NEW',
          source: p.source?.trim() || 'AI Intake',
          customerNotes: p.notes?.trim() && p.notes !== '-' ? p.notes.trim() : null,
        },
      });

      // Order line — reservation and discount share live per line.
      await db.orderItem.create({
        data: {
          companyId,
          orderId: order.id,
          productId: product.id,
          productName: product.name,
          quantity: qty,
          unitPrice: money.subtotal / qty,
          lineTotal: money.lineTotals[0] ?? money.subtotal,
          addedById: user.id,
          addedStage: 'INTAKE',
        },
      });

      await db.customer.update({
        where: { id: customer.id },
        data: { totalOrders: { increment: 1 }, lastOrderDate: new Date(), firstOrderDate: customer.firstOrderDate || new Date() },
      });

      await db.orderActivity.create({
        data: {
          companyId,
          orderId: order.id,
          userId: user.id,
          action: 'ORDER_CREATED',
          newStatus: 'NEW',
          metadata: JSON.stringify({ source: order.source, intakeMethod: 'AI_PASTE', createdBy: user.name }),
        },
      });

      await logAudit({
        companyId,
        userId: user.id,
        action: 'ORDER_CREATED_AI_INTAKE',
        entity: 'Order',
        entityId: order.id,
        newData: order,
      });

      // Notify company managers — after commit, non-fatal
      try {
        await createNotification({
          companyId,
          userId: null,
          title: 'طلب جديد',
          message: `تم إنشاء طلب جديد #${order.orderNumber} عبر الذكاء الاصطناعي بواسطة ${user.name}.`,
          type: 'ORDER_NEW',
          link: '/orders',
        });
      } catch (e) {
        console.error('AI-intake notification failed (non-fatal):', e);
      }

      return NextResponse.json({ success: true, order });
    }

    // ─── Mode 1: Parse & Preview ───
    const text: string = body.text || '';
    if (!text.trim()) {
      return NextResponse.json({ error: 'الصق نص الطلب أولاً' }, { status: 400 });
    }

    // Try AI first, fallback to deterministic parser
    let parsed = await aiAssistedParse(text);
    let engine = 'ai';
    if (!parsed) {
      parsed = parseOrderText(text);
      engine = 'deterministic';
    }
    // Deterministic parser always re-checks to fill any AI gaps
    const deterministic = parseOrderText(text);
    if (engine === 'ai') {
      for (const key of Object.keys(deterministic) as Array<keyof ParsedOrder>) {
        const dv = deterministic[key];
        const av = parsed[key];
        if (
          (typeof dv === 'string' && !av && dv) ||
          (key === 'price' && (av === null || av === undefined) && dv !== null)
        ) {
          (parsed[key] as unknown) = dv;
        }
      }
    }

    // Match product from catalog
    const products = await db.product.findMany({
      where: { companyId },
      select: { id: true, name: true, sku: true },
    });
    const match = parsed.productQuery
      ? matchProduct(parsed.productQuery, products)
      : null;

    // Suggest price from matched product's offers
    let suggestedPrice: number | null = parsed.price;
    let suggestedOfferName: string | null = null;
    if (match) {
      const offers = await db.offer.findMany({
        where: { companyId, productId: match.id, status: 'ACTIVE' },
        orderBy: { quantity: 'asc' },
      });
      const qtyOffer = offers.find((o) => o.quantity === (parsed.quantity || 1)) || offers[0];
      if (qtyOffer && (parsed.price === null || parsed.price <= 0)) {
        suggestedPrice = qtyOffer.sellingPrice;
        suggestedOfferName = qtyOffer.name;
      } else if (qtyOffer) {
        suggestedOfferName = qtyOffer.name;
      }
    }

    // Duplicate customer check
    let existingCustomer = null;
    if (parsed.phone) {
      const normalizedPhone = normalizePhoneNumber(parsed.phone);
      existingCustomer = await db.customer.findUnique({
        where: { companyId_phone: { companyId, phone: normalizedPhone } },
        select: { fullName: true, totalOrders: true, city: true },
      });
    }

    return NextResponse.json({
      parsed,
      engine,
      matchedProduct: match,
      productMatchConfident: match ? match.score >= 16 : false,
      suggestedPrice,
      suggestedOfferName,
      existingCustomer,
    });
  } catch (error) {
    const { body, status } = apiError(error);
    return NextResponse.json(body, { status });
  }
}
