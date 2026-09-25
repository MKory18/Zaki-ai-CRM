import { NextResponse } from 'next/server';
import { notify } from '@/lib/notify';
import { db } from '@/lib/db';
import { requireContext } from '@/lib/geo-context';
import { assertOrderAccess } from '@/lib/rbac';
import {
  isValidTransition, REJECTION_REASONS, FOLLOW_UP_REASONS,
  CONFIRMATION_STATUSES, type ConfirmationStatus,
} from '@/lib/confirmation-workflow';
import { logAudit } from '@/lib/audit';
import { apiError } from '@/lib/api-error';
import { can, authorize } from '@/lib/authorization';
import { assertCancellable, type StateSource } from '@/lib/order-state';
import { releaseOrderLines, reserveOrderLines } from '@/lib/reservation';
import { emitAppEvent } from '@/lib/apps/events';
import { queueConversions } from '@/lib/conversions/emit';

/**
 * POST /api/orders/[id]/confirmation — controlled confirmation workflow action.
 *
 * Body: {
 *   action: 'start' | 'contact_result' | 'confirm' | 'reject' | 'cancel' | 'schedule_follow_up' | 'resolve_follow_up'
 *   result?:        contact result (for contact_result)
 *   contactMethod?: for contact_result
 *   note?:          optional/required note
 *   nextFollowUpAt?: required for follow-up/postpone scheduling
 *   followUpReason?: structured follow-up reason
 *   rejectionReason?: structured reason (required for reject)
 *   expectedVersion: optimistic concurrency (mandatory — the version the client loaded)
 * }
 *
 * All transitions validated server-side; SUPER_ADMIN override requires reason + audit.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { user, companyId, storeId, country } = await requireContext();

    // Confirmation status authority (scope evaluated against the loaded order)
    const access = await assertOrderAccess(id, user, { companyId, storeId }, 'orders.view');
    if (!access.allowed) {
      const map = { NOT_FOUND: 404, WRONG_COMPANY: 404, NOT_ASSIGNED: 403 } as const;
      return NextResponse.json({ error: 'Order not found or not assigned to you' }, { status: map[access.reason] });
    }
    const order = access.order;

    const confirmAuth = authorize(user, 'orders.confirm', order);
    if (!confirmAuth.allowed) {
      return NextResponse.json({ error: 'Forbidden: you are not allowed to change confirmation status' }, { status: 403 });
    }

    // ── Editing-lock enforcement: an ACTIVE foreign lock blocks edits ──
    // (users with orders.unlock may bypass, same as the generic PATCH)
    const lockActive =
      order.lockedById &&
      order.lockExpiresAt &&
      new Date(order.lockExpiresAt).getTime() > Date.now();
    if (lockActive && order.lockedById !== user.id && !can(user, 'orders.unlock')) {
      const holder = await db.user.findUnique({ where: { id: order.lockedById! }, select: { name: true } });
      return NextResponse.json(
        {
          error: `This order is currently being edited by ${holder?.name ?? 'another user'}.`,
          errorAr: `هذا الطلب يتم تعديله حالياً بواسطة ${holder?.name ?? 'مستخدم آخر'}.`,
          code: 'ORDER_LOCKED',
          locked: true,
          lockedBy: holder?.name ?? null,
        },
        { status: 423 }
      );
    }

    const body = await req.json();
    const {
      action, result, note, nextFollowUpAt, followUpReason, preferredTime,
      rejectionReason, rejectionNote, expectedVersion,
    } = body as {
      action?: string; result?: string; contactMethod?: string; note?: string;
      nextFollowUpAt?: string; followUpReason?: string; preferredTime?: string;
      rejectionReason?: string; rejectionNote?: string; expectedVersion?: number;
    };

    if (!action) return NextResponse.json({ error: 'action is required' }, { status: 400 });

    const from = order.confirmationStatus as ConfirmationStatus;
    const now = new Date();

    // ── Action → target status + validation ──
    let target: ConfirmationStatus | null = null;
    const updateData: Record<string, unknown> = {};

    switch (action) {
      case 'start': {
        // Claimed owner may mark processing
        if (from !== 'NEW') {
          return NextResponse.json({ error: `Cannot start from status ${from}` }, { status: 400 });
        }
        if (order.claimedById !== user.id && !authorize(user, 'orders.edit', order).allowed) {
          return NextResponse.json({ error: 'Forbidden: claim the order first' }, { status: 403 });
        }
        target = 'IN_PROGRESS';
        break;
      }
      case 'contact_result': {
        // Records result on the attempt just logged; updates workflow state
        if (!result || !['ANSWERED', 'NO_ANSWER', 'BUSY', 'WRONG_NUMBER', 'CALLBACK_REQUESTED', 'OTHER'].includes(result)) {
          return NextResponse.json({ error: 'Invalid contact result for workflow update' }, { status: 400 });
        }
        if (result === 'ANSWERED') target = 'IN_PROGRESS';
        else if (result === 'NO_ANSWER') target = 'NO_ANSWER';
        else if (result === 'BUSY') target = 'NO_ANSWER';
        else if (result === 'WRONG_NUMBER') target = 'NO_ANSWER';
        else if (result === 'CALLBACK_REQUESTED') target = 'FOLLOW_UP_REQUIRED';
        else target = 'FOLLOW_UP_REQUIRED';
        break;
      }
      case 'confirm': {
        target = 'CONFIRMED';
        break;
      }
      case 'reject': {
        target = 'REJECTED';
        if (!rejectionReason || !(REJECTION_REASONS as readonly string[]).includes(rejectionReason)) {
          return NextResponse.json({ error: 'A structured rejection reason is required' }, { status: 400 });
        }
        if (rejectionReason === 'OTHER' && (!note || note.trim().length < 5)) {
          return NextResponse.json({ error: 'OTHER rejection requires a note (min 5 chars)' }, { status: 400 });
        }
        updateData.rejectionReason = rejectionReason;
        updateData.rejectionNote = rejectionNote?.trim() || null;
        break;
      }
      case 'schedule_follow_up': {
        target = nextFollowUpTarget(from);
        if (!target) {
          return NextResponse.json({ error: `Cannot schedule follow-up from status ${from}` }, { status: 400 });
        }
        break;
      }
      case 'resolve_follow_up': {
        // Any active employee on the order resolves the pending follow-up
        if (!order.nextFollowUpAt || order.followUpStatus === 'COMPLETED' || order.followUpStatus === 'CANCELLED') {
          return NextResponse.json({ error: 'No active follow-up to resolve' }, { status: 400 });
        }
        break;
      }
      case 'cancel': {
        // Authorized cancellation — SUPER_ADMIN override style
        if (!can(user, 'orders.unlock')) {
          return NextResponse.json({ error: 'Forbidden: only administrators may cancel orders' }, { status: 403 });
        }
        // No cancellation after SHIPPED — it becomes a cancel request and
        // ends as RETURNED with a reason (contract invariant 4).
        const cancellable = assertCancellable(order as StateSource);
        if (!cancellable.allowed) {
          return NextResponse.json(
            { error: cancellable.message, errorAr: cancellable.message, code: cancellable.code },
            { status: 409 }
          );
        }
        if (!note || note.trim().length < 5) {
          return NextResponse.json({ error: 'Cancellation requires a reason (min 5 chars)' }, { status: 400 });
        }
        target = 'CANCELLED';
        break;
      }
      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }

    // Follow-up scheduling validation (POSTPONED / FOLLOW_UP_REQUIRED / future contact)
    const followUpDate: Date | null = null;
    if (action === 'schedule_follow_up' || (action === 'contact_result' && nextFollowUpAt)) {
      if (nextFollowUpAt) {
        const d = new Date(nextFollowUpAt);
        if (isNaN(d.getTime())) return NextResponse.json({ error: 'Invalid nextFollowUpAt' }, { status: 400 });
        if (d.getTime() < now.getTime() - 60_000) {
          return NextResponse.json({ error: 'nextFollowUpAt must be in the future (server time)' }, { status: 400 });
        }
        updateData.nextFollowUpAt = d;
        // Postpone details the confirmation screen shows back to the agent:
        // when the customer asked for, and how often they have asked.
        if (target === 'POSTPONED') {
          updateData.postponedUntil = d;
          updateData.postponeCount = { increment: 1 };
          if (typeof preferredTime === 'string' && preferredTime.trim()) {
            updateData.postponePreferredTime = preferredTime.trim().slice(0, 40);
          }
        }
        updateData.followUpStatus = 'SCHEDULED';
        updateData.followUpReason =
          followUpReason && (FOLLOW_UP_REASONS as readonly string[]).includes(followUpReason)
            ? followUpReason
            : 'OTHER';
      } else if (target === 'POSTPONED' || target === 'FOLLOW_UP_REQUIRED') {
        return NextResponse.json(
          { error: 'nextFollowUpAt is required for postponing or follow-up' }, { status: 400 }
        );
      }
    }

    // ── Transition validation (backend-enforced; frontend is UX only) ──
    // Self-transitions (from === to) are allowed for re-scheduling semantics —
    // e.g. re-postponing an already POSTPONED order must not 409.
    if (target && !isValidTransition(from, target) && from !== target) {
      // SUPER_ADMIN override path requires reason; recorded as workflow override
      const isOverride = can(user, 'orders.unlock') && note && note.trim().length >= 5;
      if (!isOverride) {
        return NextResponse.json(
          {
            error: `Invalid workflow transition: ${from} → ${target}`,
            errorAr: `انتقال غير صالح في سير العمل: ${from} → ${target}`,
            code: 'INVALID_TRANSITION',
          },
          { status: 409 }
        );
      }
    }

    // ── Optimistic concurrency: expectedVersion is MANDATORY (same as PATCH) ──
    // Omitting it would silently disable lost-update protection on this write.
    if (typeof expectedVersion !== 'number') {
      return NextResponse.json(
        {
          error: 'expectedVersion is required for confirmation updates.',
          errorAr: 'يلزم تمرير رقم النسخة (expectedVersion) لتحديث حالة التأكيد.',
          code: 'VERSION_REQUIRED',
        },
        { status: 400 }
      );
    }
    const versionGuard = { version: expectedVersion };

    // ── Compose the update ──
    if (target) updateData.confirmationStatus = target;
    // Keep legacy combined status synchronized for list compatibility
    if (target === 'CONFIRMED') {
      updateData.status = 'CONFIRMED';
      updateData.confirmedAt = order.confirmedAt ?? now;
      updateData.confirmedById = user.id;
    } else if (target === 'REJECTED') {
      updateData.status = 'REJECTED';
    } else if (target === 'CANCELLED') {
      updateData.status = 'CANCELLED';
    }

    // Terminal decisions resolve any pending follow-up — folded into the same
    // update/transaction instead of a second unguarded write.
    if ((action === 'confirm' || action === 'reject') &&
        order.nextFollowUpAt && (!order.followUpStatus || order.followUpStatus === 'SCHEDULED')) {
      updateData.followUpStatus = 'COMPLETED';
      updateData.followUpResolvedAt = now;
      updateData.followUpResolvedById = user.id;
    }

    updateData.version = { increment: 1 };

    const updated = await db.$transaction(async (tx) => {
      const res = await tx.order.updateMany({
        where: { id, companyId, ...versionGuard },
        data: updateData,
      });
      if (res.count !== 1) {
        throw new Error('VERSION_CONFLICT: This order was updated by another user. Please refresh before saving.');
      }

      // ── Reservation follows the decision, inside THIS transaction ──
      // Confirming reserves every line; rejecting or cancelling releases
      // them, so stock is never held by a dead order.
      if (target === 'CONFIRMED') {
        await reserveOrderLines(tx, id, { allowNegativeStock: country.allowNegativeStock });
      } else if (target === 'REJECTED' || target === 'CANCELLED') {
        await releaseOrderLines(tx, id);
      }

      // ── Logs: StatusLog (always on transition) + Activity ──
      if (target && target !== from) {
        await tx.orderStatusLog.create({
          data: {
            companyId, orderId: id, statusType: 'CONFIRMATION',
            previousValue: from, newValue: target,
            changedById: user.id, changedByRole: user.role,
            note: note?.trim() || rejectionReason || null,
          },
        });
        await tx.orderActivity.create({
          data: {
            companyId, orderId: id, userId: user.id,
            action: 'STATUS_CHANGED', previousStatus: from, newStatus: target,
            metadata: JSON.stringify({ by: user.name, role: user.role, workflow: 'CONFIRMATION' }),
          },
        });
      }
      return res;
    });
    void updated;
    await logAudit({
      companyId, userId: user.id,
      action: target === 'CONFIRMED' ? 'ORDER_CONFIRMED' : target === 'REJECTED' ? 'ORDER_REJECTED' : 'CONFIRMATION_WORKFLOW_ACTION',
      entity: 'Order', entityId: id,
      previousData: { confirmationStatus: from, nextFollowUpAt: order.nextFollowUpAt },
      newData: { confirmationStatus: target, rejectionReason, followUpReason, action },
    });

    const fresh = await db.order.findUnique({ where: { id } });

    // Tell the installed apps, after the commit. Confirming is when a lead
    // becomes an order somebody will act on, which is the moment most
    // integrations actually care about.
    if (target === 'CONFIRMED' || target === 'CANCELLED') {
      await emitAppEvent(companyId, target === 'CONFIRMED' ? 'order.confirmed' : 'order.cancelled', {
        orderId: id,
        orderNumber: fresh?.orderNumber ?? null,
        confirmationStatus: target,
        previousStatus: from,
        total: Number(fresh?.totalAmount ?? 0),
        currency: fresh?.currency ?? null,
      });
    }

    // A confirmed order is the seller's second choice of conversion moment:
    // truer than a form submission, and still not money in hand.
    if (target === 'CONFIRMED') {
      await queueConversions(companyId, 'order.confirmed', id);
    }

    // A confirmation outcome goes to this store's confirmation supervisors
    // and to the moderator who entered the order (their commission rides on
    // it), never to the agent who just decided it. After commit; never
    // throws.
    if (target && (target === 'CONFIRMED' || target === 'REJECTED' || target === 'CANCELLED')) {
      notify({
        companyId,
        storeId: order.storeId ?? storeId,
        audience: { permission: 'confirmation.supervise', userIds: [order.moderatorId] },
        actorId: user.id,
        title: target === 'CONFIRMED' ? 'تأكيد طلب' : target === 'REJECTED' ? 'رفض طلب' : 'إلغاء طلب',
        message: `الطلب #${order.orderNumber} أصبح بالحالة ${target} بواسطة ${user.name}.`,
        type: 'SYSTEM_ALERT',
        link: '/orders',
      });
    }

    return NextResponse.json({ success: true, order: fresh });
  } catch (error: any) {
    if (error?.message?.startsWith('VERSION_CONFLICT')) {
      return NextResponse.json(
        {
          error: 'This order was updated by another user. Please refresh before saving.',
          errorAr: 'تم تعديل هذا الطلب بواسطة مستخدم آخر. يرجى تحديث الصفحة قبل الحفظ.',
          code: 'VERSION_CONFLICT',
        },
        { status: 409 }
      );
    }
    const { body, status } = apiError(error);
    return NextResponse.json(body, { status });
  }
}

/**
 * Where an order lands when a callback is scheduled on it.
 *
 * An order already waiting on a follow-up used to land NOWHERE: the map
 * returned null for FOLLOW_UP_REQUIRED and the agent got "Cannot schedule
 * follow-up from status FOLLOW_UP_REQUIRED". But moving the date is the
 * most ordinary thing on this desk — she calls, the customer says "tomorrow
 * instead", and the system refused to write the new date.
 *
 * So both waiting states re-schedule onto themselves. POSTPONED already
 * did; FOLLOW_UP_REQUIRED now does too, and the route allows a
 * self-transition precisely for this.
 */
function nextFollowUpTarget(from: ConfirmationStatus): ConfirmationStatus | null {
  if (from === 'NEW' || from === 'IN_PROGRESS') return 'POSTPONED';
  if (from === 'NO_ANSWER') return 'FOLLOW_UP_REQUIRED';
  if (from === 'POSTPONED') return 'POSTPONED';                     // re-schedule
  if (from === 'FOLLOW_UP_REQUIRED') return 'FOLLOW_UP_REQUIRED';   // re-schedule
  return null;
}
