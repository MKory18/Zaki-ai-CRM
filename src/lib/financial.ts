/**
 * SALESFLOW Financial Calculation Engine
 * Strict, audit-proof calculation of Production Cost, Unit Cost, and Real Net Profit
 */

export interface BatchCostInput {
  quantityProduced: number;
  manufacturingCost: number;
  packagingCost: number;
  rawMaterialCost: number;
  otherCosts: number;
}

export function calculateBatchCosts(input: BatchCostInput): {
  totalProductionCost: number;
  costPerUnit: number;
} {
  const totalProductionCost =
    (input.manufacturingCost || 0) +
    (input.packagingCost || 0) +
    (input.rawMaterialCost || 0) +
    (input.otherCosts || 0);

  const costPerUnit =
    input.quantityProduced > 0
      ? Number((totalProductionCost / input.quantityProduced).toFixed(4))
      : 0;

  return {
    totalProductionCost: Number(totalProductionCost.toFixed(2)),
    costPerUnit,
  };
}

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
