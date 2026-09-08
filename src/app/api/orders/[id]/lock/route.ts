import { NextResponse } from 'next/server';
import { apiErrorResponse } from '@/lib/api-error';
import { db } from '@/lib/db';
import { requireCompanyTenant } from '@/lib/auth';
import { assertOrderAccess } from '@/lib/rbac';
import {
  atomicAcquireLock, atomicRenewLock, atomicReleaseLock, isLockActive, lockConfig,
} from '@/lib/order-locks';
import { logAudit } from '@/lib/audit';
import { can } from '@/lib/authorization';

/**
 * Editing-lock endpoint (server-enforced expiration).
 *
 * POST   /api/orders/[id]/lock           → acquire lock (or return who holds it)
 * PUT    /api/orders/[id]/lock           → heartbeat: renew MY OWN active lock
 * DELETE /api/orders/[id]/lock           → release my lock
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { user, companyId } = await requireCompanyTenant();
    if (!can(user, 'orders.update') && !can(user, 'orders.update_own')) {
      return NextResponse.json({ error: 'Forbidden: no order editing permission' }, { status: 403 });
    }

    const access = await assertOrderAccess(id, user, companyId, 'orders.view');
    if (!access.allowed) {
      const map = { NOT_FOUND: 404, WRONG_COMPANY: 404, NOT_ASSIGNED: 403 } as const;
      return NextResponse.json({ error: 'Order not found or not assigned to you' }, { status: map[access.reason] });
    }
    const order = access.order;

    // My own active lock → idempotent, just refresh it
    if (order.lockedById === user.id && isLockActive(order)) {
      return NextResponse.json({ success: true, locked: true, lockedByMe: true, lockExpiresAt: order.lockExpiresAt });
    }

    if (isLockActive(order)) {
      const holder = await db.user.findUnique({ where: { id: order.lockedById! }, select: { name: true } });
      return NextResponse.json(
        {
          locked: true,
          lockedByMe: false,
          lockedBy: holder?.name ?? 'another user',
          lockedAt: order.lockedAt,
          lockExpiresAt: order.lockExpiresAt,
          error: `This order is currently being edited by ${holder?.name ?? 'another user'}.`,
          errorAr: `هذا الطلب يتم تعديله حالياً بواسطة ${holder?.name ?? 'مستخدم آخر'}.`,
        },
        { status: 423 } // Locked
      );
    }

    // Acquire atomically (also replaces expired locks)
    const { lockDurationMs } = lockConfig();
    const now = new Date();
    const lockExpiresAt = new Date(now.getTime() + lockDurationMs);
    const won = await atomicAcquireLock({ orderId: id, userId: user.id, lockedAt: now, lockExpiresAt });

    if (!won) {
      // Someone else won the race between our read and write
      const fresh = await db.order.findUnique({ where: { id }, select: { lockedById: true, lockExpiresAt: true } });
      const holder = fresh?.lockedById
        ? await db.user.findUnique({ where: { id: fresh.lockedById }, select: { name: true } })
        : null;
      return NextResponse.json(
        {
          locked: true, lockedByMe: false, lockedBy: holder?.name,
          lockExpiresAt: fresh?.lockExpiresAt,
          error: `This order is currently being edited by ${holder?.name ?? 'another user'}.`,
          errorAr: `هذا الطلب يتم تعديله حالياً بواسطة ${holder?.name ?? 'مستخدم آخر'}.`,
        },
        { status: 423 }
      );
    }

    await logAudit({
      companyId, userId: user.id, action: 'ORDER_LOCKED', entity: 'Order', entityId: id,
      newData: { lockedById: user.id, lockExpiresAt },
    });

    return NextResponse.json({ success: true, locked: true, lockedByMe: true, lockExpiresAt });
  } catch (error: any) {
    return apiErrorResponse(error);
  }
}

/** Heartbeat — renew MY OWN lock only. */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { user, companyId } = await requireCompanyTenant();

    const order = await db.order.findUnique({ where: { id }, select: { companyId: true, lockedById: true } });
    if (!order || order.companyId !== companyId) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }
    if (order.lockedById !== user.id) {
      return NextResponse.json({ error: 'You do not hold the editing lock on this order.' }, { status: 403 });
    }

    const { lockDurationMs } = lockConfig();
    const lockExpiresAt = new Date(Date.now() + lockDurationMs);
    const renewed = await atomicRenewLock({ orderId: id, userId: user.id, from: new Date(), lockExpiresAt });

    if (!renewed) {
      return NextResponse.json({ error: 'Lock expired. Please re-acquire the lock.' }, { status: 409 });
    }
    return NextResponse.json({ success: true, lockExpiresAt });
  } catch (error: any) {
    return apiErrorResponse(error);
  }
}

/** Release my lock (save-complete or cancel-edit). */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { user, companyId } = await requireCompanyTenant();

    const order = await db.order.findUnique({ where: { id }, select: { companyId: true, lockedById: true } });
    if (!order || order.companyId !== companyId) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }
    if (order.lockedById && order.lockedById !== user.id) {
      // Only SUPER_ADMIN override (claim?mode=override) may break someone else's lock
      return NextResponse.json({ error: 'You do not hold the editing lock.' }, { status: 403 });
    }

    const released = await atomicReleaseLock({ orderId: id, userId: user.id });
    if (released) {
      await logAudit({
        companyId, userId: user.id, action: 'ORDER_UNLOCKED', entity: 'Order', entityId: id,
        previousData: { lockedById: user.id }, newData: { lockedById: null },
      });
    }
    return NextResponse.json({ success: true, released });
  } catch (error: any) {
    return apiErrorResponse(error);
  }
}
