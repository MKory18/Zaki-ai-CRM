import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { requireCompanyTenant } from '@/lib/auth';
import { assertOrderAccess } from '@/lib/rbac';
import { isValidSettlementTransition, computeFinancials, TRANSACTION_TYPES } from '@/lib/finance-workflow';
import { logAudit } from '@/lib/audit';
import { apiError } from '@/lib/api-error';
import { can } from '@/lib/authorization';

const D = (v: any) => new Prisma.Decimal(v ?? 0);
const toMoney = (v: any) => (v === null || v === undefined ? null : new Prisma.Decimal(v));

/**
 * GET /api/orders/[id]/finance — financial snapshot + transaction ledger
 * PATCH /api/orders/[id]/finance — update costs / settlement (permission-gated)
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { user, companyId } = await requireCompanyTenant();

    // Access: finance/settlement viewers get company-wide read; the order's own
    // agent keeps access via assertOrderAccess (assignment scope).
    const hasFinanceView = can(user, 'finance.view') || can(user, 'settlement.view');
    if (!hasFinanceView) {
      const access = await assertOrderAccess(id, user, companyId, 'orders.view');
      if (!access.allowed) {
        const map = { NOT_FOUND: 404, WRONG_COMPANY: 404, NOT_ASSIGNED: 403 } as const;
        return NextResponse.json({ error: 'Order not found' }, { status: map[access.reason] });
      }
    } else {
      // Finance viewers still must stay inside their own company (tenant isolation)
      const exists = await db.order.findFirst({ where: { id, companyId }, select: { id: true } });
      if (!exists) {
        return NextResponse.json({ error: 'Order not found' }, { status: 404 });
      }
    }

    const order = await db.order.findUnique({
      where: { id },
      select: {
        id: true, companyId: true, currency: true,
        sellingPrice: true, quantity: true, totalAmount: true,
        estimatedCostOfGoods: true, moderatorCommission: true, shippingCost: true,
        subtotal: true, discount: true, shippingRevenue: true, totalRevenue: true,
        productCost: true, packagingCost: true, advertisingCost: true, otherCost: true,
        refundAmount: true, grossProfit: true, netProfit: true,
        settlementStatus: true, financeFinalizedAt: true,
        financialTransactions: {
          orderBy: { createdAt: 'desc' },
          include: { actor: { select: { id: true, name: true } } },
        },
      },
    });

    return NextResponse.json({ finance: order });
  } catch (error) {
    const { body, status } = apiError(error);
    return NextResponse.json(body, { status });
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { user, companyId } = await requireCompanyTenant();

    const body = await req.json();
    const {
      productCost, packagingCost, advertisingCost, otherCost,
      discount, shippingRevenue, refundAmount, amount,
      settlementStatus, settlementNote, expectedVersion,
    } = body as Record<string, any>;

    const access = await assertOrderAccess(id, user, companyId, 'orders.view');
    if (!access.allowed) {
      const map = { NOT_FOUND: 404, WRONG_COMPANY: 404, NOT_ASSIGNED: 403 } as const;
      return NextResponse.json({ error: 'Order not found' }, { status: map[access.reason] });
    }
    const order = access.order;

    // ── Refund amount validation: ≥0 and ≤ totalAmount ──
    let refundNum: number | undefined;
    if (refundAmount !== undefined && refundAmount !== null) {
      refundNum = Number(refundAmount);
      if (!isFinite(refundNum) || refundNum < 0) {
        return NextResponse.json({ error: 'refundAmount must be a finite number ≥ 0' }, { status: 400 });
      }
      if (refundNum > Number(order.totalAmount)) {
        return NextResponse.json({ error: 'refundAmount cannot exceed the order total' }, { status: 400 });
      }
    }

    // ── Permission model (Section: roles) ──
    const isFinanceAuth = can(user, 'finance.create') || can(user, 'finance.update');
    const isSettlementAuth = can(user, 'settlement.review') || can(user, 'finance.update');
    if (!isFinanceAuth && !isSettlementAuth) {
      return NextResponse.json({ error: 'Forbidden: no financial authority' }, { status: 403 });
    }

    if (typeof expectedVersion !== 'number') {
      return NextResponse.json({ error: 'expectedVersion is required', code: 'VERSION_REQUIRED' }, { status: 400 });
    }
    if (expectedVersion !== order.version) {
      return NextResponse.json(
        {
          error: 'This order was updated by another user. Please refresh before saving.',
          errorAr: 'تم تعديل هذا الطلب بواسطة مستخدم آخر. يرجى تحديث الصفحة قبل الحفظ.',
          code: 'VERSION_CONFLICT',
        },
        { status: 409 }
      );
    }

    const updateData: Record<string, unknown> = {};
    const now = new Date();

    // ── Cost/revenue updates: finance authority only ──
    if (productCost !== undefined || packagingCost !== undefined || advertisingCost !== undefined ||
        otherCost !== undefined || discount !== undefined || shippingRevenue !== undefined) {
      if (!isFinanceAuth) {
        return NextResponse.json({ error: 'Forbidden: finance.update required to modify costs' }, { status: 403 });
      }
      // validate numerics (fail closed)
      const numOrReject = (v: any, name: string) => {
        if (v === undefined) return undefined;
        const n = Number(v);
        if (isNaN(n) || n < 0) throw new Error(`Invalid ${name}`);
        return n;
      };
      try {
        const pc = numOrReject(productCost, 'productCost');
        const pk = numOrReject(packagingCost, 'packagingCost');
        const ad = numOrReject(advertisingCost, 'advertisingCost');
        const oc = numOrReject(otherCost, 'otherCost');
        const dis = numOrReject(discount, 'discount');
        const sr = numOrReject(shippingRevenue, 'shippingRevenue');
        if (pc !== undefined) updateData.productCost = toMoney(pc);
        if (pk !== undefined) updateData.packagingCost = toMoney(pk);
        if (ad !== undefined) updateData.advertisingCost = toMoney(ad);
        if (oc !== undefined) updateData.otherCost = toMoney(oc);
        if (dis !== undefined) updateData.discount = toMoney(dis);
        if (sr !== undefined) updateData.shippingRevenue = toMoney(sr);
      } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 400 });
      }
    }

    // ── Settlement transition: settlement authority only, controlled map ──
    let settlementAmount: number | undefined;
    if (settlementStatus !== undefined) {
      if (!isSettlementAuth) {
        return NextResponse.json({ error: 'Forbidden: settlement authority required' }, { status: 403 });
      }
      if (!isValidSettlementTransition(order.settlementStatus, settlementStatus)) {
        return NextResponse.json(
          {
            error: `Invalid settlement transition: ${order.settlementStatus} → ${settlementStatus}`,
            errorAr: `انتقال تسوية غير صالح: ${order.settlementStatus} → ${settlementStatus}`,
            code: 'INVALID_TRANSITION',
          },
          { status: 409 }
        );
      }

      // PARTIALLY_SETTLED requires an explicit, positive amount within the remaining balance
      if (settlementStatus === 'PARTIALLY_SETTLED') {
        const amt = Number(amount);
        if (amount === undefined || !isFinite(amt) || amt <= 0) {
          return NextResponse.json({ error: 'PARTIALLY_SETTLED requires a positive amount' }, { status: 400 });
        }
        const total = Number(order.totalAmount);
        const alreadyRefunded = Number(order.refundAmount ?? 0);
        const remaining = Math.max(0, total - alreadyRefunded);
        if (amt > remaining) {
          return NextResponse.json({ error: `Amount exceeds the remaining balance (${remaining})` }, { status: 400 });
        }
        settlementAmount = amt;
      }

      updateData.settlementStatus = settlementStatus;
    }

    // ── Recompute financials (Decimal-safe) whenever components change ──
    const needsRecompute =
      updateData.productCost !== undefined || updateData.packagingCost !== undefined ||
      updateData.advertisingCost !== undefined || updateData.otherCost !== undefined ||
      updateData.discount !== undefined || updateData.shippingRevenue !== undefined;

    if (needsRecompute) {
      const fin = computeFinancials({
        sellingPrice: order.sellingPrice,
        quantity: order.quantity,
        discount: updateData.discount ?? order.discount ?? 0,
        shippingRevenue: updateData.shippingRevenue ?? order.shippingRevenue ?? 0,
        productCost: updateData.productCost ?? order.productCost ?? order.estimatedCostOfGoods,
        packagingCost: updateData.packagingCost ?? order.packagingCost ?? 0,
        shippingCost: order.shippingCost,
        advertisingCost: updateData.advertisingCost ?? order.advertisingCost ?? 0,
        otherCost: updateData.otherCost ?? order.otherCost ?? 0,
        moderatorCommission: order.moderatorCommission,
      });
      updateData.subtotal = fin.subtotal;
      updateData.totalRevenue = fin.totalRevenue;
      updateData.grossProfit = fin.grossProfit;
      updateData.netProfit = fin.netProfit;
    }

    updateData.version = { increment: 1 };

    const saved = await db.order.updateMany({
      where: { id, companyId, version: expectedVersion },
      data: updateData,
    });
    if (saved.count !== 1) {
      return NextResponse.json(
        {
          error: 'This order was updated by another user. Please refresh before saving.',
          errorAr: 'تم تعديل هذا الطلب بواسطة مستخدم آخر. يرجى تحديث الصفحة قبل الحفظ.',
          code: 'VERSION_CONFLICT',
        },
        { status: 409 }
      );
    }

    // ── Append-only ledger entry for settlement/refund movements ──
    if (settlementStatus !== undefined && ['SETTLED', 'REFUNDED', 'PARTIALLY_SETTLED', 'PARTIALLY_REFUNDED'].includes(settlementStatus)) {
      const type = settlementStatus === 'REFUNDED' || settlementStatus === 'PARTIALLY_REFUNDED' ? 'REFUND' : 'SETTLEMENT';
      // PARTIALLY_SETTLED uses the explicit validated amount; everything else
      // uses refundAmount (if given) or the full order total — never a hardcoded 50%.
      const amountForLedger =
        settlementStatus === 'PARTIALLY_SETTLED'
          ? toMoney(settlementAmount) ?? D(0)
          : refundNum !== undefined
          ? toMoney(refundNum) ?? D(0)
          : toMoney(order.totalAmount) ?? D(0);
      await db.financialTransaction.create({
        data: {
          companyId, orderId: id,
          type,
          amount: amountForLedger,
          currency: order.currency,
          note: settlementNote?.trim() || `Settlement → ${settlementStatus}`,
          createdById: user.id,
        },
      });
    }

    // Status log for every settlement-status change
    if (settlementStatus !== undefined && settlementStatus !== order.settlementStatus) {
      await db.orderStatusLog.create({
        data: {
          companyId,
          orderId: id,
          statusType: 'SETTLEMENT',
          previousValue: order.settlementStatus,
          newValue: settlementStatus,
          changedById: user.id,
          changedByRole: user.role,
          note: settlementNote?.trim() || null,
        },
      });
    }

    await db.orderActivity.create({
      data: {
        companyId, orderId: id, userId: user.id, action: 'ORDER_UPDATED',
        metadata: JSON.stringify({
          financeUpdate: true, by: user.name, role: user.role,
          settlementStatus: settlementStatus ?? undefined,
          fields: Object.keys(updateData).filter((k) => !k.startsWith('version')),
        }),
      },
    });
    await logAudit({
      companyId, userId: user.id, action: 'FINANCE_UPDATED',
      entity: 'Order', entityId: id,
      previousData: { settlementStatus: order.settlementStatus, version: order.version },
      newData: { settlementStatus, by: user.name },
    });

    const fresh = await db.order.findUnique({ where: { id } });
    return NextResponse.json({ success: true, order: fresh });
  } catch (error) {
    const { body, status } = apiError(error);
    return NextResponse.json(body, { status });
  }
}
