import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireCompanyTenant } from '@/lib/auth';
import { assertOrderAccess } from '@/lib/rbac';
import { isValidTransition, CONTACT_RESULTS } from '@/lib/confirmation-workflow';
import { logAudit } from '@/lib/audit';
import { apiError } from '@/lib/api-error';
import { can, authorize } from '@/lib/authorization';

/**
 * POST /api/orders/[id]/call-logs — record a call + optionally drive workflow.
 *
 * SECURITY (Phase S):
 *  - Permission required: orders.edit with scope evaluation
 *    (ASSIGNED scope enforces own-assignment).
 *  - Order access via assertOrderAccess (company isolation + role assignment scope).
 *  - Status changes here follow the SAME controlled transition map as the
 *    confirmation workflow — a call log can no longer bypass separation of duties.
 *  - moderatorId on the log is ALWAYS the authenticated user (server-derived).
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { user, companyId } = await requireCompanyTenant();

    // Order access first, then editing authority evaluated against the order
    const access = await assertOrderAccess(id, user, companyId, 'orders.view');
    if (!access.allowed) {
      const map = { NOT_FOUND: 404, WRONG_COMPANY: 404, NOT_ASSIGNED: 403 } as const;
      return NextResponse.json({ error: 'Order not found or not assigned to you' }, { status: map[access.reason] });
    }
    const order = access.order;

    // Permission: callers must have order-edit authority (scope-evaluated)
    const editAuth = authorize(user, 'orders.edit', order);
    if (!editAuth.allowed) {
      // Secure policy: out-of-scope/other-tenant orders are reported as missing
      if (editAuth.reason === 'NO_TENANT') {
        return NextResponse.json({ error: 'Order not found' }, { status: 404 });
      }
      return NextResponse.json({ error: 'Forbidden: cannot record calls' }, { status: 403 });
    }

    const body = await req.json();
    const { result, notes, nextFollowUpDate, callDate } = body;

    // Whitelisted result values only (CONTACT_RESULTS + POSTPONED used by the UI)
    const ALLOWED_CALL_RESULTS = [...CONTACT_RESULTS, 'POSTPONED'] as string[];
    if (!result || !ALLOWED_CALL_RESULTS.includes(result)) {
      return NextResponse.json({ error: 'Call Result is required' }, { status: 400 });
    }

    // Optional structured fields — validated before use
    let nextFollowUp: Date | null = null;
    if (nextFollowUpDate !== undefined && nextFollowUpDate !== null && nextFollowUpDate !== '') {
      nextFollowUp = new Date(nextFollowUpDate);
      if (isNaN(nextFollowUp.getTime())) {
        return NextResponse.json({ error: 'Invalid nextFollowUpDate' }, { status: 400 });
      }
    }
    let callAt = new Date();
    if (callDate !== undefined && callDate !== null && callDate !== '') {
      callAt = new Date(callDate);
      if (isNaN(callAt.getTime())) {
        return NextResponse.json({ error: 'Invalid callDate' }, { status: 400 });
      }
    }

    // ── Workflow status mapping — now VALIDATED like the confirmation workflow ──
    let mappedStatus: string | null = null;
    if (result === 'CONFIRMED') mappedStatus = 'CONFIRMED';
    else if (result === 'REJECTED') mappedStatus = 'REJECTED';
    else if (result === 'POSTPONED') mappedStatus = 'POSTPONED';
    else if (result === 'NO_ANSWER' || result === 'BUSY' || result === 'WRONG_NUMBER') mappedStatus = 'NO_ANSWER';
    else if (result === 'CALLBACK_REQUESTED') mappedStatus = 'CONTACTING';

    const statusWillChange = !!(mappedStatus && mappedStatus !== order.status);
    if (statusWillChange) {
      // Separation of duties: status change requires confirmation authority —
      // the call is still recorded, but the order status is NOT changed.
      if (!authorize(user, 'orders.confirm', order).allowed) {
        const log = await db.$transaction(async (tx) => {
          const created = await tx.callLog.create({
            data: {
              companyId,
              orderId: id,
              moderatorId: user.id,
              callDate: callAt,
              result,
              notes: notes?.trim() || null,
              nextFollowUpDate: nextFollowUp,
            },
          });
          await tx.orderActivity.create({
            data: {
              companyId, orderId: id, userId: user.id, action: 'CALL_MADE',
              metadata: JSON.stringify({ callResult: result, notes: notes || '', caller: user.name, statusChangeBlocked: true }),
            },
          });
          return created;
        });
        return NextResponse.json({
          success: true,
          callLog: log,
          warning: 'Call recorded. Status change requires confirmation permission.',
        });
      }

      // Scope already enforced by authorize('orders.edit', order) above
      // (ASSIGNED scope only passes for orders the user owns/claimed/assigned).

      // Workflow transition validation (same rules as the confirmation API).
      // The legacy combined status is mapped from confirmationStatus equivalents;
      // legacy values (CONTACTING) are logged but skip the strict map.
      const confirmEquiv = mappedStatus === 'CONTACTING' ? null : mappedStatus;
      if (confirmEquiv && !isValidTransition(order.confirmationStatus, confirmEquiv)) {
        return NextResponse.json(
          {
            error: `Invalid workflow transition: ${order.confirmationStatus} → ${confirmEquiv}`,
            errorAr: `انتقال غير صالح في سير العمل: ${order.confirmationStatus} → ${confirmEquiv}`,
            code: 'INVALID_TRANSITION',
          },
          { status: 409 }
        );
      }
    }

    const statusLogData =
      statusWillChange && mappedStatus && mappedStatus !== 'CONTACTING'
        ? {
            companyId, orderId: id, statusType: 'CONFIRMATION',
            previousValue: order.confirmationStatus, newValue: mappedStatus,
            changedById: user.id, changedByRole: user.role,
            note: notes?.trim() || null,
          }
        : null;

    const callLog = await db.$transaction(async (tx) => {
      // 1. The call log itself
      const log = await tx.callLog.create({
        data: {
          companyId,           // session-derived
          orderId: id,
          moderatorId: user.id, // server-derived — never trusted from client
          callDate: callAt,
          result,
          notes: notes?.trim() || null,
          nextFollowUpDate: nextFollowUp,
        },
      });

      if (statusWillChange && mappedStatus) {
        // 2. Versioned order update with mapped workflow fields
        const versioned = await tx.order.updateMany({
          where: { id, version: order.version },
          data: {
            status: mappedStatus,
            ...(mappedStatus === 'CONFIRMED'
              ? { confirmedAt: new Date(), confirmationStatus: 'CONFIRMED', confirmedById: user.id, version: { increment: 1 } }
              : mappedStatus === 'REJECTED'
              ? { confirmationStatus: 'REJECTED', rejectionReason: 'OTHER', rejectionNote: notes?.trim() || null, moderatorCommission: 0, version: { increment: 1 } }
              : mappedStatus === 'POSTPONED' && nextFollowUp
              ? { confirmationStatus: 'POSTPONED', postponedUntil: nextFollowUp, nextFollowUpAt: nextFollowUp, followUpStatus: 'SCHEDULED', followUpReason: 'POSTPONED', version: { increment: 1 } }
              : mappedStatus === 'NO_ANSWER'
              ? { confirmationStatus: 'NO_ANSWER', version: { increment: 1 } }
              : { version: { increment: 1 } }),
          },
        });
        if (versioned.count !== 1) {
          throw new Error('VERSION_CONFLICT: This order was updated by another user. Please refresh before saving.');
        }

        // 3. Activity
        await tx.orderActivity.create({
          data: {
            companyId,
            orderId: id,
            userId: user.id,
            action: 'CALL_MADE',
            previousStatus: order.status,
            newStatus: mappedStatus,
            metadata: JSON.stringify({ callResult: result, notes: notes || '', caller: user.name }),
          },
        });

        // 4. Status log
        if (statusLogData) {
          await tx.orderStatusLog.create({ data: statusLogData });
        }

        await logAudit({
          companyId, userId: user.id, action: 'ORDER_STATUS_CHANGED', entity: 'Order', entityId: id,
          previousData: { status: order.status }, newData: { status: mappedStatus, via: 'call-log', caller: user.name },
        });
      } else {
        await tx.orderActivity.create({
          data: {
            companyId,
            orderId: id,
            userId: user.id,
            action: 'CALL_MADE',
            metadata: JSON.stringify({ callResult: result, notes: notes || '', caller: user.name }),
          },
        });
      }

      return log;
    });

    return NextResponse.json({ success: true, callLog });
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
