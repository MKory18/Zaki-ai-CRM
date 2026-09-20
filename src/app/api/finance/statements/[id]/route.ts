import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireContext } from '@/lib/geo-context';
import { requirePermission } from '@/lib/authorization';
import { apiErrorResponse } from '@/lib/api-error';
import { logAudit } from '@/lib/audit';
import { receiptGap } from '@/lib/settlement';
import { recordMovement } from '@/lib/wallets';
import { markPayableForOrders } from '@/lib/commission';

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
      return NextResponse.json({ error: parsed.error.issues[0]?.message || 'بيانات غير صالحة' }, { status: 400 });
    }

    const statement = await db.courierStatement.findFirst({
      where: { id, companyId, storeId },
      include: { receipts: true, matches: { select: { orderId: true, result: true } } },
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
      const settledOrderIds = statement.matches
        .filter((m) => m.result === 'MATCHED' && m.orderId)
        .map((m) => m.orderId as string);
      await markPayableForOrders(tx, companyId, settledOrderIds);
      if (settledOrderIds.length > 0) {
        await tx.order.updateMany({
          where: { id: { in: settledOrderIds }, companyId },
          data: { settlementStatus: 'SETTLED' },
        });
      }

      return row;
    });

    await logAudit({
      companyId, userId: user.id, action: 'STATEMENT_APPROVED',
      entity: 'CourierStatement', entityId: id,
      newData: { gap: gap.gap, explanation: explanation ?? null, receipts: statement.receipts.length },
    });

    return NextResponse.json({ statement: approved, gap });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
