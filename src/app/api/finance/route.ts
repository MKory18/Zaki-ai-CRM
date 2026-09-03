import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireCompanyTenant, requirePermission } from '@/lib/auth';
import { logAudit } from '@/lib/audit';

export async function GET(req: Request) {
  try {
    const { companyId } = await requireCompanyTenant();
    await requirePermission('finance.view');

    const expenses = await db.expense.findMany({
      where: { companyId },
      orderBy: { expenseDate: 'desc' },
    });

    const deliveredOrders = await db.order.findMany({
      where: { companyId, status: 'DELIVERED' },
      select: {
        id: true,
        orderNumber: true,
        totalAmount: true,
        shippingCost: true,
        estimatedCostOfGoods: true,
        moderatorCommission: true,
        deliveredAt: true,
      },
      orderBy: { deliveredAt: 'desc' },
    });

    const totalRevenue = deliveredOrders.reduce((s, o) => s + o.totalAmount, 0);
    const totalCOGS = deliveredOrders.reduce((s, o) => s + o.estimatedCostOfGoods, 0);
    const totalShipping = deliveredOrders.reduce((s, o) => s + o.shippingCost, 0);
    const totalCommissions = deliveredOrders.reduce((s, o) => s + o.moderatorCommission, 0);
    const totalOperationalExpenses = expenses.reduce((s, e) => s + e.amount, 0);

    const netProfit =
      totalRevenue -
      totalCOGS -
      totalShipping -
      totalCommissions -
      totalOperationalExpenses;

    return NextResponse.json({
      summary: {
        totalRevenue: Number(totalRevenue.toFixed(2)),
        totalCOGS: Number(totalCOGS.toFixed(2)),
        totalShipping: Number(totalShipping.toFixed(2)),
        totalCommissions: Number(totalCommissions.toFixed(2)),
        totalOperationalExpenses: Number(totalOperationalExpenses.toFixed(2)),
        netProfit: Number(netProfit.toFixed(2)),
        profitMargin:
          totalRevenue > 0 ? Number(((netProfit / totalRevenue) * 100).toFixed(1)) : 0,
      },
      expenses,
      recentDeliveredOrders: deliveredOrders.slice(0, 20),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}

export async function POST(req: Request) {
  try {
    const { user, companyId } = await requireCompanyTenant();
    await requirePermission('finance.view');

    const body = await req.json();
    const { title, category, amount, expenseDate, notes } = body;

    if (!title || !category || !amount) {
      return NextResponse.json(
        { error: 'Title, Category, and Amount are required' },
        { status: 400 }
      );
    }

    const expense = await db.expense.create({
      data: {
        companyId,
        title: title.trim(),
        category, // MANUFACTURING, PACKAGING, SHIPPING, MARKETING, COMMISSION, SALARIES, OFFICE, OTHER
        amount: parseFloat(amount),
        expenseDate: expenseDate ? new Date(expenseDate) : new Date(),
        notes: notes?.trim() || null,
        createdById: user.id,
      },
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
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
