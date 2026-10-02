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
    /**
     * NOT READ. Revenue is `totalAmount`, which is never absent.
     *
     * It was the second half of `totalAmount || sellingPrice`, which counted
     * a delivered order worth 0 at its selling price. The field stays only
     * because the one live caller passes it as an object literal, so
     * removing it from this type turns `analytics.ts` into a compile error —
     * and that file is not this change's to edit. Reported for its own line.
     */
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
  /*
   * `totalAmount` IS THE REVENUE. NOTHING STANDS BEHIND IT.
   *
   * It is a required `number` on this input and `orders.totalAmount` is
   * `double precision NOT NULL` with no default (0 of 56 rows NULL on the
   * live database, 2026-10-03), so it is never absent: `|| 0` could not
   * fire, and `?? 0` would be the same dead branch wearing a different
   * operator — the shape this audit keeps catching.
   *
   * What `|| o.sellingPrice` DID do was swap in a different column whenever
   * a delivered order was genuinely worth 0, counting revenue that nobody
   * collected and that no invoice backs. The one live caller
   * (`analytics.ts`) hardcodes `sellingPrice: 0`, so the branch cannot
   * change an answer today — `0 || 0 || 0` and `0` are both 0, and any
   * non-zero `totalAmount` won under the old expression too. That makes
   * deleting it a provable no-op now and the only moment it is free.
   *
   * Deleted rather than pinned by a test, for the reason the note at the top
   * of this file already gives about the second cost calculator that used to
   * live here: an exported function in a file called «Financial Calculation
   * Engine» that is merely wrong-when-used is a loaded gun, and a guard
   * asserting `totalAmount: 0` yields `sellingPrice` would have written the
   * wrong number into the suite instead of out of the code.
   */
  const deliveredRevenue = input.deliveredOrders.reduce((sum, o) => sum + o.totalAmount, 0);

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
