import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireCompanyTenant } from '@/lib/auth';
import { can } from '@/lib/authorization';


/**
 * GET /api/orders/shipping — server-enforced shipping queues + dashboard counters.
 *
 * Query: queue = ready | packing | pickup | shipped | out | failed |
 *               return_requested | returned | no_provider | all
 *        providerId, page, limit
 * Server decides which queues/visibility a role gets (frontend never authorizes).
 */
export async function GET(req: Request) {
  try {
    const { user, companyId } = await requireCompanyTenant();
    const { searchParams } = new URL(req.url);
    const queue = searchParams.get('queue') || 'all';
    const providerId = searchParams.get('providerId')?.trim();
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 100);

    const mayViewShipping =
      can(user, 'orders.shipping_status') ||
      can(user, 'orders.view') ||
      can(user, 'orders.view_assigned');
    if (!mayViewShipping) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const base: Record<string, unknown> = { companyId };
    // Self-scoped roles (incl. MODERATOR) see only their own orders
    if (['CONFIRMATION_AGENT', 'FOLLOW_UP_AGENT', 'MODERATOR'].includes(user.role)) {
      base.OR = [{ claimedById: user.id }, { assignedToId: user.id }, { currentOwnerId: user.id }, { moderatorId: user.id }];
    }

    const queueMap: Record<string, string[]> = {
      ready: ['READY_FOR_SHIPPING'],
      packing: ['PACKING'],
      pickup: ['READY_FOR_PICKUP'],
      shipped: ['SHIPPED'],
      out: ['OUT_FOR_DELIVERY'],
      failed: ['FAILED_DELIVERY'],
      return_requested: ['RETURN_REQUESTED'],
      returned: ['RETURNED'],
      // everything in the shipping pipeline except terminal
      all: ['READY_FOR_SHIPPING', 'PACKING', 'READY_FOR_PICKUP', 'SHIPPED', 'OUT_FOR_DELIVERY', 'FAILED_DELIVERY', 'RETURN_REQUESTED', 'RETURNED'],
    };

    const where: Record<string, unknown> = { ...base };
    if (queue === 'no_provider') {
      where.shippingStatus = { in: ['READY_FOR_SHIPPING', 'PACKING', 'READY_FOR_PICKUP'] };
      where.deliveryProviderId = null;
    } else if (queueMap[queue]) {
      where.shippingStatus = { in: queueMap[queue] };
    } else {
      // unknown queue → safe default
      where.shippingStatus = { in: queueMap.all };
    }
    if (providerId) where.deliveryProviderId = providerId;

    const [total, orders] = await Promise.all([
      db.order.count({ where: where as any }),
      db.order.findMany({
        where: where as any,
        include: {
          customer: { select: { id: true, fullName: true, phone: true, rawPhone: true, city: true, address: true } },
          product: { select: { id: true, name: true, image: true } },
          deliveryProvider: { select: { id: true, name: true, code: true } },
          shippingBatch: { select: { id: true, batchNumber: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    // Dashboard counters (company-wide, one round trip)
    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const [ready, packing, pickup, shipped, out, failedToday, deliveredToday, returned, noProvider] = await Promise.all([
      db.order.count({ where: { companyId, shippingStatus: 'READY_FOR_SHIPPING' } }),
      db.order.count({ where: { companyId, shippingStatus: 'PACKING' } }),
      db.order.count({ where: { companyId, shippingStatus: 'READY_FOR_PICKUP' } }),
      db.order.count({ where: { companyId, shippingStatus: 'SHIPPED' } }),
      db.order.count({ where: { companyId, shippingStatus: 'OUT_FOR_DELIVERY' } }),
      db.order.count({ where: { companyId, shippingStatus: 'FAILED_DELIVERY', failedAt: { gte: startOfToday } } }),
      db.order.count({ where: { companyId, shippingStatus: 'DELIVERED', deliveredAt: { gte: startOfToday } } }),
      db.order.count({ where: { companyId, shippingStatus: { in: ['RETURN_REQUESTED', 'RETURNED'] } } }),
      db.order.count({ where: { companyId, shippingStatus: { in: ['READY_FOR_SHIPPING', 'PACKING', 'READY_FOR_PICKUP'] }, deliveryProviderId: null } }),
    ]);

    return NextResponse.json({
      orders,
      dashboard: { ready, packing, pickup, shipped, out, failedToday, deliveredToday, returned, noProvider },
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (error: any) {
    return NextResponse.json({ error: 'حدث خطأ داخلي' }, { status: 400 });
  }
}
