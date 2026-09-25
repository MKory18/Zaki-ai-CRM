// Frozen copy of the ORIGINAL src/lib/analytics.ts (pre-optimization).
// Imports re-pointed relatively so it can run standalone via tsx for parity testing.
// Do NOT modify its logic — it is the parity baseline.
//
// STALE ON ONE LINE, DELIBERATELY. This baseline reads commission from
// Order.moderatorCommission, the legacy per-order column. The live engine
// now reads the commission LEDGER, which is a different — and correct —
// number, so the commission and net-profit lines are EXPECTED to differ and
// the parity run is no longer a pass/fail on those two. Everything else it
// compares still holds.
import { db } from '../src/lib/db';
import { calculateRealProfit } from '../src/lib/financial';
import type { AiBusinessContext } from '../src/lib/ai';

export interface DateFilter {
  period?: 'today' | 'yesterday' | '7d' | '30d' | 'month' | 'last_month' | 'all';
  startDate?: string;
  endDate?: string;
}

export function getDateRange(filter: DateFilter): { start?: Date; end?: Date } {
  const now = new Date();
  const period = filter.period || 'all';

  if (filter.startDate && filter.endDate) {
    return {
      start: new Date(filter.startDate),
      end: new Date(filter.endDate),
    };
  }

  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  switch (period) {
    case 'today':
      return { start: todayStart, end: todayEnd };
    case 'yesterday': {
      const yStart = new Date(todayStart);
      yStart.setDate(yStart.getDate() - 1);
      const yEnd = new Date(todayEnd);
      yEnd.setDate(yEnd.getDate() - 1);
      return { start: yStart, end: yEnd };
    }
    case '7d': {
      const d7 = new Date(todayStart);
      d7.setDate(d7.getDate() - 7);
      return { start: d7, end: todayEnd };
    }
    case '30d': {
      const d30 = new Date(todayStart);
      d30.setDate(d30.getDate() - 30);
      return { start: d30, end: todayEnd };
    }
    case 'month': {
      const mStart = new Date(now.getFullYear(), now.getMonth(), 1);
      return { start: mStart, end: todayEnd };
    }
    case 'last_month': {
      const lmStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lmEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      return { start: lmStart, end: lmEnd };
    }
    case 'all':
    default:
      return {};
  }
}

