import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireContext } from '@/lib/geo-context';
import { requirePermission } from '@/lib/authorization';
import { apiErrorResponse } from '@/lib/api-error';
import { zodMessage } from '@/lib/zod-message';
import { logAudit } from '@/lib/audit';
import { orderRefFields } from '@/lib/order-ref';
import {
  maxWinbackDiscount,
  WINBACK_COOLING_DAYS,
  WINBACK_REASONS,
  winbackVerdict,
  type WinbackSource,
} from '@/lib/winback';

/**
 * GET  /api/confirmation/winback — the lost orders worth one more call.
 * POST /api/confirmation/winback — make the offer: a NEW order, with a discount.
 *
 * WHY A NEW ORDER AND NOT THE OLD ONE BACK.
 *
 * Reviving the rejected order would be the shorter code and the wrong
 * record. It was rejected — that is a fact with a date, a reason and a
 * person, and «أين نخسر الطلبات» counts it. Flipping its status back to NEW
 * erases the loss from every report that reads `confirmationStatus`, so the
 * month would show fewer rejections the harder we worked at winning them
 * back. And REJECTED is terminal in `CONFIRMATION_TRANSITIONS`, which this
 * door does not open for everybody in order to do one thing.
 *
 * So the loss stays a loss and the offer is a new attempt with its own
 * outcome — which also gives the whole idea a conversion rate. It is the
 * pattern the region transfer already uses: close the old leg, raise a
 * fresh order, link the two with `replacesOrderId`.
 *
 * AND ONCE IS ONCE, enforced by the database rather than by this file:
 * `replacesOrderId` is `@unique`, so a second offer on the same rejected
 * order cannot be written even by two people pressing at the same moment.
 */

const offerSchema = z.object({
  orderId: z.string().uuid(),
  discount: z.number().finite().min(0).max(1_000_000),
  note: z.string().trim().max(500).optional(),
});

/** Rejected orders are read this far back; past that a call is archaeology. */
const LOOKBACK_DAYS = 120;

