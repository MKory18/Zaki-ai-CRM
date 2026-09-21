import { NextResponse } from 'next/server';
import { requireContext } from '@/lib/geo-context';
import { requirePermission } from '@/lib/authorization';
import { apiErrorResponse } from '@/lib/api-error';
import { getCompanyAnalytics } from '@/lib/analytics';

/**
 * GET /api/finance/profitability?from=&to=&limit=
 *
 * What each product earned, and what it cost to earn it.
 *
 * It used to sum `orders.totalRevenue` and `orders.netProfit` — a family of
 * financial-snapshot columns that nothing in the system has ever written.
 * Zero of a hundred and fifty-two orders carried a value, so every product
 * reported a revenue of zero, which is presumably why no screen was ever
 * pointed at it.
 *
 * It now asks the same function the dashboard asks. One profit calculation,
 * reading the columns that actually hold money, split across an order's
 * lines so a product is credited with what it sold rather than with whatever
 * happened to be first on the order.
 */
export async function GET(req: Request) {
  try {
    const { companyId, storeId } = await requireContext();
    await requirePermission('finance.view');

    const { searchParams } = new URL(req.url);
    const startDate = searchParams.get('from') || undefined;
    const endDate = searchParams.get('to') || undefined;
    const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10) || 20, 100);

    const analytics = await getCompanyAnalytics(
      { companyId, storeId },
      startDate && endDate ? { startDate, endDate } : { period: 'all' }
    );

    const products = (analytics.productStats ?? [])
      .filter((p: { deliveredOrders: number }) => p.deliveredOrders > 0)
      .sort((a: { netProfit: number }, b: { netProfit: number }) => b.netProfit - a.netProfit)
      .slice(0, limit)
      .map((p: {
        id: string; name: string; sku: string;
        totalOrders: number; deliveredOrders: number;
        revenue: number; cogs: number; shippingCost: number;
        netProfit: number; profitMargin: number;
      }) => ({
        productId: p.id,
        name: p.name,
        sku: p.sku,
        ordersCount: p.totalOrders,
        deliveredOrders: p.deliveredOrders,
        // Units are not tracked per product in the delivered aggregate; the
        // order count is the honest figure here rather than a guess.
        quantitySold: p.deliveredOrders,
        revenue: p.revenue.toFixed(2),
        cogs: p.cogs.toFixed(2),
        shippingCost: p.shippingCost.toFixed(2),
        netProfit: p.netProfit.toFixed(2),
        profitMargin: p.profitMargin,
      }));

    return NextResponse.json({ products });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
