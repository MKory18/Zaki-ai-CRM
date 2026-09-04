import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireCompanyTenant, requirePermission } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { normalizePhoneNumber } from '@/lib/phone';

/**
 * Builds the same WHERE clause used by the orders list API (/api/orders)
 * so prev/next navigation matches the exact list context (filters + tenant + RBAC).
 */
async function buildNavigationWhere(order: { createdAt: Date; companyId: string }, searchParams: URLSearchParams) {
  const { user, companyId } = await requireCompanyTenant();
  const where: any = { companyId: order.companyId };

  // RBAC: moderators only navigate within their own assigned orders
  if (user.role === 'MODERATOR') {
    where.moderatorId = user.id;
  } else {
    const moderatorId = searchParams.get('moderatorId')?.trim();
    if (moderatorId && moderatorId !== 'all') where.moderatorId = moderatorId;
  }

  const status = searchParams.get('status')?.trim();
  if (status && status !== 'all') where.status = status;

  const productId = searchParams.get('productId')?.trim();
  if (productId && productId !== 'all') where.productId = productId;

  const search = searchParams.get('q')?.trim();
  if (search) {
    const normalizedSearch = normalizePhoneNumber(search);
    where.OR = [
      { orderNumber: { contains: search } },
      { customer: { fullName: { contains: search } } },
      { customer: { phone: { contains: normalizedSearch || search } } },
      { customer: { rawPhone: { contains: search } } },
    ];
  }

  return where;
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { companyId } = await requireCompanyTenant();
    const { searchParams } = new URL(req.url);

    const order = await db.order.findUnique({
      where: { id },
      include: {
        customer: true,
        product: true,
        offer: true,
        moderator: { select: { id: true, name: true, email: true, phone: true } },
        callLogs: {
          include: { moderator: { select: { name: true } } },
          orderBy: { createdAt: 'desc' },
        },
        activities: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!order || order.companyId !== companyId) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    // Prev/next ids following the list order (createdAt DESC), scoped to the
    // same company + current list filters so navigation mirrors the list view.
    // "next" = newer (comes first in a DESC list), "previous" = older.
    let previousOrderId: string | null = null;
    let nextOrderId: string | null = null;
    try {
      const ctxWhere = await buildNavigationWhere(order, searchParams);
      const tieBreaker = { id: 'desc' as const };
      const [newer, older] = await Promise.all([
        // Nearest newer order (created after this one) → "next" in DESC list
        db.order.findFirst({
          where: {
            ...ctxWhere,
            OR: [
              { createdAt: { gt: order.createdAt } },
              { createdAt: order.createdAt, id: { lt: id } },
            ],
          },
          orderBy: [{ createdAt: 'asc' }, tieBreaker],
          select: { id: true },
        }),
        // Nearest older order (created before this one) → "previous" in DESC list
        db.order.findFirst({
          where: {
            ...ctxWhere,
            OR: [
              { createdAt: { lt: order.createdAt } },
              { createdAt: order.createdAt, id: { gt: id } },
            ],
          },
          orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
          select: { id: true },
        }),
      ]);
      nextOrderId = newer?.id ?? null;
      previousOrderId = older?.id ?? null;
    } catch {
      // Navigation is best-effort; never fail the order fetch because of it
    }

    return NextResponse.json({ order, previousOrderId, nextOrderId });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { user, companyId } = await requireCompanyTenant();
    requirePermission('orders.update');

    const body = await req.json();
    const { status, moderatorId, internalNotes, customerNotes, postponedUntil, trackingCode } = body;

    const existing = await db.order.findUnique({
      where: { id },
      include: { customer: true, product: { include: { batches: true } } },
    });

    if (!existing || existing.companyId !== companyId) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    const previousStatus = existing.status;
    const updateData: any = {};

    if (status && status !== previousStatus) {
      updateData.status = status;

      if (status === 'CONFIRMED') {
        updateData.confirmedAt = new Date();
        await db.customer.update({
          where: { id: existing.customerId },
          data: { confirmedOrders: { increment: 1 } },
        });
      }

      if (status === 'SHIPPED') {
        updateData.shippedAt = new Date();
      }

      if (status === 'DELIVERED') {
        updateData.deliveredAt = new Date();

        // 1. Update customer delivered stats
        await db.customer.update({
          where: { id: existing.customerId },
          data: {
            deliveredOrders: { increment: 1 },
            totalPurchaseValue: { increment: existing.totalAmount },
          },
        });

        // 2. Automatically deduct stock from active batch with remaining inventory
        const activeBatch = await db.productionBatch.findFirst({
          where: {
            productId: existing.productId,
            quantityRemaining: { gt: 0 },
          },
          orderBy: { productionDate: 'asc' },
        });

        if (activeBatch) {
          const deductQty = Math.min(existing.quantity, activeBatch.quantityRemaining);
          await db.productionBatch.update({
            where: { id: activeBatch.id },
            data: {
              quantitySold: { increment: deductQty },
              quantityRemaining: { decrement: deductQty },
            },
          });

          await db.inventoryMovement.create({
            data: {
              companyId,
              productId: existing.productId,
              batchId: activeBatch.id,
              type: 'SALE',
              quantity: -deductQty,
              balanceAfter: Math.max(0, activeBatch.quantityRemaining - deductQty),
              referenceId: existing.id,
              reason: `Delivered Order #${existing.orderNumber}`,
              createdById: user.id,
            },
          });
        }
      }

      if (status === 'REJECTED' || status === 'CANCELLED') {
        updateData.moderatorCommission = 0; // No commission for rejected orders
        await db.customer.update({
          where: { id: existing.customerId },
          data: { cancelledOrders: { increment: 1 } },
        });
      }
    }

    if (moderatorId !== undefined) {
      updateData.moderatorId = moderatorId || null;
    }
    if (internalNotes !== undefined) {
      updateData.internalNotes = internalNotes;
    }
    if (customerNotes !== undefined) {
      updateData.customerNotes = customerNotes;
    }
    if (postponedUntil !== undefined) {
      updateData.postponedUntil = postponedUntil ? new Date(postponedUntil) : null;
    }

    const updatedOrder = await db.order.update({
      where: { id },
      data: updateData,
    });

    // Record activity timeline
    if (status && status !== previousStatus) {
      await db.orderActivity.create({
        data: {
          companyId,
          orderId: id,
          userId: user.id,
          action: 'STATUS_CHANGED',
          previousStatus,
          newStatus: status,
          metadata: JSON.stringify({
            updatedBy: user.name,
            role: user.role,
            trackingCode: trackingCode || null,
          }),
        },
      });
    }

    await logAudit({
      companyId,
      userId: user.id,
      action: 'ORDER_UPDATED',
      entity: 'Order',
      entityId: id,
      previousData: existing,
      newData: updatedOrder,
    });

    return NextResponse.json({ success: true, order: updatedOrder });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
