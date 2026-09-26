import { NextResponse } from 'next/server';
import { apiErrorResponse } from '@/lib/api-error';
import { requireContext } from '@/lib/geo-context';
import { requirePermission } from '@/lib/authorization';
import { getCompanyAnalytics, previousRange, DateFilter } from '@/lib/analytics';
import { rateLimit } from '@/lib/rate-limit';

export async function GET(req: Request) {
  try {
    const { companyId, storeId, user } = await requireContext();
    // Canonical gate — analytics access is explicit, not implicit by role
    await requirePermission('analytics.view');

    // Heavy analytics query — rate limit generously (30/min per user) so the
    // dashboard's 30s polling never hits it, but runaway clients are capped.
    const rl = rateLimit(`analytics:${companyId}:${user.id}`, 30, 60 * 1000);
    if (!rl.allowed) {
      return NextResponse.json(
        { errorAr: `طلبات كثيرة جداً. أعد المحاولة بعد ${rl.retryAfterSec} ثانية` },
        { status: 429 }
      );
    }

    const { searchParams } = new URL(req.url);

    const period = (searchParams.get('period') as any) || 'all';
    const startDate = searchParams.get('startDate') || undefined;
    const endDate = searchParams.get('endDate') || undefined;

    const filter: DateFilter = { period, startDate, endDate };
    const analytics = await getCompanyAnalytics({ companyId, storeId }, filter);

    /**
     * AND THE SAME FIGURES FOR THE WINDOW BEFORE THIS ONE.
     *
     * «٣٧٥ ديناراً» is not information. «٣٧٥، وكانت ٥١٠» is a morning's
     * work. Every number a manager opens this screen for is a comparison
     * they were going to make in their head anyway, usually wrongly.
     *
     * Only the handful the cards show, and only when the period HAS a
     * before: «الكل» has no previous, so the cards simply draw no line.
     */
    const prior = previousRange(filter);
    const previous = prior
      ? await getCompanyAnalytics({ companyId, storeId }, filter, prior).then((p) => ({
          netProfit: p.financials.netProfit,
          deliveredRevenue: p.financials.deliveredRevenue,
          confirmationRate: p.rates.confirmationRate,
          deliveryRate: p.rates.deliveryRate,
          orders: p.ordersCount.total,
        }))
      : null;

    return NextResponse.json({ ...analytics, previous });
  } catch (error: any) {
    return apiErrorResponse(error);
  }
}
