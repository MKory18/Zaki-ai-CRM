import { db } from './db';
import { calculateRealProfit } from './financial';
import { AiBusinessContext } from './ai';

export interface DateFilter {
  period?: 'today' | 'yesterday' | '7d' | '30d' | 'month' | 'last_month' | 'all';
  startDate?: string;
  endDate?: string;
}

// Hard safety clamp: any computed window wider than 90 days is reduced to the
// last 90 days server-side. This bounds every aggregate query below via the
// orders_companyId_createdAt_idx and keeps memory/CPU predictable. 'all' is
// clamped internally to 90 days too (the frontend keeps sending 'all').
const MAX_WINDOW_DAYS = 90;

const CONFIRMED_STATUSES = ['CONFIRMED', 'READY_FOR_SHIPPING', 'SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED'];
const REJECTED_STATUSES = ['REJECTED', 'CANCELLED', 'RETURNED', 'FAILED_DELIVERY'];
const PRODUCT_REJECTED_STATUSES = ['REJECTED', 'CANCELLED', 'RETURNED'];
const SHIPPED_STATUSES = ['SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED'];

/** The earliest moment any analytics query may reach back to. */
function windowStart(): Date {
  const min = new Date();
  min.setHours(0, 0, 0, 0);
  min.setDate(min.getDate() - MAX_WINDOW_DAYS);
  return min;
}

/** An explicit start, pulled forward if it reaches past the safety window. */
function clampStart(start: Date): Date {
  const min = windowStart();
  return start < min ? min : start;
}

export function getDateRange(filter: DateFilter): { start?: Date; end?: Date } {
  const now = new Date();
  const period = filter.period || 'all';

  if (filter.startDate && filter.endDate) {
    // Explicit ranges are also clamped to the 90-day safety window
    let start = new Date(filter.startDate);
    const end = new Date(filter.endDate);
    if (end.getTime() - start.getTime() > MAX_WINDOW_DAYS * 24 * 60 * 60 * 1000) {
      start = clampStart(start);
    }
    return { start, end };
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
      // "الكل" means the whole safety window, not today. It used to call
      // clampStart(todayStart), and clamping TODAY against a 90-day-ago
      // minimum returns today — so every headline figure on the dashboard
      // was the last 24 hours wearing the label "الكل".
      return { start: windowStart(), end: todayEnd };
  }
}

function round1(n: number): number {
  return Number(n.toFixed(1));
}

function round2(n: number): number {
  return Number(n.toFixed(2));
}

/**
 * scope.storeId = one store's orders; null = every store of the company
 * (company-level reports such as the AI daily summary). Expenses have no
 * store dimension yet and are always company-wide.
 */
