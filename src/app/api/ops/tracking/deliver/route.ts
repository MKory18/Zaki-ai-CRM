import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireContext } from '@/lib/geo-context';
import { requirePermission } from '@/lib/authorization';
import { apiErrorResponse } from '@/lib/api-error';
import { logAudit } from '@/lib/audit';
import { PartialDeliveryRefused, recordPartialDelivery } from '@/lib/partial-delivery';
import { zodMessage } from '@/lib/zod-message';

/**
 * POST /api/ops/tracking/deliver — settle a parcel at the door.
 *
 * One endpoint for all three outcomes, because they are the same event seen
 * from different line counts: everything taken is DELIVERED, some taken is
 * PARTIALLY_DELIVERED, nothing taken is RETURNED. Splitting them into three
 * endpoints would invite three different fee rules.
 *
 * The refused units are REPORTED, not restocked. Stock re-entry is
 * count-and-inspect on /ops/returns, done when the parcel is physically
 * back — not when the courier says it is coming.
 */

const schema = z.object({
  orderId: z.string().uuid(),
  lines: z
    .array(z.object({ itemId: z.string().uuid(), deliveredQty: z.number().int().min(0).max(10_000) }))
    .min(1)
    .max(100),
  note: z.string().trim().max(300).optional(),
});

export async function POST(req: Request) {
  try {
    const { user, companyId, country } = await requireContext();
    await requirePermission('ops.track');

    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: zodMessage(parsed.error) }, { status: 400 });
    }

    try {
      const outcome = await db.$transaction((tx) =>
        recordPartialDelivery(tx, {
          companyId,
          orderId: parsed.data.orderId,
          lines: parsed.data.lines,
          minorUnit: country.minorUnit,
          userId: user.id,
          note: parsed.data.note ?? null,
        })
      );

      await logAudit({
        companyId, userId: user.id, action: 'PARTIAL_DELIVERY_RECORDED',
        entity: 'Order', entityId: parsed.data.orderId,
        newData: {
          status: outcome.status,
          collectedAmount: outcome.collectedAmount,
          deliveryFee: outcome.deliveryFee,
          linesDelivered: outcome.linesDelivered,
          linesReturned: outcome.linesReturned,
        },
      });

      return NextResponse.json({
        ...outcome,
        message:
          outcome.status === 'DELIVERED'
            ? `سُلِّم كاملاً — حُصِّل ${outcome.collectedAmount} ${country.currencyCode}`
            : outcome.status === 'RETURNED'
              ? 'لم يُستلم شيء — الطلب مرتجع'
              : `تسليم جزئي — حُصِّل ${outcome.collectedAmount} ${country.currencyCode} بأجرة توصيل كاملة ${outcome.deliveryFee}`,
      });
    } catch (e) {
      if (e instanceof PartialDeliveryRefused) {
        return NextResponse.json({ error: e.message, code: e.code }, { status: 409 });
      }
      throw e;
    }
  } catch (error) {
    return apiErrorResponse(error);
  }
}
