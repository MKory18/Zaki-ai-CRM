import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireContext } from '@/lib/geo-context';
import { requirePermission } from '@/lib/authorization';
import { apiErrorResponse } from '@/lib/api-error';
import { performanceSettings } from '@/lib/performance-settings';
import { currentSpan } from '@/lib/commission-period';
import { scoreRole } from '@/lib/performance-metrics';
import { peersOf } from '@/lib/performance-people';
import { BANDS_FOR } from '@/lib/performance-score';
import { ROLE_LABELS } from '@/types/auth';

/**
 * GET /api/performance/team — the supervisor's view of the same numbers.
 *
 * The same function the card calls, over the same window, so a supervisor
 * and the person they are talking to are never looking at two different
 * figures for one month.
 *
 * Ordered BEST FIRST, always, and there is no parameter that reverses it.
 * A published list of the worst is a different product from a measuring
 * tool: people stop trying to improve the number and start trying to not
 * be last, and the number stops meaning anything. Somebody wanting to find
 * who needs help can read the bottom of a list sorted downward — what they
 * cannot do is hand out a ranking of failures.
 */
export async function GET() {
  try {
    const { companyId, storeId, country } = await requireContext();
    await requirePermission('team.monitor');

    const settings = await performanceSettings(companyId);
    const span = currentSpan(settings.period === 'WEEKLY' ? 'WEEKLY' : 'MONTHLY', new Date());
    const calendar = {
      workHoursStart: country.workHoursStart,
      workHoursEnd: country.workHoursEnd,
      weekendDays: country.weekendDays,
      timezone: country.timezone,
    };
    const scope = { companyId, storeId, start: span.start, end: span.end, calendar };

    const roles = await Promise.all(
      Object.keys(BANDS_FOR).map(async (role) => {
        const peers = await peersOf(db, { companyId, storeId, role });
        return {
          role,
          ar: ROLE_LABELS[role as keyof typeof ROLE_LABELS]?.ar ?? role,
          people: await scoreRole(scope, role, peers, settings.minSample),
        };
      })
    );

    return NextResponse.json({
      window: { start: span.start, end: span.end, period: settings.period },
      bars: { deliveryRate: settings.deliveryRateBar, issuesRate: settings.issuesRateBar },
      minSample: settings.minSample,
      roles: roles.filter((r) => r.people.length > 0),
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