export async function GET(req: Request) {
  try {
    const { companyId, storeId } = await requireContext();
    await requirePermission('confirmation.supervise');

    const showAll = new URL(req.url).searchParams.get('all') === '1';
    const now = new Date();
    const since = new Date(now.getTime() - LOOKBACK_DAYS * 86_400_000);

    const orders = await db.order.findMany({
      where: {
        companyId,
        ...(storeId ? { storeId } : {}),
        confirmationStatus: 'REJECTED',
        createdAt: { gte: since },
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
      select: {
        id: true, orderNumber: true, confirmationStatus: true, rejectionReason: true,
        rejectionNote: true, shippedAt: true, sellingPrice: true, discountAmount: true,
        quantity: true, currency: true, productNameSnapshot: true, createdAt: true,
        customer: { select: { fullName: true, phone: true } },
        replacedBy: { select: { orderNumber: true } },
      },
    });

    /**
     * WHEN IT WAS ACTUALLY CLOSED.
     *
     * The order carries no rejection timestamp — `confirmedAt` exists and
     * nothing matching it does. `updatedAt` is not it either: any later edit
     * moves it, so a note added yesterday would reset a customer's cooling
     * period to yesterday and hide them for another fortnight.
     *
     * The status log holds the real moment, and the LAST one is the one
     * that counts: an order rejected, re-opened and rejected again cools
     * from the second time.
     */
    const logs = orders.length
      ? await db.orderStatusLog.findMany({
          where: {
            orderId: { in: orders.map((o) => o.id) },
            statusType: 'CONFIRMATION',
            newValue: 'REJECTED',
          },
          orderBy: { createdAt: 'desc' },
          select: { orderId: true, createdAt: true },
        })
      : [];
    const rejectedAt = new Map<string, Date>();
    for (const l of logs) if (!rejectedAt.has(l.orderId)) rejectedAt.set(l.orderId, l.createdAt);

    const rows = orders.map((o) => {
      const source: WinbackSource = {
        confirmationStatus: o.confirmationStatus,
        rejectionReason: o.rejectionReason,
        rejectedAt: rejectedAt.get(o.id) ?? null,
        shippedAt: o.shippedAt,
        replacedByOrderNumber: o.replacedBy?.orderNumber ?? null,
        sellingPrice: Number(o.sellingPrice ?? 0),
        discountAmount: Number(o.discountAmount ?? 0),
      };
      const verdict = winbackVerdict(source, now);
      return {
        id: o.id,
        orderNumber: o.orderNumber,
        customer: o.customer,
        product: o.productNameSnapshot,
        quantity: o.quantity,
        sellingPrice: Number(o.sellingPrice ?? 0),
        discountAmount: Number(o.discountAmount ?? 0),
        currency: o.currency,
        rejectionReason: o.rejectionReason,
        rejectionNote: o.rejectionNote,
        rejectedAt: rejectedAt.get(o.id) ?? null,
        verdict,
      };
    });

    /**
     * THE REFUSED ONES ARE SHOWN TOO, WITH THE REASON.
     *
     * A list that silently drops what it turned down teaches nobody the
     * rule — a supervisor who remembers rejecting an order at «مكرَّر» and
     * cannot find it here concludes the screen is broken. They are behind a
     * switch, so the default view is still the work.
     */
    return NextResponse.json({
      eligible: rows.filter((r) => r.verdict.eligible),
      skipped: showAll ? rows.filter((r) => !r.verdict.eligible) : [],
      skippedCount: rows.filter((r) => !r.verdict.eligible).length,
      coolingDays: WINBACK_COOLING_DAYS,
      reasons: WINBACK_REASONS,
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(req: Request) {
  try {
    const { user, companyId, storeId, country } = await requireContext();
    await requirePermission('confirmation.supervise');

    const parsed = offerSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: zodMessage(parsed.error) }, { status: 400 });
    }
    const { orderId, discount, note } = parsed.data;

    const order = await db.order.findFirst({
      where: { id: orderId, companyId, ...(storeId ? { storeId } : {}) },
      include: { replacedBy: { select: { orderNumber: true } } },
    });
    if (!order) return NextResponse.json({ error: 'الطلب غير موجود' }, { status: 404 });

    const lastRejection = await db.orderStatusLog.findFirst({
      where: { orderId, statusType: 'CONFIRMATION', newValue: 'REJECTED' },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });

    // The same verdict the list drew, re-taken here. A row that was eligible
    // when the screen loaded may not be when the button is pressed.
    const verdict = winbackVerdict(
      {
        confirmationStatus: order.confirmationStatus,
        rejectionReason: order.rejectionReason,
        rejectedAt: lastRejection?.createdAt ?? null,
        shippedAt: order.shippedAt,
        replacedByOrderNumber: order.replacedBy?.orderNumber ?? null,
        sellingPrice: Number(order.sellingPrice ?? 0),
        discountAmount: Number(order.discountAmount ?? 0),
      },
      new Date()
    );
    if (!verdict.eligible) {
      return NextResponse.json({ error: verdict.reason, code: verdict.code }, { status: 409 });
    }

    const ceiling = maxWinbackDiscount({
      sellingPrice: Number(order.sellingPrice ?? 0),
      discountAmount: Number(order.discountAmount ?? 0),
    });
    if (discount > ceiling) {
      return NextResponse.json(
        {
          error: `أقصى خصمٍ على هذا الطلب ${ceiling} — والمحسوم عليه سابقاً داخلٌ في الحساب`,
          code: 'DISCOUNT_TOO_LARGE',
          maxDiscount: ceiling,
        },
        { status: 400 }
      );
    }

    const unit = Number(order.sellingPrice ?? 0);
    const quantity = order.quantity ?? 1;
    const carried = Number(order.discountAmount ?? 0);
    // The discount is the WHOLE of it, not a second helping on top of what
    // came off before — the ceiling above already subtracted the old one.
    const totalDiscount = carried + discount;
    const totalAmount = Math.max(0, unit * quantity - totalDiscount);

    const created = await db.$transaction(async (tx) => {
      const refs = await orderRefFields(tx, companyId, country.orderPrefix, 0);
      return tx.order.create({
        data: {
          companyId,
          countryId: order.countryId,
          storeId: order.storeId,
          regionId: order.regionId,
          ...refs,
          replacesOrderId: order.id,
          customerId: order.customerId,
          productId: order.productId,
          offerId: order.offerId,
          quantity,
          freeQuantity: order.freeQuantity,
          sellingPrice: order.sellingPrice,
          discountAmount: totalDiscount,
          shippingCost: 0,
          totalAmount,
          currency: order.currency,
          priceIncludesDelivery: order.priceIncludesDelivery,
          productNameSnapshot: order.productNameSnapshot,
          productImageSnapshot: order.productImageSnapshot,
          moderatorId: order.moderatorId,
          estimatedCostOfGoods: order.estimatedCostOfGoods,
          // Straight into the pool, held by nobody: whoever is free calls it,
          // and it is an ordinary new order from there on. No second queue.
          status: 'NEW',
          confirmationStatus: 'NEW',
          shippingStatus: 'NOT_READY',
          settlementStatus: 'NOT_APPLICABLE',
          source: order.source,
          customerNotes: order.customerNotes,
          internalNotes: `محاولةُ استرجاع لـ${order.orderNumber} (${order.rejectionReason}) بخصم ${discount}${note ? ` — ${note}` : ''}`,
          version: 1,
        },
        select: { id: true, orderNumber: true },
      });
    });

    await db.orderNote.create({
      data: {
        companyId,
        orderId: order.id,
        authorId: user.id,
        kind: 'internal',
        body: `عُرض استرجاعٌ بخصم ${discount} — الطلب الجديد ${created.orderNumber}`,
      },
    });

    await logAudit({
      companyId,
      userId: user.id,
      action: 'WINBACK_OFFERED',
      entity: 'Order',
      entityId: order.id,
      previousData: { rejectionReason: order.rejectionReason },
      newData: { newOrderId: created.id, newOrderNumber: created.orderNumber, discount, by: user.name },
    });

    return NextResponse.json({ success: true, order: created });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
