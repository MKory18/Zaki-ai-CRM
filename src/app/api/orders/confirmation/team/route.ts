import { NextResponse } from 'next/server';
import { requireContext } from '@/lib/geo-context';
import { can } from '@/lib/authorization';
import { apiErrorResponse } from '@/lib/api-error';
import { getDateRange, type DateFilter } from '@/lib/analytics';
import { teamPerformance } from '@/lib/team-performance';

/**
 * GET /api/orders/confirmation/team?period=&startDate=&endDate=
 *
 * Every confirmation employee at once, for a chosen span of days. The
 * per-employee endpoint answers "how am I doing"; this answers "who is
 * doing well, and this week or last month".
 *
 * The arithmetic lives in the service layer so the report and any future
 * export say the same thing. The window is clamped to 90 days there, the
 * same ceiling every other aggregate in the system obeys.
 */
export async function GET(req: Request) {
  try {
    const { user, companyId, storeId, country } = await requireContext();

    const mayViewTeam =
      can(user, 'users.view') || ['SUPER_ADMIN', 'COMPANY_ADMIN', 'MANAGER'].includes(user.role);
    if (!mayViewTeam) {
      return NextResponse.json({ error: 'Forbidden: cannot view team performance' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const filter: DateFilter = {
      period: (searchParams.get('period') as DateFilter['period']) || undefined,
      startDate: searchParams.get('startDate') || undefined,
      endDate: searchParams.get('endDate') || undefined,
    };
    const { start, end } = getDateRange(filter);

    const result = await teamPerformance({
      companyId,
      storeId,
      calendar: {
        workHoursStart: country.workHoursStart,
        workHoursEnd: country.workHoursEnd,
        weekendDays: country.weekendDays,
        timezone: country.timezone,
      },
      start,
      end,
    });

    return NextResponse.json({
      ...result,
      window: { start: start?.toISOString() ?? null, end: end?.toISOString() ?? null },
      definitions: {
        claimed: 'الطلبات التي سحبها الموظف من المجمّع خلال المدة',
        decided: 'ما وصل إلى قرار (مؤكد أو مرفوض) خلال المدة — ما زال قيد العمل لا يُحسب',
        confirmationRate: 'المؤكد ÷ ما وصل إلى قرار',
        medianConfirmMinutes: 'وسيط دقائق العمل من سحب الطلب حتى تأكيده — خارج الدوام لا يُحتسب',
        medianGapMinutes: 'وسيط دقائق العمل بين سحب طلب والذي يليه',
        openNow: 'ما يحمله الموظف مفتوحاً الآن، بصرف النظر عن المدة',
      },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
