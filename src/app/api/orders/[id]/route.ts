import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireCompanyTenant, requirePermission } from '@/lib/auth';
import { logAudit } from '@/lib/audit';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { companyId } = await requireCompanyTenant();

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

    return NextResponse.json({ order });
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
