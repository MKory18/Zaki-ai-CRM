import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireContext } from '@/lib/geo-context';
import { requirePermission } from '@/lib/authorization';
import { apiErrorResponse } from '@/lib/api-error';
import { transitStatus } from '@/lib/delivery-fees';
import { normalizePhoneNumber } from '@/lib/phone';

/**
 * GET /api/ops/tracking?q=&status=
 *
 * Search by order number, merchant reference, courier barcode, customer name
 * or phone. Days in transit and the late flag are computed here against the
 * region's own threshold — the screen never counts days itself. Collection
 * status is returned as its own field, never merged into delivery status.
 */
const IN_FLIGHT = ['SHIPPED', 'OUT_FOR_DELIVERY', 'READY_FOR_PICKUP', 'FAILED_DELIVERY', 'RETURN_REQUESTED'];

export async function GET(req: Request) {
  try {
    const { companyId, storeId } = await requireContext();
    await requirePermission('ops.track');

    const q = new URL(req.url).searchParams;
    const term = q.get('q')?.trim();
    const status = q.get('status')?.trim();

    const orders = await db.order.findMany({
      where: {
        companyId,
        storeId,
        // "all" means all. It used to fall back to the in-flight list, which
        // hid every delivered shipment — the very ones you collect against.
        ...(status === 'all'
          ? {}
          : { shippingStatus: status ? status : { in: IN_FLIGHT } }),
        ...(term
          ? {
              OR: [
                { orderNumber: { contains: term } },
                { merchantRef: { contains: term } },
                { trackingNumber: { contains: term } },
                { customer: { fullName: { contains: term } } },
                { customer: { phone: { contains: normalizePhoneNumber(term) || term } } },
              ],
            }
          : {}),
      },
      // Oldest in transit first — the ones waiting longest are the work.
      // Nulls last so a shipment with no date does not head the queue.
      orderBy: [{ shippedAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }],
      take: 200,
      select: {
        id: true, orderNumber: true, merchantRef: true, trackingNumber: true,
        shippingStatus: true, settlementStatus: true, shippedAt: true, outForDeliveryAt: true,
        deliveryFailureReason: true, totalAmount: true, deliveryFee: true, currency: true, regionId: true,
        deliveryProviderId: true,
        customer: { select: { fullName: true, phone: true, city: true } },
        region: { select: { id: true, name: true } },
        deliveryProvider: { select: { id: true, name: true, kind: true } },
        _count: { select: { deliveryAttempts: true, notes: true } },
      },
    });

    // One lookup per (courier, region) pair for the late thresholds.
    const pairs = [...new Set(orders.filter((o) => o.deliveryProviderId && o.regionId).map((o) => `${o.deliveryProviderId}|${o.regionId}`))];
    const fees = await db.deliveryFee.findMany({
      where: {
        OR: pairs.map((p) => {
          const [deliveryProviderId, regionId] = p.split('|');
          return { deliveryProviderId, regionId };
        }),
      },
      select: { deliveryProviderId: true, regionId: true, lateThresholdDays: true },
    });
    const thresholdOf = new Map(fees.map((f) => [`${f.deliveryProviderId}|${f.regionId}`, f.lateThresholdDays]));

    const rows = orders.map((o) => {
      const threshold = thresholdOf.get(`${o.deliveryProviderId}|${o.regionId}`) ?? 0;
      const transit = transitStatus(o.shippedAt, threshold);
      return {
        ...o,
        daysInTransit: transit.days,
        lateThresholdDays: threshold,
        late: transit.late,
        // Delivery, settlement and collection stay three separate facts.
        collectionStatus: o.settlementStatus,
      };
    });

    return NextResponse.json({ count: rows.length, orders: rows, lateCount: rows.filter((r) => r.late).length });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