export async function getCompanyAnalytics(companyId: string, filter: DateFilter = {}) {
  const { start, end } = getDateRange(filter);

  const dateQuery =
    start && end
      ? {
          createdAt: {
            gte: start,
            lte: end,
          },
        }
      : {};

  // Fetch all orders for this company in date range
  const orders = await db.order.findMany({
    where: {
      companyId,
      ...dateQuery,
    },
    include: {
      product: { select: { id: true, name: true, sku: true, image: true } },
      customer: { select: { id: true, fullName: true, phone: true, city: true } },
      moderator: { select: { id: true, name: true, email: true } },
      offer: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  // Fetch expenses
  const expenses = await db.expense.findMany({
    where: {
      companyId,
      ...(start && end ? { expenseDate: { gte: start, lte: end } } : {}),
    },
  });

  const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);

  // Group orders by status
  const totalOrders = orders.length;
  const newOrders = orders.filter((o) => o.status === 'NEW').length;
  const contactingOrders = orders.filter((o) => o.status === 'CONTACTING').length;
  const noAnswerOrders = orders.filter((o) => o.status === 'NO_ANSWER').length;
  const confirmedOrders = orders.filter((o) =>
    ['CONFIRMED', 'READY_FOR_SHIPPING', 'SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED'].includes(
      o.status
    )
  ).length;
  const postponedOrders = orders.filter((o) => o.status === 'POSTPONED').length;
  const rejectedOrders = orders.filter((o) =>
    ['REJECTED', 'CANCELLED', 'RETURNED', 'FAILED_DELIVERY'].includes(o.status)
  ).length;
  const shippedOrders = orders.filter((o) =>
    ['SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED'].includes(o.status)
  ).length;
  const deliveredOrdersList = orders.filter((o) => o.status === 'DELIVERED');
  const deliveredOrders = deliveredOrdersList.length;

  const confirmationRate = totalOrders > 0 ? (confirmedOrders / totalOrders) * 100 : 0;
  const deliveryRate = confirmedOrders > 0 ? (deliveredOrders / confirmedOrders) * 100 : 0;

  // Real profit calculation (exclusively on delivered orders)
  const profitBreakdown = calculateRealProfit({
    // The legacy column, kept so this frozen baseline still describes what
    // the old code did. The live path no longer reads it.
    deliveredOrders: deliveredOrdersList.map((o: { moderatorCommission?: number | null }) => ({
      ...(o as object),
      commission: Number(o.moderatorCommission ?? 0),
    })) as never,
    operationalExpenses: totalExpenses,
  });

  // Product Analysis & Ranking
  const productsMap = new Map<
    string,
    {
      id: string;
      name: string;
      sku: string;
      image: string | null;
      totalOrders: number;
      confirmedOrders: number;
      deliveredOrders: number;
      rejectedOrders: number;
      revenue: number;
      cogs: number;
      shippingCost: number;
      netProfit: number;
      profitMargin: number;
    }
  >();

  orders.forEach((o) => {
    if (!productsMap.has(o.productId)) {
      productsMap.set(o.productId, {
    id: o.productId,
    name: o.product.name,
    image: o.product.image || null,
        sku: o.product.sku,
        totalOrders: 0,
        confirmedOrders: 0,
        deliveredOrders: 0,
        rejectedOrders: 0,
        revenue: 0,
        cogs: 0,
        shippingCost: 0,
        netProfit: 0,
        profitMargin: 0,
      });
    }

    const p = productsMap.get(o.productId)!;
    p.totalOrders += 1;

    if (
      ['CONFIRMED', 'READY_FOR_SHIPPING', 'SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED'].includes(
        o.status
      )
    ) {
      p.confirmedOrders += 1;
    }
    if (['REJECTED', 'CANCELLED', 'RETURNED'].includes(o.status)) {
      p.rejectedOrders += 1;
    }
    if (o.status === 'DELIVERED') {
      p.deliveredOrders += 1;
      p.revenue += o.totalAmount;
      p.cogs += o.estimatedCostOfGoods;
      p.shippingCost += o.shippingCost;
    }
  });

  const productStats = Array.from(productsMap.values()).map((p) => {
    const netProfit = p.revenue - p.cogs - p.shippingCost;
    const profitMargin = p.revenue > 0 ? (netProfit / p.revenue) * 100 : 0;
    return {
      ...p,
      netProfit: Number(netProfit.toFixed(2)),
      profitMargin: Number(profitMargin.toFixed(1)),
    };
  });

  // Top Product Rankings
  const mostRequestedProduct = [...productStats].sort((a, b) => b.totalOrders - a.totalOrders)[0];
  const mostConfirmedProduct = [...productStats].sort(
    (a, b) => b.confirmedOrders - a.confirmedOrders
  )[0];
  const mostDeliveredProduct = [...productStats].sort(
    (a, b) => b.deliveredOrders - a.deliveredOrders
  )[0];
  const mostProfitableProduct = [...productStats].sort((a, b) => b.netProfit - a.netProfit)[0];
  const highestRejectionProduct = [...productStats]
    .filter((p) => p.totalOrders >= 1)
    .sort(
      (a, b) => b.rejectedOrders / (b.totalOrders || 1) - a.rejectedOrders / (a.totalOrders || 1)
    )[0];

  // Moderator Leaderboard
  const moderatorsMap = new Map<
    string,
    {
      id: string;
      name: string;
      email: string;
      totalOrders: number;
      confirmedOrders: number;
      rejectedOrders: number;
      deliveredOrders: number;
      sales: number;
      commissions: number;
      confirmationRate: number;
      deliveryRate: number;
    }
  >();

  orders.forEach((o) => {
    if (o.moderatorId && o.moderator) {
      if (!moderatorsMap.has(o.moderatorId)) {
        moderatorsMap.set(o.moderatorId, {
          id: o.moderatorId,
          name: o.moderator.name,
          email: o.moderator.email,
          totalOrders: 0,
          confirmedOrders: 0,
          rejectedOrders: 0,
          deliveredOrders: 0,
          sales: 0,
          commissions: 0,
          confirmationRate: 0,
          deliveryRate: 0,
        });
      }

      const m = moderatorsMap.get(o.moderatorId)!;
      m.totalOrders += 1;

      if (
        ['CONFIRMED', 'READY_FOR_SHIPPING', 'SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED'].includes(
          o.status
        )
      ) {
        m.confirmedOrders += 1;
      }
      if (['REJECTED', 'CANCELLED', 'RETURNED'].includes(o.status)) {
        m.rejectedOrders += 1;
      }
      if (o.status === 'DELIVERED') {
        m.deliveredOrders += 1;
        m.sales += o.totalAmount;
        m.commissions += o.moderatorCommission;
      }
    }
  });

  const moderatorLeaderboard = Array.from(moderatorsMap.values())
    .map((m) => ({
      ...m,
      sales: Number(m.sales.toFixed(2)),
      commissions: Number(m.commissions.toFixed(2)),
      confirmationRate:
        m.totalOrders > 0 ? Number(((m.confirmedOrders / m.totalOrders) * 100).toFixed(1)) : 0,
      deliveryRate:
        m.confirmedOrders > 0
          ? Number(((m.deliveredOrders / m.confirmedOrders) * 100).toFixed(1))
          : 0,
    }))
    .sort((a, b) => b.confirmedOrders - a.confirmedOrders);

  const topModerator = moderatorLeaderboard[0];

  // AI Business Context
  const aiContext: AiBusinessContext = {
    period: filter.period || 'all',
    total_orders: totalOrders,
    confirmed_orders: confirmedOrders,
    rejected_orders: rejectedOrders,
    postponed_orders: postponedOrders,
    delivered_orders: deliveredOrders,
    confirmation_rate: Number(confirmationRate.toFixed(1)),
    delivery_rate: Number(deliveryRate.toFixed(1)),
    revenue: profitBreakdown.deliveredRevenue,
    production_cost: profitBreakdown.costOfGoodsSold,
    shipping_cost: profitBreakdown.shippingCosts,
    commission: profitBreakdown.commission,
    operational_expenses: profitBreakdown.operationalExpenses,
    net_profit: profitBreakdown.netProfit,
    profit_margin: profitBreakdown.profitMargin,
    top_demanded_product: mostRequestedProduct?.name || 'N/A',
    top_profitable_product: mostProfitableProduct?.name || 'N/A',
    top_moderator: topModerator?.name || 'N/A',
    highest_rejection_product: highestRejectionProduct?.name || 'N/A',
  };

  return {
    period: filter.period || 'all',
    ordersCount: {
      total: totalOrders,
      new: newOrders,
      contacting: contactingOrders,
      noAnswer: noAnswerOrders,
      confirmed: confirmedOrders,
      postponed: postponedOrders,
      rejected: rejectedOrders,
      shipped: shippedOrders,
      delivered: deliveredOrders,
    },
    rates: {
      confirmationRate: Number(confirmationRate.toFixed(1)),
      deliveryRate: Number(deliveryRate.toFixed(1)),
    },
    financials: profitBreakdown,
    productStats,
    rankings: {
      mostRequested: mostRequestedProduct,
      mostConfirmed: mostConfirmedProduct,
      mostDelivered: mostDeliveredProduct,
      mostProfitable: mostProfitableProduct,
      highestRejection: highestRejectionProduct,
    },
    moderatorLeaderboard,
    topModerator,
    aiContext,
    orders,
  };
}
