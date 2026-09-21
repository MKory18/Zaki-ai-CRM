import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireContext } from '@/lib/geo-context';
import { can, requirePermission } from '@/lib/authorization';
import { apiErrorResponse } from '@/lib/api-error';
import { POSTPONE_LEAD_DAYS } from '@/lib/confirmation-queue';

/**
 * GET /api/confirmation/postponed — orders waiting on a date, with that
 * date, days remaining, preferred time, reason and postpone count.
 * Only rows due within the lead days are actionable, and the server says
 * which: the UI does not compute the window.
 */
export async function GET() {
  try {
    const { user, companyId, storeId } = await requireContext();
    await requirePermission('confirmation.work').catch(async () => requirePermission('confirmation.supervise'));

    const supervisor = can(user, 'confirmation.supervise');
    const now = new Date();
    const leadEnd = new Date(now.getTime() + POSTPONE_LEAD_DAYS * 24 * 60 * 60 * 1000);

    const rows = await db.order.findMany({
      where: {
        companyId,
        storeId,
        // Everything waiting on a date, not only the POSTPONED state.
        //
        // Pressing «تأجيل» on an order that had not been called yet used to
        // set FOLLOW_UP_REQUIRED, and this screen asked for POSTPONED only —
        // so the order the agent had just postponed never appeared on the
        // postponed screen. To her, "I will get back to this on Thursday" is
        // one idea; which of the two states the workflow recorded is not
        // something she should have to know.
        confirmationStatus: { in: ['POSTPONED', 'FOLLOW_UP_REQUIRED'] },
        ...(supervisor ? {} : { claimedById: user.id }),
      },
      orderBy: [{ postponedUntil: 'asc' }, { nextFollowUpAt: 'asc' }],
      take: 300,
      select: {
        id: true, orderNumber: true, merchantRef: true, totalAmount: true, currency: true,
        postponedUntil: true, postponePreferredTime: true, postponeCount: true,
        nextFollowUpAt: true, followUpReason: true, claimedById: true,
        customer: { select: { id: true, fullName: true, phone: true, city: true } },
        claimer: { select: { id: true, name: true } },
      },
    });

    const orders = rows.map((o) => {
      const due = o.postponedUntil ?? o.nextFollowUpAt;
      const daysRemaining = due ? Math.ceil((new Date(due).getTime() - now.getTime()) / (24 * 60 * 60 * 1000)) : null;
      return {
        ...o,
        dueAt: due,
        daysRemaining,
        // Actionable only inside the lead window (overdue counts as actionable).
        actionable: !!due && new Date(due) <= leadEnd,
      };
    });

    return NextResponse.json({ leadDays: POSTPONE_LEAD_DAYS, count: orders.length, orders });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
