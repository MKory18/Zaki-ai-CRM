import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireContext } from '@/lib/geo-context';
import { normalizePhoneNumber } from '@/lib/phone';
import { logAudit } from '@/lib/audit';
import { applyQueueFilter } from '@/lib/rbac';
import { createNotification } from '@/lib/notification';
import { apiError } from '@/lib/api-error';
import { requirePermission, getPermissionScope } from '@/lib/authorization';

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
    const page = parseInt(searchParams.get('page') || '1', 10);
    // Cap page size (hard server-side limit) with a NaN guard
    const parsedLimit = parseInt(searchParams.get('limit') || '25', 10);
    const limit = Math.min(Number.isNaN(parsedLimit) ? 25 : parsedLimit, 100);

    const whereClause: any = { companyId, storeId };

    // Explicit moderatorId filter (used by admin dashboards) — RBAC still applies below
    if (moderatorId && moderatorId !== 'all') {
      whereClause.moderatorId = moderatorId;
    }

    if (status && status !== 'all') {
      whereClause.status = status;
    }

    if (productId && productId !== 'all') {
      whereClause.productId = productId;
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
            select: { id: true, fullName: true, phone: true, rawPhone: true, city: true, address: true },
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
          callLogs: {
            orderBy: { createdAt: 'desc' },
            take: 3,
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return NextResponse.json({
      orders,
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
      productId: z.string().min(10).max(64),
      offerId: z.string().min(10).max(64).optional().nullable(),
      quantity: z.coerce.number().int().min(1).max(999),
      sellingPrice: z.coerce.number().min(0).max(100000),
      shippingCost: z.coerce.number().min(0).max(1000).optional(),
      source: z.string().trim().max(40).optional(),
      moderatorId: z.string().max(64).optional().nullable(),
      customerNotes: z.string().trim().max(500).optional().nullable(),
      internalNotes: z.string().trim().max(500).optional().nullable(),
    });
    const parsed = orderSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'بيانات الطلب غير صالحة' },
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
      productId,
      offerId,
      quantity,
      sellingPrice,
      shippingCost,
      source,
      moderatorId,
      customerNotes,
      internalNotes,
    } = v;

    if (!customerName || !customerPhone || !productId) {
      return NextResponse.json(
        { error: 'Customer Name, Phone, and Product are required' },
        { status: 400 }
      );
    }

    // 1. Duplicate check / Customer creation (reuse on a P2002 race)
    const normalizedPhone = normalizePhoneNumber(customerPhone);
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

    // 2. Fetch product & compute estimated unit cost from latest batch
    // Phase S: tenant-validate — orders must reference a product of THIS company
    const product = await db.product.findFirst({
      where: { id: productId, companyId },
      include: {
        batches: {
          where: { companyId },
          orderBy: { productionDate: 'desc' },
          take: 1,
        },
      },
    });
    if (!product) {
      return NextResponse.json({ error: 'المنتج غير موجود في شركتك' }, { status: 404 });
    }

    const qty = quantity || 1;
    const price = sellingPrice || product.basePrice;
    const shipCost = shippingCost || 0;
    const totalAmount = price;

    // Unit cost estimation
    const unitCost = product.batches[0]?.costPerUnit || 0;
    const estimatedCostOfGoods = Number((unitCost * qty).toFixed(2));

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
          const count = await tx.order.count({ where: { companyId } });
          const orderNumber = `${country.orderPrefix}-${new Date().getFullYear()}-${String(count + 1 + attempt).padStart(4, '0')}`;

          created = await tx.order.create({
            data: {
              companyId,
              countryId,
              storeId,
              orderNumber,
              customerId: customer.id,
              productId,
              offerId: offerId || null,
              quantity: qty,
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
              source: source || 'Manual',
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
