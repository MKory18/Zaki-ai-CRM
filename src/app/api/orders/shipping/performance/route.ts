import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireCompanyTenant } from '@/lib/auth';
import { can } from '@/lib/authorization';


/**
 * GET /api/orders/shipping/performance?providerId=
 *
 * Company-isolated provider metrics. Metric definitions (no misleading math):
 *   assigned            = orders currently/have-been bound to the provider
 *   shipped             = reached SHIPPED or later
 *   delivered           = shippingStatus DELIVERED
 *   failed              = shippingStatus FAILED_DELIVERY
 *   returned            = shippingStatus RETURNED
 *   successRate         = delivered / (delivered + failed + returned)
 *   avgDeliveryHours    = avg(deliveredAt - shippedAt) over delivered orders
 */
export async function GET(req: Request) {
  try {
    const { user, companyId } = await requireCompanyTenant();
    const { searchParams } = new URL(req.url);
    const providerId = searchParams.get('providerId')?.trim();

    // Access gate: canonical permission checks (role bypass replaced by the
    // scope engine — management roles hold orders.change_status anyway)
    if (!can(user, 'reports.view') && !can(user, 'finance.view') && !can(user, 'orders.change_status')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const providers = await db.deliveryProvider.findMany({
      where: { companyId, ...(providerId ? { id: providerId } : {}) },
      select: { id: true, name: true, code: true, isActive: true },
    });

    const results = await Promise.all(
      providers.map(async (p) => {
        const base = { companyId, deliveryProviderId: p.id };
        const [assigned, shipped, delivered, failed, returned] = await Promise.all([
          db.order.count({ where: base }),
          db.order.count({ where: { ...base, shippingStatus: { in: ['SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'FAILED_DELIVERY', 'RETURN_REQUESTED', 'RETURNED'] } } }),
          db.order.count({ where: { ...base, shippingStatus: 'DELIVERED' } }),
          db.order.count({ where: { ...base, shippingStatus: 'FAILED_DELIVERY' } }),
          db.order.count({ where: { ...base, shippingStatus: { in: ['RETURN_REQUESTED', 'RETURNED'] } } }),
        ]);

        const decided = delivered + failed + returned;
        const successRate = decided > 0 ? Number(((delivered / decided) * 100).toFixed(1)) : null;
        const failureRate = decided > 0 ? Number(((failed / decided) * 100).toFixed(1)) : null;
        const returnRate = decided > 0 ? Number(((returned / decided) * 100).toFixed(1)) : null;

        // avg delivery time over recent delivered orders (bounded sample)
        const sample = await db.order.findMany({
          where: { ...base, shippingStatus: 'DELIVERED', shippedAt: { not: null }, deliveredAt: { not: null } },
          select: { shippedAt: true, deliveredAt: true },
          orderBy: { deliveredAt: 'desc' },
          take: 300,
        });
        const avgDeliveryHours =
          sample.length > 0
            ? Number(
                (
                  sample.reduce(
                    (acc, o) => acc + (new Date(o.deliveredAt!).getTime() - new Date(o.shippedAt!).getTime()),
                    0
                  ) / sample.length / (60 * 60 * 1000)
                ).toFixed(1)
              )
            : null;

        return {
          provider: p,
          metrics: { assigned, shipped, delivered, failed, returned, successRate, failureRate, returnRate, avgDeliveryHours },
        };
      })
    );

    return NextResponse.json({ providers: results });
  } catch (error: any) {
    return NextResponse.json({ error: 'حدث خطأ داخلي' }, { status: 400 });
  }
}
