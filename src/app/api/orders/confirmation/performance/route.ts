import { NextResponse } from 'next/server';
import { apiErrorResponse } from '@/lib/api-error';
import { db } from '@/lib/db';
import { requireContext } from '@/lib/geo-context';
import { can } from '@/lib/authorization';
import { businessMinutesBetween } from '@/lib/business-calendar';
import { median } from '@/lib/team-performance';


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
    const { user, companyId, storeId, country } = await requireContext();
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
      storeId,
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
      db.order.count({ where: { companyId, storeId, confirmedById: employeeId, confirmationStatus: 'CONFIRMED' } }),
      // Rejected (claimed by this employee, terminal rejected)
      db.order.count({ where: mine({ confirmationStatus: 'REJECTED' }) }),
      // No-answer cases
      db.order.count({ where: mine({ confirmationStatus: 'NO_ANSWER' }) }),
      // Follow-ups completed by this employee
      db.order.count({ where: { companyId, storeId, followUpResolvedById: employeeId, followUpStatus: 'COMPLETED' } }),
      // Contact attempts by this employee (for avg attempts per order)
      db.orderContactAttempt.count({ where: { companyId, employeeId, order: { storeId } } }),
      // Orders confirmed WITH timestamps (for avg confirmation time)
      db.order.findMany({
        where: { companyId, storeId, confirmedById: employeeId, confirmedAt: { not: null }, claimedAt: { not: null } },
        select: { claimedAt: true, confirmedAt: true },
        take: 500,
        orderBy: { confirmedAt: 'desc' },
      }),
    ]);

    const processed = confirmed + rejected; // processed = reached a decision
    const confirmationRate = processed > 0 ? Number(((confirmed / processed) * 100).toFixed(1)) : null;
    const avgAttempts = claimed > 0 ? Number((attemptsAgg / claimed).toFixed(2)) : null;

    /**
     * How long it takes this person to confirm, in WORKING minutes.
     *
     * It used to be wall-clock hours, which charged an agent for every
     * night, weekend and holiday that happened to fall between pulling an
     * order and calling about it. An order claimed at five on a Thursday
     * and confirmed at ten on Saturday read as forty-one hours of somebody
     * being slow; it is one working hour.
     *
     * That also made this endpoint disagree with the team screen and the
     * performance score, which have always counted business minutes — two
     * numbers for one person's week, and an argument nobody could settle.
     * This is the reading that survives; the same calendar, the same
     * median, from the same function.
     */
    const calendar = {
      workHoursStart: country.workHoursStart,
      workHoursEnd: country.workHoursEnd,
      weekendDays: country.weekendDays,
      timezone: country.timezone,
    };
    const medianConfirmMinutes = median(
      confirmedWithTime.map((o) =>
        businessMinutesBetween(new Date(o.claimedAt!), new Date(o.confirmedAt!), calendar)
      )
    );

    // Today's action counts (claimed orders acted on today)
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const confirmedToday = await db.orderStatusLog.count({
      where: { companyId, order: { storeId }, changedById: employeeId, statusType: 'CONFIRMATION', newValue: 'CONFIRMED', createdAt: { gte: startOfToday } },
    });
    const rejectedToday = await db.orderStatusLog.count({
      where: { companyId, order: { storeId }, changedById: employeeId, statusType: 'CONFIRMATION', newValue: 'REJECTED', createdAt: { gte: startOfToday } },
    });
    const contactedToday = await db.orderContactAttempt.count({
      where: { companyId, order: { storeId }, employeeId, createdAt: { gte: startOfToday } },
    });
    const noAnswerToday = await db.orderStatusLog.count({
      where: { companyId, order: { storeId }, changedById: employeeId, statusType: 'CONFIRMATION', newValue: 'NO_ANSWER', createdAt: { gte: startOfToday } },
    });

    return NextResponse.json({
      employeeId,
      metrics: {
        claimed, inProgress, processed, confirmed, rejected, noAnswer,
        followUpsCompleted: followUpsDue,
        avgAttemptsPerOrder: avgAttempts,
        medianConfirmMinutes,
        confirmationRate, // confirmed/processed % — NEW untouched not counted
        pendingWorkload: inProgress,
        today: { confirmedToday, rejectedToday, contactedToday, noAnswerToday },
      },
      definitions: {
        processed: 'orders that reached CONFIRMED or REJECTED (untouched NEW not counted)',
        confirmationRate: 'confirmed / processed',
        medianConfirmMinutes:
          'typical WORKING minutes from claim to confirmation — the company calendar, not wall clock',
      },
    });
  } catch (error: any) {
    return apiErrorResponse(error);
  }
}
