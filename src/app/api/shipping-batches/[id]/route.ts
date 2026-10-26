import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireContext } from '@/lib/geo-context';
import { noteCustomersHandedOut } from '@/lib/pii-alert';

import { logAudit } from '@/lib/audit';
import { can } from '@/lib/authorization';
import { apiErrorResponse } from '@/lib/api-error';
import { redactCustomerForWarehouse } from '@/lib/operations';

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
 * The keys of the batches screen, which is the only thing that reads it —
 * and it reads only the order numbers and barcodes, to check parcels
 * against. `orders.view` used to be enough, with its scope ignored, and the
 * answer carried every customer's name and phone. The phone now goes only
 * with the address-book key, as on the labels and returns screens.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user, companyId, storeId } = await requireContext();
    const { id } = await params;
    if (!can(user, 'ops.ship') && !can(user, 'ops.track')) {
      return NextResponse.json({ error: 'دفعات الشحن ليست من صلاحيّاتك.', errorAr: 'دفعات الشحن ليست من صلاحيّاتك.' }, { status: 403 });
    }
    const maySeeContact = can(user, 'customers.view');

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

    // A batch is a list of parcels, and every parcel carries a person.
    await noteCustomersHandedOut({
      companyId, storeId, user, where: 'دفعة شحن', rows: batch.orders,
    });

    return NextResponse.json({
      batch: { ...batch, orders: batch.orders.map((o) => ({ ...o, customer: redactCustomerForWarehouse(o.customer, maySeeContact) })) },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { user, companyId, storeId } = await requireContext();
    if (!can(user, 'orders.change_status')) {
      return NextResponse.json({ error: 'Forbidden', errorAr: 'هذا الإجراء ليس من صلاحيّاتك. راجع مدير النطام إن كان من عملك.' }, { status: 403 });
    }

    const batch = await db.shippingBatch.findFirst({ where: { id, companyId, storeId } });
    if (!batch) return NextResponse.json({ error: 'Batch not found', errorAr: 'الدفعة غير موجودة. أعد تحميل القائمة.' }, { status: 404 });

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
        if (!provider) return NextResponse.json({ error: 'Provider not found in your company', errorAr: 'شركة الشحن هذه ليست من شركات شركتك.' }, { status: 404 });
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
