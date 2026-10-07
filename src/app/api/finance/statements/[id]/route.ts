import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireContext } from '@/lib/geo-context';
import { requirePermission } from '@/lib/authorization';
import { apiErrorResponse } from '@/lib/api-error';
import { logAudit } from '@/lib/audit';
import { consumeOrderStock } from '@/lib/stock-consumption';
import { receiptGap } from '@/lib/settlement';
import { approvalRefusal, isApproved } from '@/lib/settlement-gates';
import { recordMovement } from '@/lib/wallets';
import { markPayableForOrders } from '@/lib/commission';
import { zodMessage } from '@/lib/zod-message';

/**
 * One statement.
 *
 *   GET   /api/finance/statements/:id     lines, receipts, gap, match queues
 *   PATCH /api/finance/statements/:id     { gapExplanation } | { approve: true }
 *
 * APPROVAL is the gate the whole contract hangs on: no fund movement exists
 * before it, and commission becomes payable only after it. Approving with an
 * unexplained gap between what the courier claimed and what arrived is
 * refused.
 */

const patchSchema = z.object({
  gapExplanation: z.string().trim().min(5).max(500).optional(),
  approve: z.boolean().optional(),
});

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { companyId, storeId, country } = await requireContext();
    await requirePermission('settlement.view');

    const statement = await db.courierStatement.findFirst({
      where: { id, companyId, storeId },
      include: {
        lines: { orderBy: { createdAt: 'asc' }, take: 1000 },
        receipts: { include: { wallet: { select: { id: true, name: true, currencyCode: true } } } },
        matches: {
          include: {
            order: { select: { id: true, orderNumber: true, merchantRef: true, shippingStatus: true } },
            statementLine: { select: { merchantRef: true, barcode: true, amount: true } },
          },
        },
      },
    });
    if (!statement) return NextResponse.json({ error: 'الكشف غير موجود' }, { status: 404 });

    const gap = await receiptGap(db, id, country.minorUnit);
    const queues = {
      matched: statement.matches.filter((m) => m.result === 'MATCHED'),
      mismatched: statement.matches.filter((m) => m.result === 'MISMATCHED'),
      missing: statement.matches.filter((m) => m.result.startsWith('MISSING')),
    };

    return NextResponse.json({ statement, gap, queues });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { user, companyId, storeId, country } = await requireContext();
    await requirePermission('settlement.review');

    const parsed = patchSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: zodMessage(parsed.error) }, { status: 400 });
    }

    const statement = await db.courierStatement.findFirst({
      where: { id, companyId, storeId },
      // `statementFee` joins them because the money written onto the order is
      // the GROSS the customer paid — the net plus the fee the courier kept.
      include: {
        receipts: true,
        matches: { select: { orderId: true, result: true, statementAmount: true, statementFee: true } },
      },
    });
    if (!statement) return NextResponse.json({ error: 'الكشف غير موجود' }, { status: 404 });
    // Read from the stamp of the act, not from `status`: a re-match used to
    // write MATCHED over APPROVED, and this gate then let the money through
    // a second time. See lib/settlement-gates.
    if (isApproved(statement)) {
      return NextResponse.json({ error: 'الكشف معتمد مسبقاً', code: 'ALREADY_APPROVED' }, { status: 409 });
    }

    if (parsed.data.gapExplanation && !parsed.data.approve) {
      const updated = await db.courierStatement.update({
        where: { id },
        data: { gapExplanation: parsed.data.gapExplanation },
      });
      await logAudit({
        companyId, userId: user.id, action: 'STATEMENT_GAP_EXPLAINED',
        entity: 'CourierStatement', entityId: id, newData: { explanation: parsed.data.gapExplanation },
      });
      return NextResponse.json({ statement: updated });
    }

    if (!parsed.data.approve) return NextResponse.json({ error: 'لا يوجد إجراء' }, { status: 400 });

    // ── Approval gates ──
    // One rule, in lib/settlement-gates, read here and by the screen that
    // greys the button out — so the sentence on the disabled button is the
    // sentence the server would have answered with.
    const gap = await receiptGap(db, id, country.minorUnit);
    const explanation = parsed.data.gapExplanation ?? statement.gapExplanation;
    const refusal = approvalRefusal({
      status: statement.status,
      approvedAt: statement.approvedAt,
      receipts: statement.receipts.length,
      matches: statement.matches.length,
      gap,
      explanation,
    });
    if (refusal) return NextResponse.json({ ...refusal, gap }, { status: 409 });

    const approved = await db.$transaction(async (tx) => {
      const row = await tx.courierStatement.update({
        where: { id },
        data: {
          status: 'APPROVED',
          approvedById: user.id,
          approvedAt: new Date(),
          gapExplanation: explanation ?? null,
        },
      });

      // The money moves HERE and nowhere earlier: one wallet movement per
      // receipt, each carrying the wallet it actually landed in.
      for (const receipt of statement.receipts) {
        await recordMovement(tx, {
          companyId,
          walletId: receipt.walletId,
          direction: 'IN',
          amount: Number(receipt.amount),
          party: `تحصيل شركة الشحن — ${statement.reference}`,
          category: 'COURIER_SETTLEMENT',
          note: `اعتماد كشف ${statement.reference}`,
          referenceType: 'STATEMENT',
          referenceId: statement.id,
          createdById: user.id,
        });
      }

      // Settled orders make their commission payable — not before.
      const matched = statement.matches.filter((m) => m.result === 'MATCHED' && m.orderId);
      const settledOrderIds = matched.map((m) => m.orderId as string);
      await markPayableForOrders(tx, companyId, settledOrderIds);
      if (settledOrderIds.length > 0) {
        await tx.order.updateMany({
          where: { id: { in: settledOrderIds }, companyId },
          data: { settlementStatus: 'SETTLED' },
        });
      }

      /**
       * WHAT THE CUSTOMER PAID AT THE DOOR — THE GROSS, NOT THE NET.
       *
       * This wrote `statementAmount`, which `schema.prisma:2304` defines as
       * «the NET: what the courier hands over after keeping their fee». And
       * `Order.collectedAmount` is documented one table over as «what the
       * customer actually paid at the door, and it INCLUDES the full delivery
       * fee». So the column was documented gross and written net, by its only
       * writer, and two readers then had it wrong in two different ways:
       *
       *   `expectedAmountFor` does `collected − fee`, so a settled order's
       *   expectation came out one fee SHORT of the truth — measured on this
       *   database at 2.5 on each of twelve orders.
       *
       *   And revenue is `SUM(collectedAmount)` for orders that have one PLUS
       *   `SUM(totalAmount)` for orders that do not (`analytics.ts:257-263`,
       *   `attribution-performance.ts:113-122`). `totalAmount` is gross, so
       *   the two halves of one sum were measured in different units: twelve
       *   orders at 231.00 where the gross is 261.000. **Thirty dinars of
       *   revenue that nobody spent.**
       *
       * The gross is `statementAmount + statementFee`, and it is not a guess:
       * on all twelve live rows it equals `StatementLine.collected` exactly,
       * and `statementFee` is null on none of them.
       */
      const amountOf = new Map(
        matched.map((m) => [
          m.orderId as string,
          m.statementAmount == null ? null : Number(m.statementAmount) + Number(m.statementFee ?? 0),
        ])
      );

      /**
       * ── THE STATEMENT IS THE DELIVERY PROOF, AND THE ONLY SOURCE OF THE MONEY ──
       *
       * The courier has told us, in writing, that they delivered this parcel
       * and collected this amount. Reading that and then asking somebody to
       * tick "delivered" by hand is the same fact entered twice — and every
       * order nobody got round to ticking sat in the tracking list forever,
       * long after the money had arrived.
       *
       * WHAT CHANGED, AND WHY. This file used to say that an order already
       * marked delivered «keeps its own date and amount, because whoever
       * stood there and recorded it knew more than a spreadsheet does». Half
       * of that is true and half of it was a hole.
       *
       * The true half: the person at the door knows WHAT HAPPENED — who took
       * which line, what came back, why. No statement carries that, and the
       * date and status they recorded are still theirs and are left alone.
       *
       * The hole: they do not know WHAT MONEY ARRIVED. A follow-up agent is
       * repeating what a courier said on the phone. And because only in-flight
       * orders were touched here, the figure she typed was never once compared
       * with the courier's own — recording a delivery did not anticipate the
       * reconciliation, it removed the order from it.
       *
       * So the door no longer writes `collectedAmount` at all, and the amount
       * is written here for EVERY matched order that has none yet, whatever
       * its status. An amount already on an order is never overwritten: a
       * correction is a correction, made deliberately, not a side effect of
       * re-importing a file.
       */

      const inFlight = await tx.order.findMany({
        where: {
          id: { in: settledOrderIds },
          companyId,
          shippingStatus: { in: ['SHIPPED', 'OUT_FOR_DELIVERY', 'READY_FOR_PICKUP'] },
        },
        select: { id: true, orderNumber: true, customerId: true },
      });
      // The period's end is when the courier says the money was in, and is
      // closer to the truth than the moment somebody uploaded a file.
      const deliveredAt = statement.periodTo ?? new Date();

      for (const order of inFlight) {
        const collected = amountOf.get(order.id);
        await tx.order.update({
          where: { id: order.id },
          data: {
            shippingStatus: 'DELIVERED',
            deliveredAt,
            ...(collected != null ? { collectedAmount: collected } : {}),
            version: { increment: 1 },
          },
        });
        // Delivery is what takes the goods off the shelf for good. The
        // helper refuses to do it twice, so an order delivered by hand and
        // then settled is not counted out of stock again.
        await consumeOrderStock(tx as never, {
          orderId: order.id,
          companyId,
          allowNegativeStock: true,
          userId: user.id,
        });
        /**
         * The customer's own record, for the same reason as the door: this
         * is how an order completes when nobody ticked anything by hand,
         * and a counter only the manual path maintains is a counter that
         * describes the exceptions.
         */
        await tx.customer.update({
          where: { id: order.customerId },
          data: {
            deliveredOrders: { increment: 1 },
            ...(collected != null ? { totalPurchaseValue: { increment: collected } } : {}),
          },
        });

        await tx.orderActivity.create({
          data: {
            companyId,
            orderId: order.id,
            userId: user.id,
            action: 'DELIVERED_BY_STATEMENT',
            newStatus: 'DELIVERED',
            metadata: JSON.stringify({
              statement: statement.reference,
              collected: collected ?? null,
            }),
          },
        });
      }

      /**
       * AND THE MONEY FOR THE ONES THE LOOP ABOVE DID NOT TOUCH.
       *
       * An order marked delivered by hand keeps its own status and date —
       * the person at the door knew what happened — but it was never given
       * an amount by anybody, because the door no longer writes one and this
       * sweep used to skip it. Its `collectedAmount` stayed null for ever.
       *
       * After the loop and excluding what the loop wrote, so no order is
       * updated twice and no version is bumped twice for one statement.
       * An amount already present is never overwritten: a correction is made
       * deliberately, not as a side effect of re-importing a file.
       */
      const promoted = new Set(inFlight.map((o) => o.id));
      const awaitingAmount = await tx.order.findMany({
        where: {
          id: { in: settledOrderIds.filter((oid) => !promoted.has(oid)) },
          companyId,
          collectedAmount: null,
        },
        select: { id: true },
      });
      for (const order of awaitingAmount) {
        const collected = amountOf.get(order.id);
        if (collected == null) continue;
        await tx.order.update({
          where: { id: order.id },
          data: { collectedAmount: collected, version: { increment: 1 } },
        });
      }

      return { row, deliveredCount: inFlight.length };
    });

    await logAudit({
      companyId, userId: user.id, action: 'STATEMENT_APPROVED',
      entity: 'CourierStatement', entityId: id,
      newData: { gap: gap.gap, explanation: explanation ?? null, receipts: statement.receipts.length },
    });

    return NextResponse.json({
      statement: approved.row,
      gap,
      // How many the statement itself closed, so the screen can say it
      // rather than leaving somebody to notice the tracking list shrank.
      deliveredByStatement: approved.deliveredCount,
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
