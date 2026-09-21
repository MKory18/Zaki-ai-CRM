import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./db', () => ({ db: {} }));

import { productCost, productCosts, batchTotal, batchUnitCost } from './product-cost';

/**
 * A product has no single cost — it has one per batch. Every figure calling
 * itself "the product's cost" is choosing how to blend them, and the choice
 * lands straight in the profit.
 *
 * What was here read whichever batch the query returned first. These are the
 * cases where that differs from the truth by real money.
 */

const tx = { productionBatch: { findMany: vi.fn() } } as never;
const batches = (rows: { quantityRemaining: number; costPerUnit: number; productId?: string }[]) =>
  (tx as any).productionBatch.findMany.mockResolvedValue(rows);

beforeEach(() => vi.clearAllMocks());

describe('the cumulative cost of a product', () => {
  it('weights by how many units each batch still holds', () => {
    // 90 units at 3 and 10 at 8 is 3.50, not 5.50. A plain mean of the two
    // batch prices would overstate the cost of goods by 57%.
    batches([
      { quantityRemaining: 90, costPerUnit: 3 },
      { quantityRemaining: 10, costPerUnit: 8 },
    ]);
    return productCost(tx, 'c1', 'p1').then((c) => {
      expect(c.average).toBe(3.5);
      expect(c.onHand).toBe(100);
      expect(c.stockValue).toBe(350);
    });
  });

  it('ignores batches that are empty', async () => {
    // An emptied run says what March cost, not what a unit costs today.
    batches([{ quantityRemaining: 5, costPerUnit: 10 }]);
    const c = await productCost(tx, 'c1', 'p1');
    expect((tx as any).productionBatch.findMany.mock.calls[0][0].where.quantityRemaining).toEqual({ gt: 0 });
    expect(c.average).toBe(10);
  });

  it('names the batch the next sale will actually empty', async () => {
    // Oldest first, matching the draw-down. A closed order's real cost is
    // this number, not the average.
    batches([
      { quantityRemaining: 4, costPerUnit: 2 },
      { quantityRemaining: 40, costPerUnit: 9 },
    ]);
    const c = await productCost(tx, 'c1', 'p1');
    expect(c.nextOut).toBe(2);
    expect(c.average).not.toBe(2);
  });

  it('is zero for a product with no stock, not a crash and not a guess', async () => {
    batches([]);
    expect(await productCost(tx, 'c1', 'p1')).toMatchObject({ average: 0, onHand: 0, batchCount: 0 });
  });

  it('gives every asked-for product an answer, including the ones with none', async () => {
    // A missing key would read as undefined and silently cost an order zero.
    batches([{ productId: 'p1', quantityRemaining: 10, costPerUnit: 5 }]);
    const map = await productCosts(tx, 'c1', ['p1', 'p2']);
    expect(map.get('p1')!.average).toBe(5);
    expect(map.get('p2')).toMatchObject({ average: 0, onHand: 0 });
  });

  it('asks nothing when asked about nothing', async () => {
    const map = await productCosts(tx, 'c1', []);
    expect(map.size).toBe(0);
    expect((tx as any).productionBatch.findMany).not.toHaveBeenCalled();
  });
});

describe("a batch's total", () => {
  it('adds the free-form lines to the four buckets', () => {
    // The buckets are not dropped: live batches carry their costs there, and
    // rewriting them would change the cost of goods on closed orders.
    expect(
      batchTotal({
        manufacturingCost: 100,
        packagingCost: 20,
        costLines: [{ amount: 35 }, { amount: 15 }],
      }).total
    ).toBe(170);
  });

  it('works from lines alone, for a batch that uses no bucket', () => {
    expect(batchTotal({ costLines: [{ amount: 40 }, { amount: 60 }] }).total).toBe(100);
  });

  it('is zero for a batch that cost nothing, not NaN', () => {
    expect(batchTotal({}).total).toBe(0);
  });

  it('keeps four places on the unit cost, because fractions of a cent scale', () => {
    // 100 / 300 is 0.3333; rounding to 0.33 loses a dinar every three
    // thousand units.
    expect(batchUnitCost(100, 300)).toBe(0.3333);
  });

  it('refuses to divide by a batch of nothing', () => {
    expect(batchUnitCost(100, 0)).toBe(0);
  });
});
