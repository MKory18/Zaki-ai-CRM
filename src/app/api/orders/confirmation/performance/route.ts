import { NextResponse } from 'next/server';
import { apiErrorResponse } from '@/lib/api-error';
import { db } from '@/lib/db';
import { requireCompanyTenant } from '@/lib/auth';
import { can } from '@/lib/authorization';


/**
 * GET /api/orders/confirmation/performance?employeeId=&scope=me|team
 *
 * Company-isolated metrics. Employees see their own numbers;
 * users.view holders may request team/individual stats.
 * Definitions (no misleading math):
 *   processed  = orders that left NEW (any terminal or mid-workflow action by the employee)
 *   confirmationRate = confirmed / processed (NEW untouched NOT counted)
 */
export async function GET(req: Request) {
  try {
    const { user, companyId } = await requireCompanyTenant();
    const { searchParams } = new URL(req.url);
    const requestedEmployeeId = searchParams.get('employeeId')?.trim();
    const scope = searchParams.get('scope') || 'me';

    let employeeId = user.id;

    if (scope === 'team' || (requestedEmployeeId && requestedEmployeeId !== user.id)) {
      // Viewing others requires users.view OR global view roles
      const mayViewTeam = can(user, 'users.view') ||
        ['SUPER_ADMIN', 'COMPANY_ADMIN', 'MANAGER'].includes(user.role);
      if (!mayViewTeam) {
        return NextResponse.json({ error: 'Forbidden: cannot view other employees\u2019 performance' }, { status: 403 });
      }
    }
    if (requestedEmployeeId) {
      const mayViewTeam = can(user, 'users.view') ||
        ['SUPER_ADMIN', 'COMPANY_ADMIN', 'MANAGER'].includes(user.role);
      if (!mayViewTeam && requestedEmployeeId !== user.id) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      employeeId = requestedEmployeeId;
    }

    const now = new Date();
    // Company-isolated base
    const mine = (extra: Record<string, unknown> = {}) => ({
      companyId,
      claimedById: employeeId,
      ...extra,
    });

    const [
      claimed, inProgress, confirmed, rejected, noAnswer, followUpsDue,
      attemptsAgg, confirmedWithTime,
    ] = await Promise.all([
      // Orders claimed (total workload accepted)
      db.order.count({ where: mine() }),
      // Currently processing (mid-workflow, not terminal)
      db.order.count({ where: mine({ confirmationStatus: { in: ['IN_PROGRESS', 'NO_ANSWER', 'FOLLOW_UP_REQUIRED', 'POSTPONED'] } }) }),
      // Confirmed by this employee
      db.order.count({ where: { companyId, confirmedById: employeeId, confirmationStatus: 'CONFIRMED' } }),
      // Rejected (claimed by this employee, terminal rejected)
      db.order.count({ where: mine({ confirmationStatus: 'REJECTED' }) }),
      // No-answer cases
      db.order.count({ where: mine({ confirmationStatus: 'NO_ANSWER' }) }),
      // Follow-ups completed by this employee
      db.order.count({ where: { companyId, followUpResolvedById: employeeId, followUpStatus: 'COMPLETED' } }),
      // Contact attempts by this employee (for avg attempts per order)
      db.orderContactAttempt.count({ where: { companyId, employeeId } }),
      // Orders confirmed WITH timestamps (for avg confirmation time)
      db.order.findMany({
        where: { companyId, confirmedById: employeeId, confirmedAt: { not: null }, claimedAt: { not: null } },
        select: { claimedAt: true, confirmedAt: true },
        take: 500,
        orderBy: { confirmedAt: 'desc' },
      }),
    ]);

    const processed = confirmed + rejected; // processed = reached a decision
    const confirmationRate = processed > 0 ? Number(((confirmed / processed) * 100).toFixed(1)) : null;
    const avgAttempts = claimed > 0 ? Number((attemptsAgg / claimed).toFixed(2)) : null;

    const avgConfirmHours =
      confirmedWithTime.length > 0
        ? Number(
            (
              confirmedWithTime.reduce(
                (acc, o) => acc + (new Date(o.confirmedAt!).getTime() - new Date(o.claimedAt!).getTime()),
                0
              ) /
              confirmedWithTime.length /
              (60 * 60 * 1000)
            ).toFixed(1)
          )
        : null;

    // Today's action counts (claimed orders acted on today)
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const confirmedToday = await db.orderStatusLog.count({
      where: { companyId, changedById: employeeId, statusType: 'CONFIRMATION', newValue: 'CONFIRMED', createdAt: { gte: startOfToday } },
    });
    const rejectedToday = await db.orderStatusLog.count({
      where: { companyId, changedById: employeeId, statusType: 'CONFIRMATION', newValue: 'REJECTED', createdAt: { gte: startOfToday } },
    });
    const contactedToday = await db.orderContactAttempt.count({
      where: { companyId, employeeId, createdAt: { gte: startOfToday } },
    });
    const noAnswerToday = await db.orderStatusLog.count({
      where: { companyId, changedById: employeeId, statusType: 'CONFIRMATION', newValue: 'NO_ANSWER', createdAt: { gte: startOfToday } },
    });

    return NextResponse.json({
      employeeId,
      metrics: {
        claimed, inProgress, processed, confirmed, rejected, noAnswer,
        followUpsCompleted: followUpsDue,
        avgAttemptsPerOrder: avgAttempts,
        avgConfirmationHours: avgConfirmHours,
        confirmationRate, // confirmed/processed % — NEW untouched not counted
        pendingWorkload: inProgress,
        today: { confirmedToday, rejectedToday, contactedToday, noAnswerToday },
      },
      definitions: {
        processed: 'orders that reached CONFIRMED or REJECTED (untouched NEW not counted)',
        confirmationRate: 'confirmed / processed',
      },
    });
  } catch (error: any) {
    return apiErrorResponse(error);
  }
}
