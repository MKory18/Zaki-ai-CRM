import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireCompanyTenant } from '@/lib/auth';
import { assertOrderAccess } from '@/lib/rbac';
import { ownershipSnapshot } from '@/lib/order-locks';
import { logAudit } from '@/lib/audit';
import { apiError } from '@/lib/api-error';
import { can, authorize } from '@/lib/authorization';

/**
 * POST /api/orders/[id]/transfer
 * Controlled order transfer — never allow order stealing.
 *
 * Authorization (server-side):
 *  - orders.assign permission with scope evaluation (admins/managers), OR
 *  - the current claimer releasing to a specific colleague (voluntary transfer)
 *
 * Body: { targetUserId, reason? }  — targetUserId is verified in DB,
 * never trusted from ownership fields.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { user, companyId } = await requireCompanyTenant();
    const body = await req.json();
    const { targetUserId, reason } = body as { targetUserId?: string; reason?: string };

    if (!targetUserId) {
      return NextResponse.json({ error: 'targetUserId is required' }, { status: 400 });
    }
    if (!reason || reason.trim().length < 3) {
      return NextResponse.json({ error: 'A reason is required for transferring an order.' }, { status: 400 });
    }

    const access = await assertOrderAccess(id, user, companyId, 'orders.view');
    if (!access.allowed) {
      const map = { NOT_FOUND: 404, WRONG_COMPANY: 404, NOT_ASSIGNED: 403 } as const;
      return NextResponse.json({ error: 'Order not found or not assigned to you' }, { status: map[access.reason] });
    }
    const order = access.order;
    const isReassigner = authorize(user, 'orders.assign', order).allowed;

    // Terminal orders are finalized — they can no longer be transferred
    if (['DELIVERED', 'RETURNED', 'CANCELLED', 'REJECTED'].includes(order.status)) {
      return NextResponse.json(
        { error: `Cannot transfer an order in terminal status ${order.status}`, code: 'TERMINAL_STATUS' },
        { status: 409 }
      );
    }

    // A non-reassigner may only transfer an order THEY currently own/claimed
    if (!isReassigner) {
      if (!can(user, 'orders.release')) {
        return NextResponse.json({ error: 'Forbidden: missing required permission orders.assign' }, { status: 403 });
      }
      if (order.currentOwnerId !== user.id && order.claimedById !== user.id) {
        return NextResponse.json({ error: 'You can only transfer an order you own.' }, { status: 403 });
      }
    }

    // Target must be an ACTIVE user in the SAME company
    const target = await db.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, name: true, companyId: true, status: true },
    });
    if (!target || target.companyId !== companyId || target.status !== 'ACTIVE') {
      return NextResponse.json({ error: 'Target user not found in your company or not active' }, { status: 400 });
    }
    if (target.id === order.currentOwnerId) {
      return NextResponse.json({ error: 'This order is already owned by that user' }, { status: 400 });
    }

    const previousOwnerId = order.currentOwnerId;
    const previousClaimedById = order.claimedById;
    const now = new Date();

    // Conditional versioned write — never overwrite a concurrent save
    const won = await db.order.updateMany({
      where: { id, companyId, version: order.version },
      data: {
        assignedToId: target.id,
        assignedAt: now,
        currentOwnerId: target.id,
        claimedById: target.id,
        claimedAt: now,
        // The target must sign for the order themselves — never forged here
        signatureStatus: 'UNSIGNED',
        signedById: null,
        signedAt: null,
        // transfer breaks the previous owner's editing lock
        lockedById: null, lockedAt: null, lockExpiresAt: null,
        version: { increment: 1 },
      },
    });
    if (won.count !== 1) {
      return NextResponse.json(
        { error: 'This order was updated by another user. Please refresh before saving.', code: 'VERSION_CONFLICT' },
        { status: 409 }
      );
    }

    await db.orderClaimHistory.create({
      data: {
        companyId, orderId: id, userId: user.id, action: 'TRANSFERRED', reason: reason.trim(),
        metadata: JSON.stringify({ previousOwnerId, previousClaimedById, newOwner: target.id, performedBy: user.id }),
      },
    });
    await db.orderActivity.create({
      data: {
        companyId, orderId: id, userId: user.id, action: 'TRANSFERRED',
        metadata: JSON.stringify({ from: previousOwnerId, to: target.name, by: user.name, reason }),
      },
    });
    await logAudit({
      companyId, userId: user.id, action: 'ORDER_TRANSFERRED', entity: 'Order', entityId: id,
      previousData: { previousOwnerId, previousClaimedById },
      newData: { newOwner: target.id, by: user.id, reason },
    });

    const freshOrder = await db.order.findUnique({ where: { id } });
    return NextResponse.json({ success: true, transferredTo: target.name, order: freshOrder });
  } catch (error) {
    const { body, status } = apiError(error);
    return NextResponse.json(body, { status });
  }
}
