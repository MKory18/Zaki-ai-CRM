/**
 * SALESFLOW Financial Calculation Engine
 * Strict, audit-proof calculation of Production Cost, Unit Cost, and Real Net Profit
 */

/*
 * A SECOND BATCH-COST CALCULATOR LIVED HERE, AND IT DISAGREED.
 *
 * `calculateBatchCosts` summed the four legacy buckets and nothing else —
 * it did not know about a batch's free-form cost lines at all — and it
 * rounded the total to two places where the live one rounds to four.
 * Nothing called it, so it cost nobody money; it was a loaded gun. The
 * next person to find a file named «Financial Calculation Engine» and use
 * it would have dropped every free-form line out of the cost of goods.
 *
 * The one calculator is `batchTotal` / `batchUnitCost` in product-cost.ts.
 * Removed rather than fixed: two of them is the fault, not the arithmetic.
 */

export interface RealProfitInput {
  deliveredOrders: Array<{
    sellingPrice: number;
    totalAmount: number;
    quantity: number;
    shippingCost: number;
    /** From the commission ledger. Never a per-order legacy column. */
    commission: number;
    estimatedCostOfGoods: number;
  }>;
  operationalExpenses?: number;
}

export interface ProfitBreakdown {
  deliveredRevenue: number;
  costOfGoodsSold: number;
  shippingCosts: number;
  commission: number;
  operationalExpenses: number;
  grossProfit: number;
  netProfit: number;
  profitMargin: number; // percentage
}

/**
 * Calculates real net profit based ONLY on delivered orders (plus operational overhead)
 * Net Profit = Delivered Revenue − Cost of Sold Products − Shipping Cost
 *              − Commission − Other Expenses
 *
 * COMMISSION comes from the commission LEDGER (CommissionEntry), which is
 * the one commission source. It used to be Order.moderatorCommission: a
 * figure written at order creation from a per-user rate, on the selling
 * price, knowing nothing about the commission rules, their dates or their
 * store — so the profit on this screen disagreed with the commission screen
 * and with what anyone would actually be paid.
 */
export function calculateRealProfit(input: RealProfitInput): ProfitBreakdown {
  const deliveredRevenue = input.deliveredOrders.reduce(
    (sum, o) => sum + (o.totalAmount || o.sellingPrice || 0),
    0
  );

  const costOfGoodsSold = input.deliveredOrders.reduce(
    (sum, o) => sum + (o.estimatedCostOfGoods || 0),
    0
  );

  const shippingCosts = input.deliveredOrders.reduce(
    (sum, o) => sum + (o.shippingCost || 0),
    0
  );

  const commission = input.deliveredOrders.reduce((sum, o) => sum + (o.commission || 0), 0);

  const operationalExpenses = input.operationalExpenses || 0;

  const grossProfit = deliveredRevenue - costOfGoodsSold;
  const netProfit =
    deliveredRevenue -
    costOfGoodsSold -
    shippingCosts -
    commission -
    operationalExpenses;

  const profitMargin =
    deliveredRevenue > 0 ? Number(((netProfit / deliveredRevenue) * 100).toFixed(2)) : 0;

  return {
    deliveredRevenue: Number(deliveredRevenue.toFixed(2)),
    costOfGoodsSold: Number(costOfGoodsSold.toFixed(2)),
    shippingCosts: Number(shippingCosts.toFixed(2)),
    commission: Number(commission.toFixed(2)),
    operationalExpenses: Number(operationalExpenses.toFixed(2)),
    grossProfit: Number(grossProfit.toFixed(2)),
    netProfit: Number(netProfit.toFixed(2)),
    profitMargin,
  };
}
