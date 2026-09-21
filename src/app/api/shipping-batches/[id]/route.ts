import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireContext } from '@/lib/geo-context';

import { logAudit } from '@/lib/audit';
import { can } from '@/lib/authorization';

/**
 * PATCH /api/shipping-batches/[id] — update status/notes/provider (company-scoped)
 * Body: { status?: 'READY'|'SHIPPED'|'CLOSED', notes?, deliveryProviderId? }
 *
 * Marking a batch SHIPPED also stamps shippedAt on all its orders that are
 * still in READY_FOR_PICKUP (server timestamps only).
 */
/**
 * GET /api/shipping-batches/[id] — one batch with the orders it holds.
 *
 * Reading a batch needs only the right to see orders: printing its waybills
 * and checking what is in it are not management, and the batch is scoped to
 * the session's store either way.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user, companyId, storeId } = await requireContext();
    const { id } = await params;
    if (!can(user, 'orders.view')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const batch = await db.shippingBatch.findFirst({
      where: { id, companyId, ...(storeId ? { storeId } : {}) },
      include: {
        provider: { select: { id: true, name: true, code: true, kind: true } },
        creator: { select: { id: true, name: true } },
        orders: {
          select: {
            id: true, orderNumber: true, merchantRef: true, totalAmount: true,
            trackingNumber: true, shippingStatus: true,
            customer: { select: { fullName: true, phone: true, city: true } },
            region: { select: { name: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!batch) return NextResponse.json({ error: 'الدفعة غير موجودة' }, { status: 404 });

    return NextResponse.json({ batch });
  } catch (error) {
    return NextResponse.json({ error: 'حدث خطأ داخلي' }, { status: 400 });
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { user, companyId, storeId } = await requireContext();
    if (!can(user, 'orders.change_status')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const batch = await db.shippingBatch.findFirst({ where: { id, companyId, storeId } });
    if (!batch) return NextResponse.json({ error: 'Batch not found' }, { status: 404 });

    const body = await req.json();
    const { status, notes, deliveryProviderId } = body as {
      status?: string; notes?: string; deliveryProviderId?: string;
    };

    const updateData: Record<string, unknown> = {};
    if (status && ['READY', 'SHIPPED', 'CLOSED'].includes(status)) {
      updateData.status = status;
      if (status === 'SHIPPED' && !batch.shippedAt) updateData.shippedAt = new Date();
    }
    if (notes !== undefined) updateData.notes = notes?.trim() || null;
    if (deliveryProviderId !== undefined) {
      if (deliveryProviderId) {
        const provider = await db.deliveryProvider.findFirst({ where: { id: deliveryProviderId, companyId } });
        if (!provider) return NextResponse.json({ error: 'Provider not found in your company' }, { status: 404 });
        updateData.deliveryProviderId = provider.id;
      } else {
        updateData.deliveryProviderId = null;
      }
    }

    const updated = await db.shippingBatch.update({ where: { id }, data: updateData });

    // Batch-level ship stamp on member orders (server timestamps)
    if (status === 'SHIPPED') {
      const now = new Date();
      await db.order.updateMany({
        where: { shippingBatchId: id, companyId, storeId, shippingStatus: 'READY_FOR_PICKUP' },
        data: { shippingStatus: 'SHIPPED', shippedAt: now, version: { increment: 1 } },
      });
    }

    await logAudit({
      companyId, userId: user.id, action: 'SHIPPING_BATCH_UPDATED',
      entity: 'ShippingBatch', entityId: id,
      previousData: { status: batch.status },
      newData: { status: status ?? batch.status, by: user.name },
    });

    return NextResponse.json({ success: true, batch: updated });
  } catch (error: any) {
    return NextResponse.json({ error: 'حدث خطأ داخلي' }, { status: 400 });
  }
}
