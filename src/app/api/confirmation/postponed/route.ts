import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireContext } from '@/lib/geo-context';
import { can, requirePermission } from '@/lib/authorization';
import { apiErrorResponse } from '@/lib/api-error';
import { logAudit } from '@/lib/audit';
import { POSTPONE_LEAD_DAYS } from '@/lib/confirmation-queue';
import { noteCustomersHandedOut } from '@/lib/pii-alert';

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

    // Contact details left the building; the tally is the person's, not
    // this screen's. See noteCustomersHandedOut.
    await noteCustomersHandedOut({ companyId, storeId, user, where: 'الطلبات المؤجّلة', rows: orders });

    return NextResponse.json({ leadDays: POSTPONE_LEAD_DAYS, count: orders.length, orders });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

/**
 * POST /api/confirmation/postponed — hand a due one back to the pool.
 *
 * A postponed order KEEPS ITS CLAIM. That is right while the date is far off
 * — the agent who spoke to the customer is the one who should ring back — and
 * wrong the moment it comes due: if she is off that day, or has moved on, the
 * order sits in a list nobody else can reach. The pool requires
 * `claimedById: null`, so nothing else in the product could pick it up.
 *
 * WHY NOT THE RELEASE THAT ALREADY EXISTS. `DELETE /api/orders/[id]/claim`
 * releases a claim, and it is wrong here twice: only the holder may call it,
 * and it sets the order back to `NEW` — which ERASES that it was ever
 * postponed. The whole point is that whoever pulls it next sees «this person
 * asked us to call on Thursday», with the date and how many times they have
 * asked. An order that arrives looking new is an order the next agent opens
 * cold.
 *
 * So the state is untouched. Only the hands change.
 */
export async function POST(req: Request) {
  try {
    const { user, companyId, storeId } = await requireContext();
    await requirePermission('confirmation.work').catch(async () => requirePermission('confirmation.supervise'));

    const { orderId } = (await req.json().catch(() => ({}))) as { orderId?: string };
    if (!orderId) return NextResponse.json({ error: 'المعرّف مطلوب' }, { status: 400 });

    const supervisor = can(user, 'confirmation.supervise');
    const now = new Date();
    const leadEnd = new Date(now.getTime() + POSTPONE_LEAD_DAYS * 24 * 60 * 60 * 1000);

    const order = await db.order.findFirst({
      where: { id: orderId, companyId, storeId },
      select: {
        id: true, orderNumber: true, confirmationStatus: true, claimedById: true,
        postponedUntil: true, nextFollowUpAt: true, version: true,
      },
    });
    if (!order) return NextResponse.json({ error: 'الطلب غير موجود' }, { status: 404 });

    // Yours, or you supervise. Handing somebody else's order to the pool is
    // a decision about their work.
    if (!supervisor && order.claimedById !== user.id) {
      return NextResponse.json({ error: 'هذا الطلب ليس بين يديك' }, { status: 403 });
    }

    if (!['POSTPONED', 'FOLLOW_UP_REQUIRED'].includes(order.confirmationStatus)) {
      return NextResponse.json({ error: 'هذا الطلب ليس مؤجَّلاً' }, { status: 409 });
    }

    /**
     * ONLY WHEN IT IS DUE.
     *
     * A customer who asked to be called in three weeks has not been called
     * yet for a reason. Putting that order in front of the next free agent
     * today makes the one promise the postpone existed to keep into the one
     * thing we break — and the agent who pulls it can do nothing but postpone
     * it again.
     */
    const due = order.postponedUntil ?? order.nextFollowUpAt;
    if (!due || due.getTime() > leadEnd.getTime()) {
      return NextResponse.json(
        {
          error: `موعده لم يحن بعد — يعود إلى الطابور قبل موعده بـ${POSTPONE_LEAD_DAYS} يومين`,
          code: 'NOT_DUE',
        },
        { status: 409 }
      );
    }

    if (order.claimedById === null) {
      return NextResponse.json({ error: 'هذا الطلب في الطابور أصلاً', code: 'ALREADY_IN_QUEUE' }, { status: 409 });
    }

    const moved = await db.order.updateMany({
      where: { id: order.id, companyId, version: order.version },
      data: {
        // The hands change. The state does NOT: it is still postponed, still
        // due on the day the customer asked for, and `pullNext` looks for
        // exactly that and offers it first.
        claimedById: null,
        claimedAt: null,
        currentOwnerId: null,
        lockedById: null,
        lockedAt: null,
        version: { increment: 1 },
      },
    });
    if (moved.count !== 1) {
      return NextResponse.json(
        { error: 'تغيّر الطلب أثناء العمل عليه — حدّث الصفحة', code: 'VERSION_CONFLICT' },
        { status: 409 }
      );
    }

    await db.orderNote.create({
      data: {
        companyId,
        orderId: order.id,
        authorId: user.id,
        kind: 'follow_up',
        body: `أُعيد إلى الطابور قبل موعده (${due.toISOString().slice(0, 10)}) — ما زال مؤجَّلاً`,
      },
    });

    await logAudit({
      companyId,
      userId: user.id,
      action: 'POSTPONED_RETURNED_TO_QUEUE',
      entity: 'Order',
      entityId: order.id,
      previousData: { claimedById: order.claimedById },
      newData: { dueAt: due.toISOString(), by: user.name },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
