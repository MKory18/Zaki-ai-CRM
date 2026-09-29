import { NextResponse } from 'next/server';
import type { ProfitSummary } from '@/lib/profit-summary';
import { apiErrorResponse } from '@/lib/api-error';
import { db } from '@/lib/db';
import { requireContext } from '@/lib/geo-context';
import { logAudit } from '@/lib/audit';
import { requirePermission } from '@/lib/authorization';
import { commissionCostForOrders } from '@/lib/commission';
import { getCompanyAnalytics, getDateRange, previousRange } from '@/lib/analytics';
import { gradeExpenseTypes, ledgerTrust, type ExpenseTypeInput } from '@/lib/expense-grade';

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

    /**
     * ─── WHERE THE MONEY GOES, BY KIND OF SPENDING ───
     *
     * The ledger below lists rows and nothing adds them up per type, so the
     * one question an owner has about spending — «على أيّ بند يذهب مالي،
     * وأيّ بندٍ يكبر من تحتي» — had no answer on any screen in this product.
     *
     * ON ITS OWN WINDOW, DELIBERATELY. Everything else this route returns is
     * «since the beginning»: a lifetime total is the right shape for a
     * profit summary and the wrong shape entirely for a spending habit,
     * because a habit is only visible as a change. So the types are read
     * over THIS MONTH against LAST MONTH, equally long, which is also the
     * period people already think about salaries and rent in. The screen
     * says which window it is showing.
     *
     * THE TWO ANALYTICS CALLS ARE SKIPPED WHEN THERE IS NOTHING TO GRADE.
     * Revenue is the burden's denominator and it must come from the one
     * profit engine — computing it here would be a second definition of
     * «delivered revenue», which is the most expensive kind of duplication
     * in this system. But it is only needed if an expense exists at all, and
     * on this database none does, so the common case pays nothing.
     */
    const spendFilter = { period: 'month' as const };
    const thisMonth = getDateRange(spendFilter);
    const lastMonth = previousRange(spendFilter);

    const [monthRows, priorRows] = await Promise.all([
      db.expense.groupBy({
        by: ['category'],
        where: {
          companyId,
          ...(thisMonth.start && thisMonth.end ? { expenseDate: { gte: thisMonth.start, lte: thisMonth.end } } : {}),
        },
        _count: { _all: true },
        _sum: { amount: true },
      }),
      lastMonth
        ? db.expense.groupBy({
            by: ['category'],
            where: { companyId, expenseDate: { gte: lastMonth.start, lte: lastMonth.end } },
            _count: { _all: true },
            _sum: { amount: true },
          })
        : Promise.resolve([]),
    ]);

    const monthSpend = monthRows.reduce((t, g) => t + Number(g._sum.amount ?? 0), 0);
    const monthCount = monthRows.reduce((t, g) => t + g._count._all, 0);

    let spendByType: ReturnType<typeof gradeExpenseTypes> = [];
    let spendWindow: { deliveredRevenue: number; priorDeliveredRevenue: number | null; totalSpend: number } = {
      deliveredRevenue: 0,
      priorDeliveredRevenue: null,
      totalSpend: 0,
    };

    if (monthCount > 0) {
      const [now, before] = await Promise.all([
        getCompanyAnalytics({ companyId, storeId }, spendFilter),
        lastMonth
          ? getCompanyAnalytics({ companyId, storeId }, spendFilter, lastMonth)
          : Promise.resolve(null),
      ]);
      spendWindow = {
        totalSpend: Number(monthSpend.toFixed(2)),
        deliveredRevenue: now.financials.deliveredRevenue,
        priorDeliveredRevenue: before ? before.financials.deliveredRevenue : null,
      };

      const priorOf = new Map(priorRows.map((g) => [g.category, g]));
      const inputs: ExpenseTypeInput[] = monthRows.map((g) => {
        const was = priorOf.get(g.category);
        return {
          category: g.category,
          rows: g._count._all,
          amount: Number(g._sum.amount ?? 0),
          // Zero, not null, when last month HAS expenses but none of this
          // kind: «nothing was spent on packaging» and «there was no last
          // month» are different facts, and only the first makes a type NEW.
          priorAmount: was ? Number(was._sum.amount ?? 0) : lastMonth && priorRows.length > 0 ? 0 : null,
          priorRows: was?._count._all ?? 0,
        };
      });
      spendByType = gradeExpenseTypes(inputs, spendWindow);
    }

    // Does the ledger tie to money that actually left a wallet? Asked over
    // the whole ledger, because it is a question about bookkeeping habit
    // rather than about any one month.
    const withWallet = expenses.filter((e) => !!e.walletId).length;

    return NextResponse.json({
      // The country's own currency. The screen printed "$" beside every
      // figure in a system that runs Syrian pounds, dinars and Egyptian
      // pounds side by side.
      currency: country.currencyCode,
      summary,
      expenses,
      recentDeliveredOrders: deliveredOrders.slice(0, 20),
      spend: {
        byType: spendByType,
        rows: monthCount,
        totalSpend: spendWindow.totalSpend,
        deliveredRevenue: spendWindow.deliveredRevenue,
        priorDeliveredRevenue: spendWindow.priorDeliveredRevenue,
        hasPrevious: !!lastMonth,
        ledger: ledgerTrust(withWallet, expenses.length),
        window: {
          from: thisMonth.start?.toISOString() ?? null,
          to: thisMonth.end?.toISOString() ?? null,
        },
      },
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
