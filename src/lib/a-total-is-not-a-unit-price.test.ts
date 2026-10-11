import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stripComments } from './guard-source';
import { computeFinancials, orderGoodsCost } from './finance-workflow';

/**
 * A TOTAL IS NOT A UNIT PRICE — AND IT WAS MULTIPLIED BY QUANTITY TWICE.
 *
 * `computeFinancials` is the ONLY writer of `Order.subtotal`,
 * `totalRevenue`, `grossProfit` and `netProfit` — the four columns the
 * profit screens read. It did this:
 *
 *     subtotal    = sellingPrice × quantity
 *     productCost = productCost  × quantity
 *
 * And both of those values were ALREADY whole-order totals.
 *
 * ── MEASURED, NOT ASSUMED ──
 *
 * On the live rows, a three-unit order:
 *
 *     ORD-2026-0030   quantity 3
 *       sellingPrice           36      SUM(quantity × unitPrice) = 36  ✓
 *       estimatedCostOfGoods   15
 *
 * `Order.sellingPrice` IS the subtotal: it equals the sum of its own lines
 * on every multi-unit row in the database, and `winback-lines.test.ts`
 * states it in writing. And every writer of `estimatedCostOfGoods`
 * multiplies by quantity itself — `unitCost * qty` in three order doors and
 * `average * l.quantity` in the fourth — so that is the order's total too.
 *
 * So for that order the function produced:
 *
 *     subtotal     36 × 3 = 108      should be 36
 *     productCost  15 × 3 =  45      should be 15
 *     grossProfit  108 − 45 = 63     should be 21
 *
 * Three times the revenue, three times the cost, three times the profit.
 *
 * ── AND IT HAD NEVER RUN ──
 *
 * MEASURED: `subtotal`, `totalRevenue`, `grossProfit`, `netProfit` and
 * `productCost` are NULL on all 56 orders, because the one route that calls
 * this has no screen. Nothing stored was wrong, which is why this is the
 * good moment: the figures are fixed before the first use rather than
 * reconciled after it.
 *
 * ── THE SECOND HALF OF THE SAME CONFUSION ──
 *
 * `analytics/loss` priced damaged goods from `productCost ?? 0` — null on
 * all 56 rows — so a damaged return reported a goods loss of ZERO, every
 * time. And it multiplied by quantity as well.
 */

const root = process.cwd();
const read = (f: string) => readFileSync(join(root, f), 'utf8');
const n = (d: unknown) => Number(String(d));

/** The live order the measurement above came from. */
const ORDER = { quantity: 3, subtotal: 36, goodsCost: 15 };

