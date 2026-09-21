import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireContext } from '@/lib/geo-context';
import { consumeOrderStock } from '@/lib/stock-consumption';
import { assertOrderAccess } from '@/lib/rbac';
import {
  isValidShippingTransition, canEnterShipping, STATUS_TIMESTAMP,
  DELIVERY_FAILURE_REASONS, RETURN_REASONS, SHIPPING_STATUSES, type ShippingStatus,
} from '@/lib/shipping-workflow';
import { logAudit } from '@/lib/audit';
import { apiError } from '@/lib/api-error';
import { createNotification } from '@/lib/notification';
import { can, authorize } from '@/lib/authorization';
import { assertCancellable, assertReadyToShip, type StateSource } from '@/lib/order-state';
import { orderLinesForGuard } from '@/lib/reservation';

/**
 * POST /api/orders/[id]/shipping — controlled shipping workflow action.
 *
 * Body: {
 *   action: 'transition' | 'assign_provider' | 'assign_batch' | 'update_tracking'
 *   to?:                ShippingStatus (for transition)
 *   deliveryProviderId?: must belong to this company (server-verified)
 *   shippingBatchId?:    must belong to this company
 *   trackingNumber?:     string, updatable before SHIPPED only
 *   deliveryFee?:        number
 *   shippingNote?:       string
 *   deliveryFailureReason?: structured (required for FAILED_DELIVERY)
 *   returnReason?:       structured (required for RETURNED)
 *   expectedVersion?:    MANDATORY (Phase S rule)
 * }
 *
 * Server controls: companyId, assignedById, all timestamps, version increments.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { user, companyId, storeId, country } = await requireContext();

    // Order access first, then shipping authority evaluated against the order
    const access = await assertOrderAccess(id, user, { companyId, storeId }, 'orders.view');
    if (!access.allowed) {
      const map = { NOT_FOUND: 404, WRONG_COMPANY: 404, NOT_ASSIGNED: 403 } as const;
      return NextResponse.json({ error: 'Order not found or not assigned to you' }, { status: map[access.reason] });
    }
    const order = access.order;

    // Permission: shipping authority (scope evaluated against the loaded order)
    const shippingAuth = authorize(user, 'orders.change_status', order);
    if (!shippingAuth.allowed) {
      return NextResponse.json({ error: 'Forbidden: you are not allowed to change shipping status' }, { status: 403 });
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
      action, to, deliveryProviderId, shippingBatchId,
      trackingNumber, shippingReference, deliveryFee, shippingNote,
      deliveryFailureReason, returnReason, expectedVersion,
    } = body as {
      action?: string; to?: string; deliveryProviderId?: string; shippingBatchId?: string;
      trackingNumber?: string; shippingReference?: string; deliveryFee?: number; shippingNote?: string;
      deliveryFailureReason?: string; returnReason?: string; expectedVersion?: number;
    };

    if (!action) return NextResponse.json({ error: 'action is required' }, { status: 400 });
    if (typeof expectedVersion !== 'number') {
      return NextResponse.json({ error: 'expectedVersion is required', code: 'VERSION_REQUIRED' }, { status: 400 });
    }
    if (expectedVersion !== order.version) {
      return NextResponse.json(
        {
          error: 'This order was updated by another user. Please refresh before saving.',
          errorAr: 'تم تعديل هذا الطلب بواسطة مستخدم آخر. يرجى تحديث الصفحة قبل الحفظ.',
          code: 'VERSION_CONFLICT',
        },
        { status: 409 }
      );
    }

    const from = order.shippingStatus as ShippingStatus;
    const now = new Date();
    const updateData: Record<string, unknown> = {};
    let newShippingStatus: ShippingStatus | null = null;

    switch (action) {
      case 'transition': {
        if (!to) return NextResponse.json({ error: 'to is required for transition' }, { status: 400 });
        // Whitelist validation — enforced even on the override path
        if (!(SHIPPING_STATUSES as readonly string[]).includes(to)) {
          return NextResponse.json({ error: `Invalid shipping status: ${to}` }, { status: 400 });
        }
        newShippingStatus = to as ShippingStatus;

        // ── Confirmation dependency (Section 4): fail closed ──
        if (newShippingStatus !== 'CANCELLED' && !canEnterShipping(order.confirmationStatus)) {
          return NextResponse.json(
            {
              error: `Shipping requires a CONFIRMED order (current: ${order.confirmationStatus})`,
              errorAr: `الشحن يتطلب طلباً مؤكداً (الحالة الحالية: ${order.confirmationStatus})`,
              code: 'CONFIRMATION_REQUIRED',
            },
            { status: 409 }
          );
        }

        // ── No cancellation once the order has shipped (invariant 4) ──
        // Checked BEFORE the transition validator so the admin override path
        // cannot bypass it either.
        if (newShippingStatus === 'CANCELLED') {
          const cancellable = assertCancellable(order as StateSource);
          if (!cancellable.allowed) {
            return NextResponse.json(
              { error: cancellable.message, errorAr: cancellable.message, code: cancellable.code },
              { status: 409 }
            );
          }
        }

        // ── Controlled transitions (Section 3) ──
        if (!isValidShippingTransition(from, newShippingStatus)) {
          // SUPER_ADMIN override with reason
          const isOverride = can(user, 'orders.unlock') && shippingNote && shippingNote.trim().length >= 5;
          if (!isOverride) {
            return NextResponse.json(
              {
                error: `Invalid shipping transition: ${from} → ${newShippingStatus}`,
                errorAr: `انتقال شحن غير صالح: ${from} → ${newShippingStatus}`,
                code: 'INVALID_TRANSITION',
              },
              { status: 409 }
            );
          }
        }

        // ── A blocking change request stops OUR forward transitions ──
        // (courier webhook events are recorded regardless and mark the
        // request as changed during review — contract invariant 7.)
        const FORWARD = ['PACKING', 'READY_FOR_SHIPPING', 'READY_FOR_PICKUP', 'SHIPPED', 'OUT_FOR_DELIVERY'];
        if (FORWARD.includes(newShippingStatus)) {
          const pending = await db.orderChangeRequest.findFirst({
            where: { orderId: id, status: 'PENDING', blocking: true },
            select: { id: true, reason: true },
          });
          if (pending) {
            return NextResponse.json(
              {
                error: 'يوجد طلب تعديل قيد المراجعة على هذا الطلب',
                errorAr: 'يوجد طلب تعديل قيد المراجعة على هذا الطلب',
                code: 'CHANGE_REQUEST_PENDING',
                changeRequestId: pending.id,
              },
              { status: 409 }
            );
          }
        }

        // ── Reservation gate: one unreserved line blocks READY_TO_SHIP ──
        if (newShippingStatus === 'READY_FOR_SHIPPING' || newShippingStatus === 'READY_FOR_PICKUP') {
          const lines = await orderLinesForGuard(db, id);
          const ready = assertReadyToShip(order as StateSource, lines);
          if (!ready.allowed) {
            return NextResponse.json(
              { error: ready.message, errorAr: ready.message, code: ready.code },
              { status: 409 }
            );
          }
        }

        // Structured reasons
        if (newShippingStatus === 'FAILED_DELIVERY') {
          if (!deliveryFailureReason || !(DELIVERY_FAILURE_REASONS as readonly string[]).includes(deliveryFailureReason)) {
            return NextResponse.json({ error: 'A structured delivery failure reason is required' }, { status: 400 });
          }
          if (deliveryFailureReason === 'OTHER' && (!shippingNote || shippingNote.trim().length < 5)) {
            return NextResponse.json({ error: 'OTHER failure requires a note (min 5 chars)' }, { status: 400 });
          }
          updateData.deliveryFailureReason = deliveryFailureReason;
        }
        if (newShippingStatus === 'RETURN_REQUESTED' || newShippingStatus === 'RETURNED') {
          if (!returnReason || !(RETURN_REASONS as readonly string[]).includes(returnReason)) {
            return NextResponse.json({ error: 'A structured return reason is required' }, { status: 400 });
          }
          updateData.returnReason = returnReason;
        }

        updateData.shippingStatus = newShippingStatus;
        // Server-set timestamp (never client)
        const tsField = STATUS_TIMESTAMP[newShippingStatus];
        if (tsField) updateData[tsField] = now;
        // Legacy combined status sync for list compatibility
        if (newShippingStatus === 'SHIPPED') updateData.status = 'SHIPPED';
        if (newShippingStatus === 'DELIVERED') {
          updateData.status = 'DELIVERED';
          // Match the legacy PATCH behavior: delivery marks the COD collected
          updateData.settlementStatus = 'COLLECTED';
        }
        if (newShippingStatus === 'RETURNED') updateData.status = 'RETURNED';
        break;
      }

      case 'assign_provider': {
        if (!deliveryProviderId) return NextResponse.json({ error: 'deliveryProviderId is required' }, { status: 400 });
        // Tenant-validate the provider (Phase S rule)
        const provider = await db.deliveryProvider.findFirst({ where: { id: deliveryProviderId, companyId } });
        if (!provider) {
          return NextResponse.json({ error: 'Delivery provider not found in your company' }, { status: 404 });
        }
        updateData.deliveryProviderId = provider.id;
        updateData.deliveryAssignedAt = now;          // server timestamp
        updateData.deliveryAssignedById = user.id;    // server-derived actor
        break;
      }

      case 'assign_batch': {
        if (!shippingBatchId) return NextResponse.json({ error: 'shippingBatchId is required' }, { status: 400 });
        const batch = await db.shippingBatch.findFirst({ where: { id: shippingBatchId, companyId, storeId } });
        if (!batch) {
          return NextResponse.json({ error: 'Shipping batch not found in your company' }, { status: 404 });
        }
        updateData.shippingBatchId = batch.id;
        break;
      }

      case 'update_tracking': {
        // Tracking is modifiable BEFORE shipment only (Section 7)
        if (['SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'FAILED_DELIVERY', 'RETURN_REQUESTED', 'RETURNED'].includes(from)) {
          return NextResponse.json({ error: 'Tracking cannot be modified after shipment' }, { status: 409 });
        }
        if (trackingNumber !== undefined) {
          const tn = trackingNumber.trim();
          if (tn) {
            // Uniqueness within company scope
            const clash = await db.order.findFirst({ where: { companyId, trackingNumber: tn, id: { not: id } } });
            if (clash) return NextResponse.json({ error: 'Tracking number already used in your company' }, { status: 409 });
            updateData.trackingNumber = tn;
          } else {
            updateData.trackingNumber = null;
          }
        }
        if (shippingReference !== undefined) updateData.shippingReference = (shippingReference as string).trim() || null;
        if (deliveryFee !== undefined) updateData.deliveryFee = Number(deliveryFee) || 0;
        break;
      }

      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }

    if (shippingNote !== undefined && action !== 'transition') {
      updateData.shippingNote = shippingNote.trim() || null;
    } else if (action === 'transition' && shippingNote) {
      updateData.shippingNote = shippingNote.trim();
    }

    updateData.version = { increment: 1 };

    // Atomic versioned save.
    //
    // Delivery consumes stock in the SAME transaction as the status change.
    // It used to consume nothing at all: the reservation was released the
    // moment the order left the open set, the batch kept its full remainder,
    // and the unit went quietly back on sale. Doing it here means there is
    // no instant in which an order is delivered and its goods are still
    // available to somebody else.
    let consumption: { taken: number; short: number; alreadyDone: boolean } | null = null;

    const saved = await db.$transaction(async (tx) => {
      const res = await tx.order.updateMany({
        where: { id, companyId, version: expectedVersion },
        data: updateData,
      });
      if (res.count !== 1) return res;

      if (newShippingStatus === 'DELIVERED' || newShippingStatus === 'PARTIALLY_DELIVERED') {
        consumption = await consumeOrderStock(tx, {
          orderId: id,
          companyId,
          allowNegativeStock: country.allowNegativeStock,
          userId: user.id,
        });
      }
      return res;
    });

    if (saved.count !== 1) {
      return NextResponse.json(
        {
          error: 'This order was updated by another user. Please refresh before saving.',
          errorAr: 'تم تعديل هذا الطلب بواسطة مستخدم آخر. يرجى تحديث الصفحة قبل الحفظ.',
          code: 'VERSION_CONFLICT',
        },
        { status: 409 }
      );
    }

    // ── Logs: OrderStatusLog + OrderActivity + Audit (Section 21) ──
    if (newShippingStatus && newShippingStatus !== from) {
      await db.orderStatusLog.create({
        data: {
          companyId, orderId: id, statusType: 'SHIPPING',
          previousValue: from, newValue: newShippingStatus,
          changedById: user.id, changedByRole: user.role,
          note: shippingNote?.trim() || deliveryFailureReason || returnReason || null,
        },
      });
      await db.orderActivity.create({
        data: {
          companyId, orderId: id, userId: user.id,
          action: 'SHIPPING_STATUS_CHANGED', previousStatus: from, newStatus: newShippingStatus,
          metadata: JSON.stringify({
            by: user.name, role: user.role,
            provider: deliveryProviderId || order.deliveryProviderId || null,
            note: shippingNote || null,
          }),
        },
      });
    }
    if (action === 'assign_provider') {
      await db.orderActivity.create({
        data: {
          companyId, orderId: id, userId: user.id, action: 'SHIPPING_UPDATED',
          metadata: JSON.stringify({ by: user.name, providerAssigned: deliveryProviderId }),
        },
      });
    }
    await logAudit({
      companyId, userId: user.id,
      action: newShippingStatus ? 'SHIPPING_STATUS_CHANGED' : 'SHIPPING_INFO_UPDATED',
      entity: 'Order', entityId: id,
      previousData: { shippingStatus: from, trackingNumber: order.trackingNumber },
      newData: { shippingStatus: newShippingStatus, action, by: user.name },
    });

    // Notify company managers on failed delivery — after commit, non-fatal
    if (newShippingStatus === 'FAILED_DELIVERY' && newShippingStatus !== from) {
      try {
        await createNotification({
          companyId,
          userId: null,
          title: 'فشل التوصيل',
          message: `فشل توصيل الطلب #${order.orderNumber}.`,
          type: 'SYSTEM_ALERT',
          link: '/orders',
        });
      } catch (e) {
        console.error('FAILED_DELIVERY notification failed (non-fatal):', e);
      }
    }

    const fresh = await db.order.findUnique({
      where: { id },
      include: {
        deliveryProvider: { select: { id: true, name: true, code: true, phone: true } },
        shippingBatch: { select: { id: true, batchNumber: true } },
      },
    });
    return NextResponse.json({ success: true, order: fresh });
  } catch (error) {
    const { body, status } = apiError(error);
    return NextResponse.json(body, { status });
  }
}
