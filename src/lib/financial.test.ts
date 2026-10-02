import { describe, expect, it } from 'vitest';
import { calculateRealProfit } from './financial';

/**
 * DELIVERED REVENUE IS `totalAmount`. NOTHING STANDS BEHIND IT.
 *
 * `calculateRealProfit` summed `o.totalAmount || o.sellingPrice || 0`. The
 * field is a required `number` on its own input type and
 * `orders.totalAmount` is `double precision NOT NULL` with no default — 0 of
 * 56 rows NULL on the live database, 2026-10-03 — so it is never absent.
 * `|| 0` could not fire, and `?? 0` would be the same dead branch wearing a
 * different operator.
 *
 * What the chain COULD do was substitute a different column whenever a
 * delivered order was genuinely worth 0, counting revenue nobody collected.
 * The one live caller (`analytics.ts`) hardcodes `sellingPrice: 0`, so no
 * answer on the dashboard changes either way — which is exactly why the
 * fallback was deleted rather than pinned: an exported function in a file
 * titled «Financial Calculation Engine» that is merely wrong-when-used is
 * the same loaded gun this file's own header describes having removed once
 * before, and a test asserting that 0 becomes 99 would have written the
 * wrong number into the suite instead of out of the code.
 *
 * These tests assert the MONEY. Put `|| o.sellingPrice` back and the first
 * reads 99 against 0 and the margin reads 100 against 0.
 */

/** One delivered order, with every cost at zero so revenue stands alone. */
const delivered = (totalAmount: number, sellingPrice: number) => ({
  deliveredOrders: [
    { sellingPrice, totalAmount, quantity: 1, shippingCost: 0, commission: 0, estimatedCostOfGoods: 0 },
  ],
});

describe('a delivered order worth zero is worth zero', () => {
  /**
   * THE MEASURED SHAPE: a 99 product sold on an offer that took the order to
   * 0 (a full-discount entry error, which `57eb1d6` now refuses at the offer
   * door but which `orders.discountAmount` is still bounded only by
   * `max(100000)`). `sellingPrice` is the product's own figure and is not
   * what anybody owed.
   */
  it('counts 0, not the 99 on `sellingPrice`', () => {
    const r = calculateRealProfit(delivered(0, 99));
    expect(r.deliveredRevenue).toBe(0);
    expect(r.deliveredRevenue).not.toBe(99);
  });

  it('and the profit and margin follow it down', () => {
    const r = calculateRealProfit(delivered(0, 99));
    expect(r.grossProfit).toBe(0);
    expect(r.netProfit).toBe(0);
    // Zero revenue has no margin to report; 100% off a phantom 99 is worse
    // than no number at all.
    expect(r.profitMargin).toBe(0);
  });

  it('does not let the phantom revenue pay for real costs', () => {
    const r = calculateRealProfit({
      deliveredOrders: [
        { sellingPrice: 99, totalAmount: 0, quantity: 1, shippingCost: 2.5, commission: 1, estimatedCostOfGoods: 14 },
      ],
      operationalExpenses: 3,
    });
    expect(r.deliveredRevenue).toBe(0);
    // 0 − 14 − 2.5 − 1 − 3. A loss that reads as a loss, not as +78.5.
    expect(r.netProfit).toBe(-20.5);
    expect(r.netProfit).not.toBe(78.5);
  });

  /**
   * AND A REAL AMOUNT IS STILL THE REAL AMOUNT, so the fix is not «always
   * 0». `totalAmount` won under the old expression too whenever it was
   * non-zero, which is what makes the deletion a provable no-op today.
   */
  it('leaves a non-zero order exactly where it was', () => {
    const r = calculateRealProfit(delivered(42, 99));
    expect(r.deliveredRevenue).toBe(42);
  });

  /**
   * THE LIVE CALL SHAPE, pinned: `analytics.ts` feeds one pre-aggregated row
   * with `sellingPrice: 0`. Before and after the deletion this is the same
   * arithmetic, so the dashboard's number did not move.
   */
  it('reproduces the dashboard call with sellingPrice 0 unchanged', () => {
    const r = calculateRealProfit({
      deliveredOrders: [
        { sellingPrice: 0, totalAmount: 1234.5, quantity: 21, shippingCost: 50, commission: 12, estimatedCostOfGoods: 300 },
      ],
      operationalExpenses: 100,
    });
    expect(r.deliveredRevenue).toBe(1234.5);
    expect(r.netProfit).toBe(772.5);
    expect(r.profitMargin).toBe(62.58);
  });

  it('and an empty delivered list is 0 revenue and 0 margin, not a division', () => {
    const r = calculateRealProfit({ deliveredOrders: [] });
    expect(r.deliveredRevenue).toBe(0);
    expect(r.profitMargin).toBe(0);
    expect(Number.isFinite(r.netProfit)).toBe(true);
  });
});
