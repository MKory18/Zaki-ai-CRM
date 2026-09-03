import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireCompanyTenant, requirePermission } from '@/lib/auth';
import { normalizePhoneNumber } from '@/lib/phone';
import { logAudit } from '@/lib/audit';

export async function GET(req: Request) {
  try {
    const { user, companyId } = await requireCompanyTenant();
    const { searchParams } = new URL(req.url);

    const search = searchParams.get('q')?.trim();
    const status = searchParams.get('status')?.trim();
    const productId = searchParams.get('productId')?.trim();
    const moderatorId = searchParams.get('moderatorId')?.trim();
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '50', 10);

    const whereClause: any = { companyId };

    // If user is MODERATOR, only show their assigned orders (Section 15)
    if (user.role === 'MODERATOR') {
      whereClause.moderatorId = user.id;
    } else if (moderatorId && moderatorId !== 'all') {
      whereClause.moderatorId = moderatorId;
    }

    if (status && status !== 'all') {
      whereClause.status = status;
    }

    if (productId && productId !== 'all') {
      whereClause.productId = productId;
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

    const [total, orders] = await Promise.all([
      db.order.count({ where: whereClause }),
      db.order.findMany({
        where: whereClause,
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
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}

export async function POST(req: Request) {
  try {
    const { user, companyId } = await requireCompanyTenant();
    await requirePermission('orders.create');

    const body = await req.json();
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
    } = body;

    if (!customerName || !customerPhone || !productId) {
      return NextResponse.json(
        { error: 'Customer Name, Phone, and Product are required' },
        { status: 400 }
      );
    }

    // 1. Duplicate check / Customer creation
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
    }

    // 2. Fetch product & compute estimated unit cost from latest batch
    const product = await db.product.findUnique({
      where: { id: productId },
      include: {
        batches: {
          where: { quantityRemaining: { gt: 0 } },
          orderBy: { productionDate: 'asc' },
          take: 1,
        },
      },
    });

    if (!product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    const qty = parseInt(quantity, 10) || 1;
    const price = parseFloat(sellingPrice) || product.basePrice;
    const shipCost = parseFloat(shippingCost) || 0;
    const totalAmount = price;

    // Unit cost estimation
    const unitCost = product.batches[0]?.costPerUnit || 0;
    const estimatedCostOfGoods = Number((unitCost * qty).toFixed(2));

    // Moderator assignment
    const assignedModeratorId = moderatorId || (user.role === 'MODERATOR' ? user.id : null);
    let moderatorCommission = 0;
    if (assignedModeratorId) {
      const mod = await db.user.findUnique({ where: { id: assignedModeratorId } });
      if (mod && mod.commissionRate > 0) {
        moderatorCommission = Number(((price * mod.commissionRate) / 100).toFixed(2));
      }
    }

    // Generate unique Order Number
    const count = await db.order.count({ where: { companyId } });
    const orderNumber = `ORD-${new Date().getFullYear()}-${String(count + 1).padStart(4, '0')}`;

    // 3. Create Order (with product snapshot for historical accuracy)
    const order = await db.order.create({
      data: {
        companyId,
        orderNumber,
        customerId: customer.id,
        productId,
        offerId: offerId || null,
        quantity: qty,
        sellingPrice: price,
        shippingCost: shipCost,
        totalAmount,
        currency: 'USD',
        moderatorId: assignedModeratorId,
        moderatorCommission,
        estimatedCostOfGoods,
        productNameSnapshot: product.name,
        productImageSnapshot: product.image || null,
        status: 'NEW',
        source: source || 'Manual',
        customerNotes: customerNotes?.trim() || null,
        internalNotes: internalNotes?.trim() || null,
      },
    });

    // 4. Update Customer Stats
    await db.customer.update({
      where: { id: customer.id },
      data: {
        totalOrders: { increment: 1 },
        lastOrderDate: new Date(),
        firstOrderDate: customer.firstOrderDate || new Date(),
      },
    });

    // 5. Activity Timeline entry
    await db.orderActivity.create({
      data: {
        companyId,
        orderId: order.id,
        userId: user.id,
        action: 'ORDER_CREATED',
        newStatus: 'NEW',
        metadata: JSON.stringify({
          source: order.source,
          createdBy: user.name,
        }),
      },
    });

    await logAudit({
      companyId,
      userId: user.id,
      action: 'ORDER_CREATED',
      entity: 'Order',
      entityId: order.id,
      newData: order,
    });

    return NextResponse.json({ success: true, order });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