describe('Ⅰ · the snapshot does not multiply a total', () => {
  it('a three-unit order’s subtotal is its subtotal', () => {
    const fin = computeFinancials({ subtotal: ORDER.subtotal, goodsCost: ORDER.goodsCost });
    expect(n(fin.subtotal), 'المجموعُ ضُرِبَ بالكمية').toBe(36);
  });

  it('and its goods cost is its goods cost', () => {
    const fin = computeFinancials({ subtotal: ORDER.subtotal, goodsCost: ORDER.goodsCost });
    expect(n(fin.totalCost), 'الكلفةُ ضُرِبَتْ بالكمية').toBe(15);
  });

  it('and the gross profit is 21, not 63', () => {
    // The number that would have been printed on a screen.
    const fin = computeFinancials({ subtotal: ORDER.subtotal, goodsCost: ORDER.goodsCost });
    expect(n(fin.grossProfit)).toBe(21);
  });

  it('and it IGNORES a quantity even when one is handed to it', () => {
    /*
     * THE TEST THAT WOULD HAVE CAUGHT THE ORIGINAL DEFECT, and my first
     * version of this file did not have it.
     *
     * Two mutations put `mul(D(input.quantity ?? 1))` back on each line and
     * every test stayed green — because none of my tests PASSED a quantity,
     * so `?? 1` made the multiplier one and the mutation a no-op. A guard
     * that never supplies the dangerous input cannot see the danger.
     *
     * So the quantity is handed in deliberately, as an extra property the
     * signature no longer declares, and the answer must be unchanged. This
     * is the shape the old caller used: `{ sellingPrice, quantity, ... }`.
     */
    const withQuantity = computeFinancials({
      subtotal: ORDER.subtotal,
      goodsCost: ORDER.goodsCost,
      ...({ quantity: ORDER.quantity } as Record<string, unknown>),
    });
    expect(n(withQuantity.subtotal), 'الكميةُ المُمرَّرةُ ضُرِبَتْ بالمجموع').toBe(36);
    expect(n(withQuantity.totalCost), 'الكميةُ المُمرَّرةُ ضُرِبَتْ بالكلفة').toBe(15);
    expect(n(withQuantity.grossProfit)).toBe(21);

    // And the same for the goods-cost helper.
    const goods = orderGoodsCost({
      estimatedCostOfGoods: 15,
      ...({ quantity: 3 } as Record<string, unknown>),
    });
    expect(n(goods), 'المساعِدةُ ضَرَبَتْ بالكميةِ المُمرَّرة').toBe(15);
  });

  it('and there is no quantity to pass any more', () => {
    /*
     * The parameter is GONE, not ignored. A function that still accepted
     * `quantity` would be a function somebody passes it to, and the next
     * reader would reasonably assume it is used.
     */
    const src = stripComments(read('src/lib/finance-workflow.ts'));
    expect(src, 'الدالةُ ما زالت تَقبَلُ الكمية').not.toMatch(/quantity\?: any/);
    expect(src, 'ما زال فيها ضربٌ بالكمية').not.toMatch(/mul\(D\([^)]*\), D\(input\.quantity/);
  });

  it('and the parameters carry their scale in their names', () => {
    /*
     * `sellingPrice` and `productCost` read as per-unit — which is what
     * invited the multiplication. `subtotal` and `goodsCost` cannot be
     * misread, and that is the actual fix: the old names made the mistake
     * writeable.
     */
    const src = stripComments(read('src/lib/finance-workflow.ts'));
    expect(src).toMatch(/subtotal: any;/);
    expect(src).toMatch(/goodsCost\?: any;/);
    expect(src, 'الاسمُ القديمُ ما زال في التوقيع').not.toMatch(/sellingPrice: any;/);
  });

  it('and the rest of the arithmetic still holds', () => {
    const fin = computeFinancials({
      subtotal: 100,
      discount: 10,
      shippingRevenue: 5,
      goodsCost: 40,
      packagingCost: 2,
      shippingCost: 3,
      advertisingCost: 4,
      otherCost: 1,
      commission: 6,
    });
    expect(n(fin.subtotal)).toBe(100);
    expect(n(fin.totalRevenue)).toBe(95); // 100 − 10 + 5
    expect(n(fin.totalCost)).toBe(56); // 40 + 2 + 3 + 4 + 1 + 6
    expect(n(fin.grossProfit)).toBe(55); // 95 − 40
    expect(n(fin.netProfit)).toBe(39); // 95 − 56
  });
});

describe('Ⅱ · one answer to what the goods cost', () => {
  it('the typed figure when somebody typed one', () => {
    expect(n(orderGoodsCost({ productCost: 12, estimatedCostOfGoods: 15 }))).toBe(12);
  });

  it('and the estimate when nobody has', () => {
    // Null on all 56 live rows, which is why the estimate is the answer
    // that actually arrives.
    expect(n(orderGoodsCost({ productCost: null, estimatedCostOfGoods: 15 }))).toBe(15);
    expect(n(orderGoodsCost({ estimatedCostOfGoods: 15 }))).toBe(15);
  });

  it('and a typed ZERO is a real cost, not a missing one', () => {
    /*
     * `??` and not `||`. A free sample costs nothing, and falling through a
     * typed 0 to the estimate would charge for a gift — the `|| 0` family
     * this repository has already closed twelve times.
     */
    expect(n(orderGoodsCost({ productCost: 0, estimatedCostOfGoods: 15 })), 'صفرٌ مكتوبٌ سقطَ إلى التقدير').toBe(0);
  });

  it('and zero when neither is there', () => {
    expect(n(orderGoodsCost({}))).toBe(0);
    expect(n(orderGoodsCost({ productCost: null, estimatedCostOfGoods: null }))).toBe(0);
  });

  it('and it never multiplies — both columns are whole-order totals', () => {
    const src = stripComments(read('src/lib/finance-workflow.ts'));
    const fn = /export function orderGoodsCost[\s\S]*?\n\}/.exec(src)![0];
    expect(fn, 'الدالةُ تَضرِبُ في شيء').not.toMatch(/\bmul\b|\*/);
    expect(fn, 'الدالةُ تَقرأُ الكمية').not.toMatch(/quantity/);
  });
});

describe('Ⅲ · the one caller passes totals', () => {
  const src = stripComments(read('src/app/api/orders/[id]/finance/route.ts'));

  it('passes the subtotal and no quantity', () => {
    expect(src).toMatch(/subtotal: order\.sellingPrice,/);
    expect(src, 'ما زال يُمرِّرُ الكمية').not.toMatch(/quantity: order\.quantity,/);
  });

  it('and asks the one function for the goods cost', () => {
    expect(src).toMatch(/goodsCost: orderGoodsCost\(\{/);
    /*
     * The old chain — `updateData.productCost ?? order.productCost ??
     * order.estimatedCostOfGoods` — fell between a column the function
     * multiplied and a column that was already a total. A `??` chain whose
     * links have different scales is a figure that changes meaning
     * depending on which link answered.
     */
    expect(src, 'سلسلةُ الاحتياطِ القديمةُ ما زالت').not.toMatch(
      /productCost: updateData\.productCost \?\? order\.productCost \?\? order\.estimatedCostOfGoods/
    );
  });

  it('and it is still the only caller', () => {
    // A second caller is where the old scale would come back.
    const all = stripComments(read('src/lib/finance-workflow.ts'));
    expect(all).toMatch(/export function computeFinancials/);
    expect(src).toMatch(/computeFinancials\(\{/);
  });
});

describe('Ⅳ · the loss report prices damaged goods from a column that is filled in', () => {
  const src = stripComments(read('src/app/api/analytics/loss/route.ts'));

  it('uses the one answer', () => {
    expect(src).toMatch(/orderGoodsCost\(\{ productCost: o\.productCost, estimatedCostOfGoods: o\.estimatedCostOfGoods \}\)/);
  });

  it('and selects the column it needs', () => {
    /*
     * The half that makes it work: the reader selected `productCost` and
     * not `estimatedCostOfGoods`, so even the right expression would have
     * read `undefined` — and a damaged return would still have cost zero.
     */
    expect(src, 'العمودُ الممتلئُ غيرُ مُنتقى').toMatch(/estimatedCostOfGoods: true/);
  });

  it('and no longer multiplies by quantity', () => {
    expect(src, 'ما زال يَضرِبُ بالكمية').not.toMatch(/productCost \?\? 0\) \* \(o\.quantity/);
  });

  it('and the old zero-pricing shape is gone', () => {
    // `Number(o.productCost ?? 0)` on a column that is null on every row.
    expect(src).not.toMatch(/Number\(o\.productCost \?\? 0\)/);
  });
});
