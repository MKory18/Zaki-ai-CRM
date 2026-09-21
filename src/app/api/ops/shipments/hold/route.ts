import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireContext } from '@/lib/geo-context';
import { requirePermission } from '@/lib/authorization';
import { apiErrorResponse } from '@/lib/api-error';
import { logAudit } from '@/lib/audit';
import { zodMessage } from '@/lib/zod-message';

/**
 * POST /api/ops/shipments/hold — keep an order out of today's shipment.
 *
 * The customer rings before the parcel joins a batch: "not this week, my
 * brother is travelling". The order is confirmed and correct; it simply
 * must not go out yet.
 *
 * The two alternatives were both wrong. Cancelling throws away a good sale
 * and releases stock somebody still wants. Leaving it alone means it goes
 * out on the next shipment anybody builds, because nothing on the screen
 * says otherwise.
 *
 * NOT the confirmation postpone. That one means "call them back on
 * Thursday" and belongs to the agent on the phone. This means "do not put
 * it in a van yet" and belongs to whoever builds the shipment. One column
 * doing both would make each one lie about the other.
 *
 * The goods stay reserved throughout — a held order is a sale that is
 * waiting, not one that was abandoned, and releasing its units would let
 * somebody else's order take them.
 */

const schema = z.object({
  orderId: z.string().uuid(),
  /** Until when. Omitted means open-ended: it waits until somebody releases it. */
  until: z.string().datetime().optional().nullable(),
  reason: z.string().trim().max(300).optional(),
  /** true lifts the hold. */
  release: z.boolean().default(false),
});

/** Open-ended holds are stored far in the future rather than as a null flag. */
const FOREVER = new Date('2999-12-31T00:00:00.000Z');

export async function POST(req: Request) {
  try {
    const { user, companyId, storeId } = await requireContext();
    await requirePermission('ops.ship');

    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: zodMessage(parsed.error) }, { status: 400 });
    }
    const { orderId, until, reason, release } = parsed.data;

    const order = await db.order.findFirst({
      where: { id: orderId, companyId, storeId },
      select: {
        id: true,
        orderNumber: true,
        shippingStatus: true,
        shippingBatchId: true,
        shipHoldUntil: true,
      },
    });
    if (!order) return NextResponse.json({ error: 'الطلب غير موجود' }, { status: 404 });

    // Once it is on a trolley the hold is the wrong instrument: the parcel
    // has to come off the batch first, and that is a different decision
    // with a different audit trail.
    if (!release && order.shippingBatchId) {
      return NextResponse.json(
        {
          error: 'الطلب دخل دفعة شحن — أخرجه من الدفعة أولاً، أو ألغِه إن كان الزبون تراجع.',
          code: 'ALREADY_BATCHED',
        },
        { status: 409 }
      );
    }

    const updated = await db.order.update({
      where: { id: order.id },
      data: release
        ? { shipHoldUntil: null, shipHoldReason: null, version: { increment: 1 } }
        : {
            shipHoldUntil: until ? new Date(until) : FOREVER,
            shipHoldReason: reason?.trim() || null,
            version: { increment: 1 },
          },
      select: { id: true, orderNumber: true, shipHoldUntil: true, shipHoldReason: true },
    });

    await db.orderActivity.create({
      data: {
        companyId,
        orderId: order.id,
        userId: user.id,
        action: release ? 'SHIP_HOLD_RELEASED' : 'SHIP_HOLD_SET',
        metadata: JSON.stringify({ until: until ?? null, reason: reason ?? null }),
      },
    });

    await logAudit({
      companyId,
      userId: user.id,
      action: release ? 'SHIP_HOLD_RELEASED' : 'SHIP_HOLD_SET',
      entity: 'Order',
      entityId: order.id,
      previousData: { shipHoldUntil: order.shipHoldUntil },
      newData: { shipHoldUntil: updated.shipHoldUntil, reason: reason ?? null },
    });

    return NextResponse.json({
      order: updated,
      message: release
        ? `${order.orderNumber} عاد إلى قائمة الشحن.`
        : `${order.orderNumber} مؤجَّل — لن يدخل أي شحنة حتى تُفرج عنه.`,
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
