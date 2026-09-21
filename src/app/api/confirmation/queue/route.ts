import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireContext } from '@/lib/geo-context';
import { can, requirePermission } from '@/lib/authorization';
import { apiErrorResponse } from '@/lib/api-error';
import {
  CLAIM_CAPS,
  ownedCounts,
  pullRefusal,
  releaseStaleClaims,
  waitingCount,
  POSTPONE_LEAD_DAYS,
} from '@/lib/confirmation-queue';

/**
 * GET /api/confirmation/queue
 *
 * Agents get NO list — a waiting counter and whether they may pull. Only
 * supervisors (confirmation.supervise) receive the rows, and they are the
 * same data, never a different query.
 */
export async function GET() {
  try {
    const { user, companyId, storeId, country } = await requireContext();
    await requirePermission('confirmation.pull').catch(async () => requirePermission('confirmation.supervise'));

    const scope = { companyId, storeId };
    const cal = {
      workHoursStart: country.workHoursStart,
      workHoursEnd: country.workHoursEnd,
      weekendDays: country.weekendDays,
      timezone: country.timezone,
    };
    const released = await releaseStaleClaims(db, scope, cal);

    const [waiting, counts] = await Promise.all([waitingCount(db, scope), ownedCounts(db, scope, user.id)]);
    const refusal = pullRefusal(counts);

    const isSupervisor = can(user, 'confirmation.supervise');
    const rows = isSupervisor
      ? await db.order.findMany({
          where: { ...scope, claimedById: null, confirmationStatus: { in: ['NEW', 'IN_PROGRESS', 'NO_ANSWER', 'FOLLOW_UP_REQUIRED', 'POSTPONED'] }, shippingStatus: 'NOT_READY' },
          orderBy: [{ postponedUntil: 'asc' }, { createdAt: 'asc' }],
          take: 200,
          select: {
            id: true, orderNumber: true, merchantRef: true, createdAt: true,
            confirmationStatus: true, postponedUntil: true, postponeCount: true, totalAmount: true,
            customer: { select: { fullName: true, city: true } },
            product: { select: { name: true } },
          },
        })
      : null;

    return NextResponse.json({
      waiting,
      owned: counts,
      caps: CLAIM_CAPS,
      leadDays: POSTPONE_LEAD_DAYS,
      canPull: !refusal,
      refusal,
      autoReleased: released,
      // Agents never see the list; supervisors see the same rows as data.
      orders: rows,
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
