import { NextResponse } from 'next/server';
import { apiErrorResponse } from '@/lib/api-error';
import { db } from '@/lib/db';
import { requireContext } from '@/lib/geo-context';

/**
 * GET /api/finance/summary?from=&to=
 * Server-side aggregated financial summary (no raw orders shipped to client).
 * Permission: finance.view required.
 */
export async function GET(req: Request) {
  try {
    const { companyId, storeId } = await requireContext();
    const { requirePermission } = await import('@/lib/authorization');
    await requirePermission('finance.view');
    const { searchParams } = new URL(req.url);

    const from = searchParams.get('from') ? new Date(searchParams.get('from')!) : undefined;
    const to = searchParams.get('to') ? new Date(searchParams.get('to')!) : undefined;
    const range: any = {};
    if (from && !isNaN(from.getTime())) range.gte = from;
    if (to && !isNaN(to.getTime())) range.lte = to;
    const dateWhere = Object.keys(range).length ? { createdAt: range } : {};

    // Server-side aggregation — never load orders into the browser
    const agg = await db.order.aggregate({
      where: { companyId, storeId, ...dateWhere, confirmationStatus: 'CONFIRMED' },
      _sum: {
        totalRevenue: true, grossProfit: true, netProfit: true,
        productCost: true, packagingCost: true, advertisingCost: true,
        otherCost: true, shippingCost: true, moderatorCommission: true,
        subtotal: true, discount: true,
      },
      _count: true,
      _avg: { totalRevenue: true },
    });

    const [settledCount, pendingCount, refundedCount] = await Promise.all([
      db.order.count({ where: { companyId, storeId, ...dateWhere, settlementStatus: 'SETTLED' } }),
      db.order.count({ where: { companyId, storeId, ...dateWhere, settlementStatus: { in: ['PENDING', 'PENDING_COLLECTION'] } } }),
      db.order.count({ where: { companyId, storeId, ...dateWhere, settlementStatus: { in: ['REFUNDED', 'PARTIALLY_REFUNDED'] } } }),
    ]);

    const ordersConfirmed = agg._count || 0;
    const totalRevenue = agg._sum.totalRevenue ?? 0;
    const netProfit = agg._sum.netProfit ?? 0;
    const profitMargin = Number(totalRevenue) > 0
      ? Number((Number(netProfit) / Number(totalRevenue) * 100).toFixed(1))
      : null;
    const avgOrderValue = ordersConfirmed > 0
      ? Number((Number(totalRevenue) / ordersConfirmed).toFixed(2))
      : null;

    return NextResponse.json({
      summary: {
        ordersConfirmed,
        totalRevenue: String(totalRevenue ?? 0),
        grossProfit: String(agg._sum.grossProfit ?? 0),
        netProfit: String(netProfit ?? 0),
        profitMargin,
        avgOrderValue,
        costs: {
          product: String(agg._sum.productCost ?? 0),
          packaging: String(agg._sum.packagingCost ?? 0),
          shipping: String(agg._sum.shippingCost ?? 0),
          advertising: String(agg._sum.advertisingCost ?? 0),
          other: String(agg._sum.otherCost ?? 0),
          commissions: String(agg._sum.moderatorCommission ?? 0),
        },
        settlement: { settled: settledCount, pending: pendingCount, refunded: refundedCount },
      },
      definitions: {
        profitMargin: 'netProfit / totalRevenue %',
        avgOrderValue: 'totalRevenue / confirmed orders',
      },
    });
  } catch (error: any) {
    return apiErrorResponse(error);
  }
}
