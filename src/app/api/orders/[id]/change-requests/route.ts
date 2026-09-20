import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireContext } from '@/lib/geo-context';
import { assertOrderAccess } from '@/lib/rbac';
import { apiErrorResponse } from '@/lib/api-error';
import { logAudit } from '@/lib/audit';
import { addBusinessMinutes } from '@/lib/business-calendar';

/**
 * Change requests on an order (contract PART 2 / invariant 7).
 *
 *   GET  /api/orders/:id/change-requests
 *   POST /api/orders/:id/change-requests
 *
 * A confirmed order is read-only for the agent: a change goes through a
 * request. A BLOCKING request stops OUR forward transitions only; courier
 * events are always recorded and mark the request as "changed during
 * review". The SLA escalates — it never auto-approves.
 */

/** Business minutes before a pending request escalates (never auto-approves). */
export const CHANGE_REQUEST_SLA_MINUTES = 120;

const CHANGEABLE_FIELDS = [
  'customerName', 'customerPhone', 'customerAltPhone', 'customerAddress', 'customerCity',
  'quantity', 'productId', 'offerId', 'discountAmount', 'customerNotes',
] as const;

const createSchema = z.object({
  changes: z
    .record(z.enum(CHANGEABLE_FIELDS), z.object({ to: z.union([z.string(), z.number()]).nullable() }))
    .refine((c) => Object.keys(c).length > 0, 'حدّد حقلاً واحداً على الأقل'),
  reason: z.string().trim().min(5, 'اذكر سبب التعديل').max(500),
  blocking: z.boolean().default(true),
});

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { user, companyId, storeId } = await requireContext();
    const access = await assertOrderAccess(id, user, { companyId, storeId }, 'orders.view');
    if (!access.allowed) return NextResponse.json({ error: 'Order not found' }, { status: 404 });

    const requests = await db.orderChangeRequest.findMany({
      where: { orderId: id, companyId },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json({ requests });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { user, companyId, storeId, country } = await requireContext();

    const access = await assertOrderAccess(id, user, { companyId, storeId }, 'orders.view');
    if (!access.allowed) return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    const order = access.order;

    const parsed = createSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message || 'بيانات غير صالحة' }, { status: 400 });
    }

    const open = await db.orderChangeRequest.findFirst({
      where: { orderId: id, status: 'PENDING' },
      select: { id: true },
    });
    if (open) {
      return NextResponse.json(
        { error: 'يوجد طلب تعديل قيد المراجعة على هذا الطلب', code: 'CHANGE_REQUEST_PENDING' },
        { status: 409 }
      );
    }

    const cal = {
      workHoursStart: country.workHoursStart,
      workHoursEnd: country.workHoursEnd,
      weekendDays: country.weekendDays,
      timezone: country.timezone,
    };

    const created = await db.orderChangeRequest.create({
      data: {
        companyId,
        orderId: id,
        requestedById: user.id,
        requestedRole: user.role,
        changes: parsed.data.changes,
        reason: parsed.data.reason,
        blocking: parsed.data.blocking,
        slaDueAt: addBusinessMinutes(new Date(), CHANGE_REQUEST_SLA_MINUTES, cal),
      },
    });

    await logAudit({
      companyId,
      userId: user.id,
      action: 'CHANGE_REQUEST_RAISED',
      entity: 'Order',
      entityId: id,
      newData: { requestId: created.id, changes: parsed.data.changes, reason: parsed.data.reason },
    });
    await db.orderNote.create({
      data: {
        companyId,
        orderId: id,
        authorId: user.id,
        kind: 'internal',
        body: `طلب تعديل: ${parsed.data.reason}`,
      },
    });

    return NextResponse.json({ request: created, orderStatus: order.confirmationStatus }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
