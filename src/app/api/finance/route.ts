import { NextResponse } from 'next/server';
import type { ProfitSummary } from '@/lib/profit-summary';
import { apiErrorResponse } from '@/lib/api-error';
import { db } from '@/lib/db';
import { requireContext } from '@/lib/geo-context';
import { logAudit } from '@/lib/audit';
import { requirePermission } from '@/lib/authorization';
import { commissionCostForOrders } from '@/lib/commission';

export async function GET(req: Request) {
  try {
    const { companyId, storeId, country } = await requireContext();
    await requirePermission('finance.view');

    const expenses = await db.expense.findMany({
      where: { companyId },
      orderBy: { expenseDate: 'desc' },
    });

    const deliveredOrders = await db.order.findMany({
      where: { companyId, storeId, status: 'DELIVERED' },
      select: {
        id: true,
        orderNumber: true,
        totalAmount: true,
        shippingCost: true,
        estimatedCostOfGoods: true,
        deliveredAt: true,
      },
      orderBy: { deliveredAt: 'desc' },
    });

    const totalRevenue = deliveredOrders.reduce((s, o) => s + o.totalAmount, 0);
    const totalCOGS = deliveredOrders.reduce((s, o) => s + o.estimatedCostOfGoods, 0);
    const totalShipping = deliveredOrders.reduce((s, o) => s + o.shippingCost, 0);
    // From the LEDGER — the one commission source. Summing
    // Order.moderatorCommission here gave this screen a different total
    // from the commission screen for the same orders.
    // NOTE: the delivered-order query above still selects on the legacy
    // `status` column, so revenue and commission here are computed over
    // slightly different sets of orders. That mismatch predates this change
    // and is reported, not silently repaired — correcting it moves the
    // revenue figure on this screen.
    const totalCommissions = await commissionCostForOrders({ companyId, storeId, shippingStatus: 'DELIVERED' });
    const totalOperationalExpenses = expenses.reduce((s, e) => s + e.amount, 0);

    const netProfit =
      totalRevenue -
      totalCOGS -
      totalShipping -
      totalCommissions -
      totalOperationalExpenses;

    // Typed against the one shape the screen also uses: a field added
    // here without adding it there is a crash on the screen, so the two
    // lists are the same list.
    const summary: ProfitSummary = {
      totalRevenue: Number(totalRevenue.toFixed(2)),
      totalCOGS: Number(totalCOGS.toFixed(2)),
      totalShipping: Number(totalShipping.toFixed(2)),
      totalCommissions: Number(totalCommissions.toFixed(2)),
      // The two are shown together on the profit screen, so they are
      // added HERE. Added in the browser they disagreed with the books
      // the moment either rule changed on this side.
      shippingAndCommissions: Number((totalShipping + totalCommissions).toFixed(2)),
      totalOperationalExpenses: Number(totalOperationalExpenses.toFixed(2)),
      netProfit: Number(netProfit.toFixed(2)),
      profitMargin: totalRevenue > 0 ? Number(((netProfit / totalRevenue) * 100).toFixed(1)) : 0,
    };

    return NextResponse.json({
      // The country's own currency. The screen printed "$" beside every
      // figure in a system that runs Syrian pounds, dinars and Egyptian
      // pounds side by side.
      currency: country.currencyCode,
      summary,
      expenses,
      recentDeliveredOrders: deliveredOrders.slice(0, 20),
    });
  } catch (error: any) {
    return apiErrorResponse(error);
  }
}

export async function POST(req: Request) {
  try {
    const { user, companyId } = await requireContext();
    // Phase S: writing expenses requires finance.create (not just view)
    await requirePermission('finance.create');

    const body = await req.json();
    const { title, category, amount, expenseDate, notes, walletId } = body;

    if (!title || !category || !amount) {
      return NextResponse.json({ error: 'العنوان والفئة والمبلغ مطلوبة' }, { status: 400 });
    }

    const value = parseFloat(amount);
    if (!Number.isFinite(value) || value <= 0) {
      return NextResponse.json({ error: 'المبلغ رقم موجب' }, { status: 400 });
    }

    /**
     * WHICH WALLET THE MONEY LEFT.
     *
     * Required. An expense recorded with no wallet was money that had left
     * the company and existed nowhere in the wallet ledger — so the daily
     * closing, which compares the drawer against the book balance, showed a
     * shortfall nobody could explain, and somebody wrote an explanation for
     * an expense that was already recorded on another screen.
     */
    if (!walletId) {
      return NextResponse.json({ error: 'اختر المحفظة التي خرج منها المال' }, { status: 400 });
    }
    const wallet = await db.wallet.findFirst({
      where: { id: walletId, companyId, isActive: true },
      select: { id: true, name: true, currencyCode: true },
    });
    if (!wallet) {
      return NextResponse.json({ error: 'المحفظة غير موجودة أو موقوفة' }, { status: 404 });
    }

    // Both in one transaction: an expense without its movement is the fault
    // coming back, and a movement without its expense is money leaving with
    // no reason written beside it.
    const expense = await db.$transaction(async (tx) => {
      const row = await tx.expense.create({
        data: {
          companyId,
          title: title.trim(),
          category, // MANUFACTURING, PACKAGING, SHIPPING, MARKETING, COMMISSION, SALARIES, OFFICE, OTHER
          amount: value,
          expenseDate: expenseDate ? new Date(expenseDate) : new Date(),
          notes: notes?.trim() || null,
          walletId: wallet.id,
          createdById: user.id,
        },
      });

      const movement = await tx.walletMovement.create({
        data: {
          companyId,
          walletId: wallet.id,
          direction: 'OUT',
          amount: value,
          currencyCode: wallet.currencyCode,
          party: title.trim(),
          category: 'EXPENSE',
          note: notes?.trim() || null,
          referenceType: 'EXPENSE',
          referenceId: row.id,
          createdById: user.id,
        },
      });

      return tx.expense.update({ where: { id: row.id }, data: { movementId: movement.id } });
    });

    await logAudit({
      companyId,
      userId: user.id,
      action: 'EXPENSE_RECORDED',
      entity: 'Expense',
      entityId: expense.id,
      newData: expense,
    });

    return NextResponse.json({ success: true, expense });
  } catch (error: any) {
    return apiErrorResponse(error);
  }
}
