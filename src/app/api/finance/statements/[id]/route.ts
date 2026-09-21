import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireContext } from '@/lib/geo-context';
import { requirePermission } from '@/lib/authorization';
import { apiErrorResponse } from '@/lib/api-error';
import { logAudit } from '@/lib/audit';
import { consumeOrderStock } from '@/lib/stock-consumption';
import { receiptGap } from '@/lib/settlement';
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
      include: { receipts: true, matches: { select: { orderId: true, result: true, statementAmount: true } } },
    });
    if (!statement) return NextResponse.json({ error: 'الكشف غير موجود' }, { status: 404 });
    if (statement.status === 'APPROVED') {
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
    if (statement.receipts.length === 0) {
      return NextResponse.json(
        { error: 'لا يمكن اعتماد كشف بلا إيصالات استلام', code: 'NO_RECEIPTS' },
        { status: 409 }
      );
    }
    const gap = await receiptGap(db, id, country.minorUnit);
    const explanation = parsed.data.gapExplanation ?? statement.gapExplanation;
    if (gap.needsExplanation && !explanation) {
      return NextResponse.json(
        {
          error: `الفرق ${gap.gap} بين ما أقرّته الشركة وما وصل يحتاج تفسيراً مكتوباً قبل الاعتماد`,
          code: 'GAP_REQUIRES_EXPLANATION',
          gap,
        },
        { status: 409 }
      );
    }
    if (statement.matches.length === 0) {
      return NextResponse.json(
        { error: 'شغّل المطابقة قبل الاعتماد', code: 'MATCHING_REQUIRED' },
        { status: 409 }
      );
    }

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

      // ── The statement IS the delivery proof ──
      //
      // The courier has told us, in writing, that they delivered this
      // parcel and collected this amount. Reading that and then asking
      // somebody to tick "delivered" by hand is the same fact entered
      // twice — and every order nobody got round to ticking sat in the
      // tracking list forever, long after the money had arrived.
      //
      // Only the ones still in flight are moved: an order already marked
      // delivered keeps its own date and amount, because whoever stood
      // there and recorded it knew more than a spreadsheet does.
      const inFlight = await tx.order.findMany({
        where: {
          id: { in: settledOrderIds },
          companyId,
          shippingStatus: { in: ['SHIPPED', 'OUT_FOR_DELIVERY', 'READY_FOR_PICKUP'] },
        },
        select: { id: true, orderNumber: true },
      });
      const amountOf = new Map(
        matched.map((m) => [m.orderId as string, m.statementAmount == null ? null : Number(m.statementAmount)])
      );
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
