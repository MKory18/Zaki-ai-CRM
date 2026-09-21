import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireContext } from '@/lib/geo-context';
import { CORE_STATES, deriveCoreState, getZone, whereForState, type CoreState, type StateSource } from '@/lib/order-state';
import { orderRefFields } from '@/lib/order-ref';
import { computeCod } from '@/lib/money';
import { productCosts } from '@/lib/product-cost';
import { normalizePhoneNumber } from '@/lib/phone';
import { isValidPhoneFor, phoneErrorFor } from '@/lib/phone-rules';
import { activeBlock } from '@/lib/blacklist';
import { logAudit } from '@/lib/audit';
import { applyQueueFilter } from '@/lib/rbac';
import { createNotification } from '@/lib/notification';
import { apiError } from '@/lib/api-error';
import { requirePermission, getPermissionScope } from '@/lib/authorization';
import { zodMessage } from '@/lib/zod-message';

export async function GET(req: Request) {
  try {
    const { user, companyId, storeId, countryId, country } = await requireContext();

    // Explicit canonical gate — orders.view scope decides order visibility
    if (!getPermissionScope(user, 'orders.view')) {
      return NextResponse.json({ error: 'Forbidden: missing required permission orders.view' }, { status: 403 });
    }
    const { searchParams } = new URL(req.url);

    const search = searchParams.get('q')?.trim();
    const status = searchParams.get('status')?.trim();
    const productId = searchParams.get('productId')?.trim();
    const moderatorId = searchParams.get('moderatorId')?.trim();
    const courierId = searchParams.get('courierId')?.trim();
    const from = searchParams.get('from')?.trim();
    const to = searchParams.get('to')?.trim();
    const lateDays = searchParams.get('lateDays')?.trim();
    const regionId = searchParams.get('regionId')?.trim();
    const page = parseInt(searchParams.get('page') || '1', 10);
    // Cap page size (hard server-side limit) with a NaN guard
    const parsedLimit = parseInt(searchParams.get('limit') || '25', 10);
    // Twenty-five reads well; a batch being printed or exported needs all of
    // it. The ceiling is what one screen can render without stalling, and the
    // response says the real total either way, so the count never lies.
    const limit = Math.min(Number.isNaN(parsedLimit) ? 25 : parsedLimit, 500);

    const whereClause: any = { companyId, storeId };

    // Explicit moderatorId filter (used by admin dashboards) — RBAC still applies below
    if (moderatorId && moderatorId !== 'all') {
      whereClause.moderatorId = moderatorId;
    }

    // Filter by the SAME state the table labels each row with. The legacy
    // `status` column drifts from confirmation/shipping status, so filtering
    // on it returned rows the screen was calling something else.
    if (status && status !== 'all') {
      if (!CORE_STATES.includes(status as CoreState)) {
        return NextResponse.json({ error: `حالة غير معروفة: ${status}` }, { status: 400 });
      }
      const stateWhere = whereForState(status as CoreState);
      // A state nothing can currently be in returns nothing, rather than
      // silently returning everything.
      whereClause.AND = [...(whereClause.AND ?? []), stateWhere ?? { id: '' }];
    }

    if (regionId && regionId !== 'all') {
      whereClause.regionId = regionId;
    }

    // Which courier is carrying it — 'none' finds the ones nobody has taken.
    if (courierId && courierId !== 'all') {
      whereClause.deliveryProviderId = courierId === 'none' ? null : courierId;
    }

    if (productId && productId !== 'all') {
      whereClause.productId = productId;
    }

    // Created between two dates, inclusive of the whole closing day.
    if (from || to) {
      whereClause.createdAt = {};
      if (from) whereClause.createdAt.gte = new Date(`${from}T00:00:00.000Z`);
      if (to) whereClause.createdAt.lte = new Date(`${to}T23:59:59.999Z`);
    }

    // Orders still open after N days. "Late" means nothing has closed them —
    // a delivered order from last year is not late, it is finished — so the
    // closed states are excluded rather than the date alone being tested.
    if (lateDays) {
      const days = Number(lateDays);
      if (!Number.isFinite(days) || days < 1 || days > 365) {
        return NextResponse.json({ error: 'عدد أيام غير صالح' }, { status: 400 });
      }
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      whereClause.AND = [
        ...(whereClause.AND ?? []),
        { createdAt: { lte: cutoff } },
        { shippingStatus: { notIn: ['DELIVERED', 'PARTIALLY_DELIVERED', 'RETURNED', 'CANCELLED'] } },
        { confirmationStatus: { notIn: ['CANCELLED', 'REJECTED'] } },
      ];
    }

    // Source filter (Manual, Facebook Ads, WhatsApp, Landing Page, ...)
    const source = searchParams.get('source')?.trim();
    if (source && source !== 'all') {
      whereClause.source = source;
    }

    if (search) {
      const normalizedSearch = normalizePhoneNumber(search);
      whereClause.OR = [
        { orderNumber: { contains: search } },
        { customer: { fullName: { contains: search } } },
        { customer: { phone: { contains: normalizedSearch || search } } },
        { customer: { rawPhone: { contains: search } } },
      ];
    }

    // ─── Role-based visibility + workflow queues (backend-enforced) ───
    // applyQueueFilter enforces per-role visibility envelopes; never trust the
    // requested queue blindly — the server decides which queues a role may use.
    const queue = searchParams.get('queue');
    const visibleWhere = applyQueueFilter(user, whereClause, queue);

    const [total, orders] = await Promise.all([
      db.order.count({ where: visibleWhere }),
      db.order.findMany({
        where: visibleWhere,
        include: {
          customer: {
            select: {
              id: true, fullName: true, phone: true, rawPhone: true, city: true, address: true,
              // Repeat customer: the list shows a counter that opens the history.
              totalOrders: true, deliveredOrders: true, cancelledOrders: true,
            },
          },
          product: {
            select: { id: true, name: true, sku: true, image: true },
          },
          offer: {
            select: { id: true, name: true, quantity: true, sellingPrice: true },
          },
          moderator: {
            select: { id: true, name: true, email: true },
          },
          // Who is carrying it, and where it is going — both are read on the
          // list, so neither needs opening the order to see.
          region: { select: { id: true, name: true } },
          deliveryProvider: { select: { id: true, name: true, kind: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return NextResponse.json({
      // The ONE state the whole app shows, derived from the stored fields —
      // the legacy `status` column is kept for compatibility but never drives
      // a screen, because it drifts from confirmation/shipping status.
      orders: orders.map((o) => ({
        ...o,
        state: deriveCoreState(o as unknown as StateSource),
        zone: getZone(deriveCoreState(o as unknown as StateSource)),
        previousOrders: Math.max(0, (o.customer.totalOrders ?? 1) - 1),
      })),
      // The store's own currency. The list used to print a hard-coded $ on
      // every row, which read as dollars on a Jordanian store.
      currency: { code: country.currencyCode, minorUnit: country.minorUnit },
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
      });
  } catch (error) {
    const { body, status } = apiError(error);
    return NextResponse.json(body, { status });
  }
}

export async function POST(req: Request) {
  try {
    const { user, companyId, storeId, countryId, country } = await requireContext();
    await requirePermission('orders.create');

    const body = await req.json();

    // Server-side Zod validation — never trust client input
    const orderSchema = z.object({
      customerName: z.string().trim().min(2).max(80),
      customerPhone: z.string().trim().min(7).max(20),
      customerAltPhone: z.string().trim().max(20).optional().nullable(),
      customerAddress: z.string().trim().max(200).optional().nullable(),
      customerCity: z.string().trim().max(60).optional().nullable(),
      // Region of THIS country; it drives the delivery fee and the late threshold.
      regionId: z.string().uuid().optional().nullable(),
      // One order, one or more products. The single-product fields below are
      // the shorthand for a single line and every existing caller — landing
      // pages, Telegram, AI intake — keeps using them unchanged.
      items: z
        .array(
          z.object({
            productId: z.string().min(10).max(64),
            offerId: z.string().min(10).max(64).optional().nullable(),
            quantity: z.coerce.number().int().min(1).max(999),
            unitPrice: z.coerce.number().min(0).max(100000),
          })
        )
        .min(1)
        .max(20)
        .optional(),
      productId: z.string().min(10).max(64).optional(),
      offerId: z.string().min(10).max(64).optional().nullable(),
      quantity: z.coerce.number().int().min(1).max(999).optional(),
      sellingPrice: z.coerce.number().min(0).max(100000).optional(),
      shippingCost: z.coerce.number().min(0).max(1000).optional(),
      source: z.string().trim().max(60).optional(),
      // The channel this came through. Its name is written into `source` too,
      // so the order keeps saying where it came from even if the channel is
      // later renamed or retired.
      channelId: z.string().uuid().optional().nullable(),
      moderatorId: z.string().max(64).optional().nullable(),
      customerNotes: z.string().trim().max(500).optional().nullable(),
      internalNotes: z.string().trim().max(500).optional().nullable(),
    });
    const parsed = orderSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: zodMessage(parsed.error) },
        { status: 400 }
      );
    }
    const v = parsed.data;

    const {
      customerName,
      customerPhone,
      customerAltPhone,
      customerAddress,
      customerCity,
      regionId,
      productId,
      offerId,
      quantity,
      sellingPrice,
      shippingCost,
      source,
      channelId,
      moderatorId,
      customerNotes,
      internalNotes,
    } = v;

    // The channel, if one was named: it must be ours, and its name becomes
    // the order's written source.
    let channel: { id: string; name: string } | null = null;
    if (channelId) {
      channel = await db.orderChannel.findFirst({
        where: { id: channelId, companyId, isActive: true },
        select: { id: true, name: true },
      });
      if (!channel) {
        return NextResponse.json({ error: 'القناة غير موجودة أو موقوفة' }, { status: 400 });
      }
    }

    // The order's lines, however they were sent: an explicit array, or the
    // single-product shorthand. Everything below works on this one list, so
    // a one-line order and a five-line one take exactly the same path.
    const requestedLines =
      v.items && v.items.length
        ? v.items
        : productId
          ? [{ productId, offerId: offerId ?? null, quantity: quantity ?? 1, unitPrice: sellingPrice ?? 0 }]
          : [];

    if (!customerName || !customerPhone || requestedLines.length === 0) {
      return NextResponse.json(
        { error: 'اسم العميل ورقم الهاتف ومنتج واحد على الأقل مطلوبة' },
        { status: 400 }
      );
    }

    // The same phone rule the public landing page applies. Without it the
    // CRM accepted any 7 characters, which is where most "رقم خاطئ" issues
    // were born: nothing refused the number until someone tried to call it.
    if (!isValidPhoneFor(country.code, customerPhone)) {
      return NextResponse.json(
        { error: phoneErrorFor(country.code), code: 'INVALID_PHONE', field: 'customerPhone' },
        { status: 400 }
      );
    }
    if (customerAltPhone && !isValidPhoneFor(country.code, customerAltPhone)) {
      return NextResponse.json(
        { error: phoneErrorFor(country.code), code: 'INVALID_PHONE', field: 'customerAltPhone' },
        { status: 400 }
      );
    }

    // 1. Duplicate check / Customer creation (reuse on a P2002 race)
    const normalizedPhone = normalizePhoneNumber(customerPhone);

    // ─── Blacklist, company-wide ───
    // Staff get the real reason: they are the ones who decide whether to
    // release it, and a silent refusal here would just look like a bug.
    const block = await activeBlock(db, companyId, customerPhone);
    if (block) {
      return NextResponse.json(
        {
          error: `هذا الرقم محظور: ${block.reason}`,
          code: 'CUSTOMER_BLOCKED',
          blockId: block.id,
        },
        { status: 409 }
      );
    }
    let customer = await db.customer.findUnique({
      where: {
        companyId_phone: {
          companyId,
          phone: normalizedPhone,
        },
      },
    });

    if (!customer) {
      try {
        customer = await db.customer.create({
          data: {
            companyId,
            fullName: customerName.trim(),
            phone: normalizedPhone,
            rawPhone: customerPhone.trim(),
            altPhone: customerAltPhone?.trim() || null,
            address: customerAddress?.trim() || '',
            city: customerCity?.trim() || 'Cairo',
            totalOrders: 0,
          },
        });
      } catch (e: any) {
        // Concurrent create with the same phone → reuse the winner
        if (e?.code === 'P2002') {
          customer = await db.customer.findUnique({
            where: { companyId_phone: { companyId, phone: normalizedPhone } },
          });
        }
        if (!customer) throw e;
      }
    }

    // 2. Every product the order names, in one query — tenant-validated, so
    // an order can never reference another company's product.
    const productIds = [...new Set(requestedLines.map((l) => l.productId))];
    const productRows = await db.product.findMany({
      where: { id: { in: productIds }, companyId },
      include: {
        batches: { where: { companyId }, orderBy: { productionDate: 'desc' }, take: 1 },
      },
    });
    if (productRows.length !== productIds.length) {
      return NextResponse.json({ error: 'أحد المنتجات غير موجود في شركتك' }, { status: 404 });
    }
    const productById = new Map(productRows.map((p) => [p.id, p]));
    // The first line names the order: its product is the one the list shows
    // and the one per-product reporting groups by.
    const product = productById.get(requestedLines[0].productId)!;

    // The region must belong to the selected country — a Syrian governorate
    // on a Jordanian store would have no fee row and could never ship.
    let resolvedRegionId: string | null = null;
    if (regionId) {
      const region = await db.region.findFirst({ where: { id: regionId, countryId }, select: { id: true } });
      if (!region) {
        return NextResponse.json({ error: 'المحافظة لا تتبع بلد المتجر الحالي' }, { status: 400 });
      }
      resolvedRegionId = region.id;
    }

    const qty = quantity || 1;
    // Legacy semantics: a line's unitPrice is the TOTAL for that line's
    // quantity, which is how every existing caller sends it.
    const shipCost = shippingCost || 0;

    // Whether the price already contains delivery is the STORE's pricing
    // policy; an offer may override it upward for its own bundle. Reading it
    // from the offer alone meant a direct order — the commonest kind — was
    // always priced as price + fee, even on a store that advertises
    // delivery-inclusive prices, and the courier statement then disagreed
    // with the order by exactly the fee.
    const [offer, store] = await Promise.all([
      offerId ? db.offer.findFirst({ where: { id: offerId, companyId } }) : Promise.resolve(null),
      db.store.findFirst({ where: { id: storeId }, select: { priceIncludesDelivery: true } }),
    ]);
    const priceIncludesDelivery = offer
      ? offer.deliveryIncluded === true || store?.priceIncludesDelivery === true
      : store?.priceIncludesDelivery === true;

    // ONE COD function, used by every screen and service (contract PART 5).
    // It takes the whole order at once, so a discount spread over several
    // lines is allocated in one place rather than guessed per line.
    const codLines = requestedLines.map((line) => ({
      quantity: line.quantity,
      unitPrice: line.quantity > 0 ? (line.unitPrice || 0) / line.quantity : line.unitPrice || 0,
    }));
    const money = computeCod({
      lines: codLines,
      discount: offer?.discount ?? 0,
      deliveryFee: shipCost,
      priceIncludesDelivery,
      minorUnit: country.minorUnit,
    });
    const totalAmount = money.cod;

    // The legacy single-product columns describe the order as a whole: how
    // many units it holds, and what the goods on it are worth. Commission and
    // reporting read totalAmount, so those stay right for a multi-line order.
    const qtyTotal = requestedLines.reduce((sum, l) => sum + l.quantity, 0);
    const price = money.subtotal;

    // Cost of goods across every line, at the WEIGHTED AVERAGE of the stock
    // actually on hand. It used to read `batches[0]` — whichever batch the
    // query returned first, which is an accident rather than a policy, and
    // it moved every order's reported profit by the gap between two
    // arbitrary runs.
    const costByProduct = await productCosts(
      db,
      companyId,
      [...new Set(requestedLines.map((l) => l.productId))]
    );
    const estimatedCostOfGoods = Number(
      requestedLines
        .reduce((sum, l) => sum + (costByProduct.get(l.productId)?.average || 0) * l.quantity, 0)
        .toFixed(2)
    );

    // Moderator assignment — Phase S: moderator must belong to THIS company
    const assignedModeratorId = moderatorId || (user.role === 'MODERATOR' ? user.id : null);
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

    // 3. Create Order (with product snapshot for historical accuracy).
    // Workflow defaults (Step 4): NEW + unowned → lands in the claimable
    // Confirmation Queue for eligible employees immediately.
    // Everything (order + customer counters + activity + status log) is one
    // atomic transaction; the sequential order number retries on a P2002 race.
    const now = new Date();
    const order = await db.$transaction(async (tx) => {
      let created: any = null;
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          const refs = await orderRefFields(tx, companyId, country.orderPrefix, attempt, now);

          created = await tx.order.create({
            data: {
              companyId,
              countryId,
              storeId,
              ...refs,
              regionId: resolvedRegionId,
              priceIncludesDelivery,
              customerId: customer.id,
              productId: product.id,
              offerId: offerId || null,
              quantity: qtyTotal,
              sellingPrice: price,
              shippingCost: shipCost,
              totalAmount,
              currency: country.currencyCode,
              moderatorId: assignedModeratorId,
              moderatorCommission,
              estimatedCostOfGoods,
              productNameSnapshot: product.name,
              productImageSnapshot: product.image || null,
              status: 'NEW',
              confirmationStatus: 'NEW',
              shippingStatus: 'NOT_READY',
              settlementStatus: 'NOT_APPLICABLE',
              // Ownership: created but unclaimed — appears in the AVAILABLE queue
              assignedToId: null,
              claimedById: null,
              currentOwnerId: null,
              signatureStatus: 'UNSIGNED',
              version: 1,
              channelId: channel?.id ?? null,
              source: channel?.name || source || 'Manual',
              customerNotes: customerNotes?.trim() || null,
              internalNotes: internalNotes?.trim() || null,
            },
          });
          break;
        } catch (e: any) {
          // Duplicate order number race → retry with the next number
          if (e?.code === 'P2002' && attempt < 4) continue;
          throw e;
        }
      }
      if (!created) throw new Error('Failed to generate a unique order number');

      // 3b. The order's lines. Reservation and the discount share live per
      // line, and the shares come from the COD function's allocation so the
      // parts always add back up to the whole.
      await tx.orderItem.createMany({
        data: requestedLines.map((line, i) => ({
          companyId,
          orderId: created.id,
          productId: line.productId,
          productName: productById.get(line.productId)?.name ?? '',
          quantity: line.quantity,
          unitPrice: line.quantity > 0 ? (line.unitPrice || 0) / line.quantity : line.unitPrice || 0,
          discountShare: money.discountShares[i] ?? 0,
          lineTotal: money.lineTotals[i] ?? 0,
          addedById: user.id,
          addedStage: 'INTAKE',
        })),
      });

      // 4. Update Customer Stats
      await tx.customer.update({
        where: { id: customer.id },
        data: {
          totalOrders: { increment: 1 },
          lastOrderDate: now,
          firstOrderDate: customer.firstOrderDate || now,
        },
      });

      // 5. Activity Timeline entry
      await tx.orderActivity.create({
        data: {
          companyId,
          orderId: created.id,
          userId: user.id,
          action: 'ORDER_CREATED',
          newStatus: 'NEW',
          metadata: JSON.stringify({
            source: created.source,
            createdBy: user.name,
          }),
        },
      });

      // 6. Status log (confirmation workflow entry point)
      await tx.orderStatusLog.create({
        data: {
          companyId,
          orderId: created.id,
          statusType: 'CONFIRMATION',
          previousValue: null,
          newValue: 'NEW',
          changedById: user.id,
          changedByRole: user.role,
          note: 'Order created — entered confirmation queue',
        },
      });

      return created;
    });

    await logAudit({
      companyId,
      userId: user.id,
      action: 'ORDER_CREATED',
      entity: 'Order',
      entityId: order.id,
      newData: order,
    });

    // Notify company managers (userId null → broadcast) — non-fatal, after commit
    try {
      await createNotification({
        companyId,
        userId: null,
        title: 'طلب جديد',
        message: `تم إنشاء طلب جديد #${order.orderNumber} بواسطة ${user.name}.`,
        type: 'ORDER_NEW',
        link: '/orders',
      });
    } catch (e) {
      console.error('Order-create notification failed (non-fatal):', e);
    }

    return NextResponse.json({ success: true, order });
  } catch (error) {
    const { body, status } = apiError(error);
    return NextResponse.json(body, { status });
  }
}