export async function getCompanyAnalytics(
  scope: { companyId: string; storeId: string | null },
  filter: DateFilter = {}
) {
  const { companyId, storeId } = scope;
  const { start, end } = getDateRange(filter);

  const dateFilter =
    start && end
      ? {
          createdAt: {
            gte: start,
            lte: end,
          },
        }
      : {};

  const baseWhere = { companyId, ...(storeId ? { storeId } : {}), ...dateFilter };

  // ─── 1. Status breakdown: single GROUP BY instead of fetching all rows ───
  const statusGroups = await db.order.groupBy({
    by: ['status'],
    where: baseWhere,
    _count: { _all: true },
  });

  const statusCount = new Map<string, number>();
  let totalOrders = 0;
  for (const g of statusGroups) {
    const c = g._count._all;
    statusCount.set(g.status, c);
    totalOrders += c;
  }
  const countOf = (statuses: string[]) =>
    statuses.reduce((sum, s) => sum + (statusCount.get(s) || 0), 0);

  const newOrders = statusCount.get('NEW') || 0;
  const contactingOrders = statusCount.get('CONTACTING') || 0;
  const noAnswerOrders = statusCount.get('NO_ANSWER') || 0;
  const confirmedOrders = countOf(CONFIRMED_STATUSES);
  const postponedOrders = statusCount.get('POSTPONED') || 0;
  const rejectedOrders = countOf(REJECTED_STATUSES);
  const shippedOrders = countOf(SHIPPED_STATUSES);
  const deliveredOrders = statusCount.get('DELIVERED') || 0;

  const confirmationRate = totalOrders > 0 ? (confirmedOrders / totalOrders) * 100 : 0;
  const deliveryRate = confirmedOrders > 0 ? (deliveredOrders / confirmedOrders) * 100 : 0;

  // ─── 2. Delivered-order financial aggregates + expenses (SUM in PostgreSQL) ───
  const [deliveredAgg, expensesAgg] = await Promise.all([
    db.order.aggregate({
      where: { ...baseWhere, status: 'DELIVERED' },
      _sum: {
        totalAmount: true,
        estimatedCostOfGoods: true,
        shippingCost: true,
        moderatorCommission: true,
      },
      _count: { _all: true },
    }),
    db.expense.aggregate({
      where: {
        companyId,
        ...(start && end ? { expenseDate: { gte: start, lte: end } } : {}),
      },
      _sum: { amount: true },
    }),
  ]);

  const totalExpenses = expensesAgg._sum.amount || 0;

  // calculateRealProfit works on an order list; feeding it the pre-aggregated
  // sums reproduces the exact same arithmetic (and rounding) without loading rows.
  const profitBreakdown = calculateRealProfit({
    deliveredOrders: [
      {
        sellingPrice: 0,
        totalAmount: deliveredAgg._sum.totalAmount || 0,
        quantity: deliveredAgg._count._all || 1,
        shippingCost: deliveredAgg._sum.shippingCost || 0,
        moderatorCommission: deliveredAgg._sum.moderatorCommission || 0,
        estimatedCostOfGoods: deliveredAgg._sum.estimatedCostOfGoods || 0,
      },
    ],
    operationalExpenses: totalExpenses,
  });

  // ─── 3. Product stats, read from the order LINES ───
  //
  // Grouping on orders.productId counts a whole order against its first
  // product: an order holding a cream and a serum put both its revenue and
  // its delivery under the cream, and the serum looked like it never sold.
  // The lines are where the products actually are, so each one is counted
  // with its own quantity and its own share of the money.
  const lineGroups = await db.orderItem.groupBy({
    by: ['productId', 'orderId'],
    where: { order: baseWhere },
    _sum: { lineTotal: true, quantity: true },
  });

  // The status and the costs belong to the ORDER; a line inherits them, and
  // the order's costs are split across its lines by their share of value so
  // the parts still add back up to the whole.
  const orderIds = Array.from(new Set(lineGroups.map((g) => g.orderId)));
  const orderRows = orderIds.length
    ? await db.order.findMany({
        where: { id: { in: orderIds } },
        select: {
          id: true, status: true, totalAmount: true,
          estimatedCostOfGoods: true, shippingCost: true,
        },
      })
    : [];
  const orderOf = new Map(orderRows.map((o) => [o.id, o]));

  // Each order's total line value, to allocate its costs proportionally.
  const orderLineValue = new Map<string, number>();
  for (const g of lineGroups) {
    orderLineValue.set(g.orderId, (orderLineValue.get(g.orderId) ?? 0) + Number(g._sum.lineTotal ?? 0));
  }

  const productGroups = lineGroups.map((g) => {
    const order = orderOf.get(g.orderId);
    const share = (() => {
      const whole = orderLineValue.get(g.orderId) ?? 0;
      if (whole <= 0) return 1;
      return Number(g._sum.lineTotal ?? 0) / whole;
    })();
    return {
      productId: g.productId,
      status: order?.status ?? 'NEW',
      _count: { _all: 1 },
      _sum: {
        totalAmount: (Number(order?.totalAmount ?? 0)) * share,
        estimatedCostOfGoods: (Number(order?.estimatedCostOfGoods ?? 0)) * share,
        shippingCost: (Number(order?.shippingCost ?? 0)) * share,
      },
    };
  });

  const productIds = Array.from(new Set(productGroups.map((g) => g.productId)));
  const products = productIds.length
    ? await db.product.findMany({
        where: { id: { in: productIds }, companyId },
        select: { id: true, name: true, sku: true, image: true },
      })
    : [];
  const productInfo = new Map(products.map((p) => [p.id, p]));

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

  for (const g of productGroups) {
    if (!productsMap.has(g.productId)) {
      const info = productInfo.get(g.productId);
      productsMap.set(g.productId, {
        id: g.productId,
        name: info?.name || 'منتج محذوف',
        image: info?.image || null,
        sku: info?.sku || 'N/A',
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
    const p = productsMap.get(g.productId)!;
    p.totalOrders += g._count._all;
    if (CONFIRMED_STATUSES.includes(g.status)) p.confirmedOrders += g._count._all;
    if (PRODUCT_REJECTED_STATUSES.includes(g.status)) p.rejectedOrders += g._count._all;
    if (g.status === 'DELIVERED') {
      p.deliveredOrders += g._count._all;
      p.revenue += g._sum.totalAmount || 0;
      p.cogs += g._sum.estimatedCostOfGoods || 0;
      p.shippingCost += g._sum.shippingCost || 0;
    }
  }

  const productStats = Array.from(productsMap.values()).map((p) => {
    const netProfit = p.revenue - p.cogs - p.shippingCost;
    const profitMargin = p.revenue > 0 ? (netProfit / p.revenue) * 100 : 0;
    return {
      ...p,
      netProfit: round2(netProfit),
      profitMargin: round1(profitMargin),
    };
  });

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

  // ─── 4. Moderator leaderboard: GROUP BY (moderatorId, status) ───
  const moderatorGroups = await db.order.groupBy({
    by: ['moderatorId', 'status'],
    where: { ...baseWhere, moderatorId: { not: null } },
    _count: { _all: true },
    _sum: {
      totalAmount: true,
      moderatorCommission: true,
    },
  });

  const moderatorIds = Array.from(
    new Set(moderatorGroups.map((g) => g.moderatorId).filter((id): id is string => !!id))
  );
  const moderators = moderatorIds.length
    ? await db.user.findMany({
        where: { id: { in: moderatorIds }, companyId },
        select: { id: true, name: true, email: true },
      })
    : [];
  const moderatorInfo = new Map(moderators.map((m) => [m.id, m]));

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

  for (const g of moderatorGroups) {
    if (!g.moderatorId) continue;
    if (!moderatorsMap.has(g.moderatorId)) {
      const info = moderatorInfo.get(g.moderatorId);
      moderatorsMap.set(g.moderatorId, {
        id: g.moderatorId,
        name: info?.name || 'Unknown',
        email: info?.email || 'N/A',
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
    const m = moderatorsMap.get(g.moderatorId)!;
    m.totalOrders += g._count._all;
    if (CONFIRMED_STATUSES.includes(g.status)) m.confirmedOrders += g._count._all;
    if (PRODUCT_REJECTED_STATUSES.includes(g.status)) m.rejectedOrders += g._count._all;
    if (g.status === 'DELIVERED') {
      m.deliveredOrders += g._count._all;
      m.sales += g._sum.totalAmount || 0;
      m.commissions += g._sum.moderatorCommission || 0;
    }
  }

  const moderatorLeaderboard = Array.from(moderatorsMap.values())
    .map((m) => ({
      ...m,
      sales: round2(m.sales),
      commissions: round2(m.commissions),
      confirmationRate: m.totalOrders > 0 ? round1((m.confirmedOrders / m.totalOrders) * 100) : 0,
      deliveryRate:
        m.confirmedOrders > 0 ? round1((m.deliveredOrders / m.confirmedOrders) * 100) : 0,
    }))
    .sort((a, b) => b.confirmedOrders - a.confirmedOrders);

  const topModerator = moderatorLeaderboard[0];

  // ─── 5. Recent orders: bounded take:10 (the dashboard renders only the first 8) ───
  const orders = await db.order.findMany({
    where: baseWhere,
    include: {
      product: { select: { id: true, name: true, sku: true, image: true } },
      customer: { select: { id: true, fullName: true, phone: true, city: true } },
      moderator: { select: { id: true, name: true, email: true } },
      offer: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });

  // ─── 6. AI Business Context ───
  const aiContext: AiBusinessContext = {
    period: filter.period || 'all',
    total_orders: totalOrders,
    confirmed_orders: confirmedOrders,
    rejected_orders: rejectedOrders,
    postponed_orders: postponedOrders,
    delivered_orders: deliveredOrders,
    confirmation_rate: round1(confirmationRate),
    delivery_rate: round1(deliveryRate),
    revenue: profitBreakdown.deliveredRevenue,
    production_cost: profitBreakdown.costOfGoodsSold,
    shipping_cost: profitBreakdown.shippingCosts,
    moderator_commission: profitBreakdown.moderatorCommissions,
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
      confirmationRate: round1(confirmationRate),
      deliveryRate: round1(deliveryRate),
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
