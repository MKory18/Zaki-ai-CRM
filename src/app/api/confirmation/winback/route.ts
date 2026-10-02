import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireContext } from '@/lib/geo-context';
import { requirePermission } from '@/lib/authorization';
import { apiErrorResponse } from '@/lib/api-error';
import { zodMessage } from '@/lib/zod-message';
import { logAudit } from '@/lib/audit';
import { computeCod } from '@/lib/money';
import { orderRefFields } from '@/lib/order-ref';
import {
  maxWinbackDiscount,
  WINBACK_COOLING_DAYS,
  WINBACK_REASONS,
  LOST_STATUSES,
  winbackVerdict,
  type WinbackSource,
} from '@/lib/winback';
import { noteCustomersHandedOut } from '@/lib/pii-alert';

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
    const { user, companyId, storeId } = await requireContext();
    await requirePermission('confirmation.supervise');

    const showAll = new URL(req.url).searchParams.get('all') === '1';
    const now = new Date();
    const since = new Date(now.getTime() - LOOKBACK_DAYS * 86_400_000);

    const orders = await db.order.findMany({
      where: {
        companyId,
        ...(storeId ? { storeId } : {}),
        // Both words for an order that did not happen — see LOST_STATUSES.
        confirmationStatus: { in: [...LOST_STATUSES] },
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
        // Whether this order is itself somebody's second chance.
        replaces: { select: { orderNumber: true } },
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
     *
     * AND BOTH WORDS FOR IT, not just the first one. `LOST_STATUSES` was
     * widened to REJECTED **and** CANCELLED so that an order closed by the
     * no-answer rule could be found here at all — and this lookup was left
     * asking for REJECTED alone, so every cancelled order arrived with no
     * closing date and the verdict said «لا تاريخَ لإلغائه» about an order
     * whose cancellation is stamped in the log. It could never leave that
     * state, which made «ثلاث محاولات بلا ردّ» — named on this very screen as
     * one of the three reasons worth a second call, and the most winnable of
     * them — a promise the screen could not keep.
     *
     * Measured on this database: SY-2026-0147, cancelled 2026-09-22 at
     * NO_ANSWER_3_ATTEMPTS, was permanently skipped. The POST below has read
     * both words all along, so the two halves of one feature disagreed about
     * which orders exist.
     */
    const logs = orders.length
      ? await db.orderStatusLog.findMany({
          where: {
            orderId: { in: orders.map((o) => o.id) },
            statusType: 'CONFIRMATION',
            newValue: { in: [...LOST_STATUSES] },
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
        replacesOrderNumber: o.replaces?.orderNumber ?? null,
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
    // Contact details left the building; the tally is the person's, not
    // this screen's. See noteCustomersHandedOut.
    await noteCustomersHandedOut({ companyId, storeId, user, where: 'استعادة العملاء', rows: orders });

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
      include: {
        replacedBy: { select: { orderNumber: true } },
        replaces: { select: { orderNumber: true } },
      },
    });
    if (!order) return NextResponse.json({ error: 'الطلب غير موجود' }, { status: 404 });

    const lastRejection = await db.orderStatusLog.findFirst({
      where: { orderId, statusType: 'CONFIRMATION', newValue: { in: [...LOST_STATUSES] } },
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
        replacesOrderNumber: order.replaces?.orderNumber ?? null,
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

    /**
     * THE GOODS — READ OFF THE ORDER WE ARE TRYING TO WIN BACK.
     *
     * This route created an Order and no `OrderItem` at all: the only one of
     * the six order doors that did not. `assertReadyToShip` refuses a lineless
     * order by name («الطلب بلا أسطر — لا يمكن تجهيزه»), `reserveOrderLines`
     * finds nothing to hold, and the preparation screen has no row to pick —
     * so every win-back offer ever accepted was an order that could never
     * ship. The customer we deliberately went back to win is recorded as
     * having ordered and then receives nothing.
     *
     * WHERE THE LINES COME FROM, and there is no guessing in it. A win-back
     * is this order again at a lower price: the row written below already
     * copies `productId`, `quantity`, `freeQuantity`, `offerId` and the two
     * product snapshots from it. The lines are the same goods, so they are
     * the ORIGINAL ORDER'S OWN `OrderItem` rows — which is exactly what
     * `createReplacement` does for the transfer and the reorder, the two
     * other doors that raise a fresh order against `replacesOrderId`.
     *
     * `unitPrice` IS PER UNIT and is taken as it stands. Measured on this
     * database: ORD-2026-0056 is 2 × 12.50 with `sellingPrice` 25 and
     * `lineTotal` 25 — so `sellingPrice` is the order's SUBTOTAL, not a unit
     * price, and the computation below used to hand it to `computeCod` as a
     * unit price AND multiply it by the quantity again. ORD-2026-0052 (3 ×
     * 12, subtotal 36) would have been won back at 108. That is the same
     * mistake the orders PATCH records fixing — «multiplying a price that is
     * already the line's total by the quantity again» — and it was invisible
     * here because a one-unit order gives the right answer.
     *
     * AN ORDER WITH NO LINES OF ITS OWN still has to be winnable: the single
     * product columns are that order's own record of what was bought, and
     * `OrderLinesCard` already shows them as one line when `items` is empty.
     * The unit price is the subtotal divided ONCE, the same rule every other
     * door applies to a figure that is a total for its quantity.
     */
    const sourceLines = await db.orderItem.findMany({
      where: { orderId: order.id },
      orderBy: { createdAt: 'asc' },
      select: {
        productId: true, productName: true, quantity: true, freeQuantity: true, unitPrice: true,
      },
    });
    const quantity = order.quantity ?? 1;
    const lines = sourceLines.length
      ? sourceLines.map((l) => ({
          productId: l.productId,
          productName: l.productName,
          quantity: l.quantity,
          freeQuantity: l.freeQuantity,
          unitPrice: Number(l.unitPrice),
        }))
      : [
          {
            productId: order.productId,
            productName: order.productNameSnapshot ?? '',
            quantity,
            freeQuantity: order.freeQuantity ?? 0,
            unitPrice: quantity > 0 ? Number(order.sellingPrice ?? 0) / quantity : Number(order.sellingPrice ?? 0),
          },
        ];
    const carried = Number(order.discountAmount ?? 0);
    // The discount is the WHOLE of it, not a second helping on top of what
    // came off before — the ceiling above already subtracted the old one.
    const totalDiscount = carried + discount;
    /*
     * THROUGH THE ONE DOOR, NOT A FORMULA OF ITS OWN.
     *
     * This was `Math.max(0, unit * quantity - totalDiscount)` — the COD
     * computed a second time, by hand, in a route nobody thinks of as a
     * money route. Three things it got wrong and `computeCod` does not:
     * it rounded nowhere, so a Jordanian order carried a float; it ignored
     * `priceIncludesDelivery`, which the row below faithfully copies and
     * which decides whether a fee is inside the price or on top of it; and
     * it clamped a negative to zero instead of clamping the DISCOUNT to the
     * subtotal, which is where the clamp belongs.
     *
     * «If the same figure is computed in two different places in the code,
     * that is a defect even when the two agree today.»
     */
    const money = computeCod({
      lines: lines.map((l) => ({ quantity: l.quantity, unitPrice: l.unitPrice })),
      discount: totalDiscount,
      deliveryFee: 0,
      priceIncludesDelivery: order.priceIncludesDelivery ?? false,
      minorUnit: country.minorUnit,
    });
    const totalAmount = money.cod;

    const created = await db.$transaction(async (tx) => {
      const refs = await orderRefFields(tx, companyId, country.orderPrefix, 0);
      const fresh = await tx.order.create({
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
          // The subtotal of the lines written below, so the row and its own
          // lines can never disagree — the same column the orders PATCH and
          // `createReplacement` write from `money.subtotal`.
          sellingPrice: money.subtotal,
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

      /**
       * AND ITS LINES, IN THE SAME TRANSACTION AS THE ORDER.
       *
       * Inside the transaction because an order that exists without its
       * lines is precisely the defect this closes — a half-written order
       * must not survive a failure here.
       *
       * The shares and the line totals are `computeCod`'s own allocation, as
       * `POST /api/orders` and `createPublicOrder` write them: a partial
       * return refunds the wrong amount when a line carries a share it
       * worked out for itself.
       *
       * NOTHING IS RESERVED HERE, and that is the rule rather than an
       * omission. This order enters at NEW, and stock is held when it is
       * CONFIRMED — `reserveOrderLines` in `PATCH /api/orders/[id]/
       * confirmation`. The replacement path reserves at creation because it
       * is born CONFIRMED with a customer already waiting on a parcel; a
       * win-back offer nobody has accepted yet must not hold goods.
       */
      await tx.orderItem.createMany({
        data: lines.map((l, i) => ({
          companyId,
          orderId: fresh.id,
          productId: l.productId,
          productName: l.productName,
          quantity: l.quantity,
          freeQuantity: l.freeQuantity,
          unitPrice: l.unitPrice,
          discountShare: money.discountShares[i] ?? 0,
          lineTotal: money.lineTotals[i] ?? 0,
          addedById: user.id,
          addedStage: 'INTAKE',
        })),
      });

      return fresh;
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
