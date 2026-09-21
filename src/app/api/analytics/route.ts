import { NextResponse } from 'next/server';
import { apiErrorResponse } from '@/lib/api-error';
import { requireContext } from '@/lib/geo-context';
import { requirePermission } from '@/lib/authorization';
import { getCompanyAnalytics, DateFilter } from '@/lib/analytics';
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

    return NextResponse.json(analytics);
  } catch (error: any) {
    return apiErrorResponse(error);
  }
}
