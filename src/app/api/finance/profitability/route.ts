import { NextResponse } from 'next/server';
import { apiErrorResponse } from '@/lib/api-error';
import { db } from '@/lib/db';
import { requireCompanyTenant } from '@/lib/auth';
import { requirePermission } from '@/lib/authorization';


/**
 * GET /api/finance/profitability?from=&to=&limit=
 * Product-level profitability via server-side grouping (no raw rows to client).
 * Metric definitions included in response.
 */
export async function GET(req: Request) {
  try {
    const { companyId } = await requireCompanyTenant();
    await requirePermission('finance.view');
    const { searchParams } = new URL(req.url);
    const from = searchParams.get('from') ? new Date(searchParams.get('from')!) : undefined;
    const to = searchParams.get('to') ? new Date(searchParams.get('to')!) : undefined;
    const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 100);

    const dateWhere: any = {};
    if (from && !isNaN(from.getTime())) dateWhere.gte = from;
    if (to && !isNaN(to.getTime())) dateWhere.lte = to;

    // Group confirmed orders by product — aggregated server-side
    const grouped = await db.order.groupBy({
      by: ['productId'],
      where: {
        companyId,
        confirmationStatus: 'CONFIRMED',
        ...(Object.keys(dateWhere).length ? { createdAt: dateWhere } : {}),
      },
      _count: { id: true },
      _sum: {
        totalRevenue: true, netProfit: true, grossProfit: true,
        quantity: true, productCost: true,
      },
      orderBy: { _sum: { netProfit: 'desc' } },
      take: limit,
    });

    const productIds = grouped.map((g) => g.productId);
    const products = await db.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, name: true, sku: true, basePrice: true },
    });
    const pMap = new Map(products.map((p) => [p.id, p]));

    const rows = grouped
      .filter((g) => g.productId)
      .map((g) => {
        const p = pMap.get(g.productId!);
        const revenue = Number(g._sum.totalRevenue ?? 0);
        const profit = Number(g._sum.netProfit ?? 0);
        const qty = Number(g._sum.quantity ?? 0);
        return {
          productId: g.productId,
          name: p?.name ?? '—',
          sku: p?.sku ?? '—',
          ordersCount: g._count.id,
          quantitySold: qty,
          revenue: revenue.toFixed(2),
          netProfit: profit.toFixed(2),
          profitMargin: revenue > 0 ? Number(((profit / revenue) * 100).toFixed(1)) : null,
        };
      });

    return NextResponse.json({
      products: rows,
      definitions: {
        revenue: 'sum(totalRevenue) over CONFIRMED orders',
        profitMargin: 'netProfit / revenue %',
      },
    });
  } catch (error: any) {
    return apiErrorResponse(error);
  }
}
