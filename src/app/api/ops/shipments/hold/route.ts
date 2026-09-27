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

/**
 * UNTIL WHEN — and there is no longer an «omitted» case.
 *
 * A RELEASE carries no date, so the two shapes are separate rather than one
 * shape with everything optional: «lift this hold» and «hold this until
 * Thursday» are different requests, and a schema that accepts both with all
 * fields optional accepts neither properly.
 */
const schema = z.union([
  z.object({ orderId: z.string().uuid(), release: z.literal(true) }),
  z.object({
    orderId: z.string().uuid(),
    /**
   *
     * The date was optional, and a missing one stored the year 2999. That is
     * not an open-ended hold, it is a lost order: `shipHoldUntil` is read by
     * two files, the shipment list simply excludes anything held, and
     * nothing anywhere brings a held order back or says out loud that it is
     * waiting. A parcel held «for now» by somebody who then went on leave
     * was gone, with its stock still reserved against it.
     *
     * Every hold now ends on a day, and on that day the order reappears in
     * the shipment list by itself — `shipHoldUntil <= now` is already how
     * that list is filtered, so the date was always the mechanism. Nothing
     * ever asked for it.
     */
    until: z.string().datetime({ offset: true }).or(z.string().datetime()),
    reason: z.string().trim().max(300).optional(),
    release: z.literal(false).optional(),
  }),
]);

/** A hold longer than this is not a delayed shipment, it is a stopped order. */
export const MAX_HOLD_DAYS = 30;

export async function POST(req: Request) {
  try {
    const { user, companyId, storeId } = await requireContext();
    await requirePermission('ops.ship');

    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: zodMessage(parsed.error) }, { status: 400 });
    }
    const data = parsed.data;
    const orderId = data.orderId;
    const release = 'release' in data && data.release === true;
    const until = release ? null : (data as { until: string }).until;
    const reason = release ? undefined : (data as { reason?: string }).reason;

    /**
     * THE DATE HAS TO BE A DATE, AND NOT A YEAR FROM NOW.
     *
     * The goods stay reserved for the whole of a hold — that is the point of
     * it — so a long one is stock nobody can sell, quietly. Past thirty days
     * the honest instrument is the other one: un-confirm it, let the goods go
     * back on sale, and let the follow-up team talk to the customer again.
     */
    if (!release) {
      const due = new Date(until as string);
      const maxAt = Date.now() + MAX_HOLD_DAYS * 86_400_000;
      if (isNaN(due.getTime()) || due.getTime() < Date.now() - 60_000) {
        return NextResponse.json({ error: 'موعد الإفراج يجب أن يكون في المستقبل' }, { status: 400 });
      }
      if (due.getTime() > maxAt) {
        return NextResponse.json(
          {
            error:
              `التأجيل مع حجز البضاعة لا يتجاوز ${MAX_HOLD_DAYS} يوماً — البضاعة محجوزة طوال المدّة. ` +
              'لمدّةٍ أطول أعِده إلى المتابعة، فتعود بضاعتُه للبيع.',
            code: 'HOLD_TOO_LONG',
          },
          { status: 400 }
        );
      }
    }

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
            shipHoldUntil: new Date(until as string),
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
        : `${order.orderNumber} مؤجَّل حتى ${String(until).slice(0, 10)} — ويعود إلى قائمة الشحن يومَها وحده.`,
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
