import { NextResponse } from 'next/server';
import { requireContext } from '@/lib/geo-context';
import { requirePermission } from '@/lib/authorization';
import { apiErrorResponse } from '@/lib/api-error';
import { getDateRange, type DateFilter } from '@/lib/analytics';
import { landingAnalytics } from '@/lib/landing-analytics';

/**
 * GET /api/growth/landing-analytics — the landing pages of the selected
 * store, for the performance screen's date window.
 *
 * Two gates: the performance screen's own (reports.view or analytics.view)
 * AND landing_pages.view — it is marketing data, and a confirmation
 * supervisor who can open the performance screen for the team tables has no
 * business reading it.
 */
export async function GET(req: Request) {
  try {
    const { companyId, storeId } = await requireContext();
    await requirePermission('reports.view').catch(async () => requirePermission('analytics.view'));
    await requirePermission('landing_pages.view');

    const q = new URL(req.url).searchParams;
    const filter: DateFilter = {
      period: (q.get('period') as DateFilter['period']) || undefined,
      startDate: q.get('startDate') || undefined,
      endDate: q.get('endDate') || undefined,
    };
    const { start, end } = getDateRange(filter);
    const now = new Date();
    const data = await landingAnalytics({
      companyId,
      storeId,
      start: start ?? now,
      end: end ?? now,
    });
    return NextResponse.json(data);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
