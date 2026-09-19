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
