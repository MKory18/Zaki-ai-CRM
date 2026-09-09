import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireCompanyTenant } from '@/lib/auth';
import { assertOrderAccess } from '@/lib/rbac';
import { DELIVERY_ATTEMPT_RESULTS } from '@/lib/shipping-workflow';
import { logAudit } from '@/lib/audit';
import { can, authorize } from '@/lib/authorization';

/**
 * GET  /api/orders/[id]/delivery-attempts — chronological attempt history
 * POST /api/orders/[id]/delivery-attempts — record one attempt (append-only)
 *
 * Server derives: companyId, attemptNumber, createdAt, actor.
 * Client can NEVER forge attemptNumber/employeeId/timestamps.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { user, companyId } = await requireCompanyTenant();
    const access = await assertOrderAccess(id, user, companyId, 'orders.view');
    if (!access.allowed) {
      const map = { NOT_FOUND: 404, WRONG_COMPANY: 404, NOT_ASSIGNED: 403 } as const;
      return NextResponse.json({ error: 'Order not found' }, { status: map[access.reason] });
    }

    const attempts = await db.deliveryAttempt.findMany({
      where: { orderId: id, companyId },
      orderBy: { attemptNumber: 'asc' },
      include: {
        agent: { select: { id: true, name: true } },
        provider: { select: { id: true, name: true, code: true } },
      },
    });

    return NextResponse.json({ attempts, total: attempts.length });
  } catch (error: any) {
    return NextResponse.json({ error: 'حدث خطأ داخلي' }, { status: 400 });
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { user, companyId } = await requireCompanyTenant();

    const access = await assertOrderAccess(id, user, companyId, 'orders.view');
    if (!access.allowed) {
      const map = { NOT_FOUND: 404, WRONG_COMPANY: 404, NOT_ASSIGNED: 403 } as const;
      return NextResponse.json({ error: 'Order not found or not assigned to you' }, { status: map[access.reason] });
    }
    const order = access.order;

    // Shipping authority — scope evaluated against the loaded order
    if (!authorize(user, 'orders.change_status', order).allowed) {
      return NextResponse.json({ error: 'Forbidden: cannot record delivery attempts' }, { status: 403 });
    }

    const body = await req.json();
    const { result, failureReason, note, deliveryProviderId } = body as {
      result?: string; failureReason?: string; note?: string; deliveryProviderId?: string;
    };

    if (!result || !(DELIVERY_ATTEMPT_RESULTS as readonly string[]).includes(result)) {
      return NextResponse.json({ error: 'Invalid delivery attempt result' }, { status: 400 });
    }
    if (result === 'FAILED' && (!failureReason || failureReason.length > 60)) {
      return NextResponse.json({ error: 'A failure reason is required for failed attempts' }, { status: 400 });
    }

    let providerId: string | null = order.deliveryProviderId;
    if (deliveryProviderId !== undefined) {
      if (deliveryProviderId) {
        const p = await db.deliveryProvider.findFirst({ where: { id: deliveryProviderId, companyId } });
        if (!p) return NextResponse.json({ error: 'Provider not found in your company' }, { status: 404 });
        providerId = p.id;
      } else {
        providerId = null;
      }
    }

    const last = await db.deliveryAttempt.findFirst({
      where: { orderId: id },
      orderBy: { attemptNumber: 'desc' },
      select: { attemptNumber: true },
    });
    const attemptNumber = (last?.attemptNumber ?? 0) + 1;

    const attempt = await db.deliveryAttempt.create({
      data: {
        companyId,
        orderId: id,
        deliveryProviderId: providerId,
        deliveryAgentId: user.id,
        attemptNumber,
        result,
        failureReason: result === 'FAILED' ? failureReason!.trim() : null,
        note: note?.trim() || null,
      },
      include: {
        agent: { select: { id: true, name: true } },
        provider: { select: { id: true, name: true, code: true } },
      },
    });

    await db.orderActivity.create({
      data: {
        companyId, orderId: id, userId: user.id, action: 'DELIVERY_ATTEMPT',
        metadata: JSON.stringify({
          attemptNumber, result, failureReason, by: user.name,
          provider: attempt.provider?.name ?? null,
        }),
      },
    });
    await logAudit({
      companyId, userId: user.id, action: 'DELIVERY_ATTEMPT_RECORDED',
      entity: 'Order', entityId: id,
      newData: { attemptNumber, result, failureReason },
    });

    return NextResponse.json({ success: true, attempt });
  } catch (error: any) {
    return NextResponse.json({ error: 'حدث خطأ داخلي' }, { status: 400 });
  }
}
