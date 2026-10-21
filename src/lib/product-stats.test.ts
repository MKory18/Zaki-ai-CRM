import { describe, expect, it } from 'vitest';
import { summariseProducts, type StatsProduct } from './product-stats';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * THE FIGURES ABOVE THE PRODUCTS LIST — WHAT EACH ONE COUNTS.
 *
 * The owner, 21/10: «بطاقات ذكية في المنتجات زي احصائيات» and «المبيعات في جدول المنتجات فش ارقام؟». The summary is a pure
 * function of what the door read, so every claim here is about what is counted and what is left out — a card a reader cannot
 * check is a number nobody can trust, and a stock value shown to somebody who may not see what goods cost is a leak.
 * ═══════════════════════════════════════════════════════════════════════
 */

const P = (id: string, over: Partial<StatsProduct> = {}): StatsProduct => ({ id, status: 'ACTIVE', categoryId: 'cat-1', ...over });
const m = (...pairs: Array<[string, number]>) => new Map(pairs);
const none = new Map<string, number>();

describe('the counts', () => {
  const products = [
    P('a'),
    P('b', { status: 'INACTIVE' }),
    P('c', { status: 'INACTIVE', categoryId: null }),
    P('d', { status: 'OUT_OF_STOCK' }),
  ];

  it('— every product in the scope is counted once, whatever its state', () => {
    expect(summariseProducts({ products, onHand: none, stockValue: null, unitsSold: none }).totals.products).toBe(4);
  });

  it('and «نشط» is the status ACTIVE and nothing else', () => {
    expect(summariseProducts({ products, onHand: none, stockValue: null, unitsSold: none }).totals.active).toBe(1);
  });

  it('and «بلا تصنيف» is a product with no category — one of four here, so counting the filed ones instead gives another number', () => {
    expect(summariseProducts({ products, onHand: none, stockValue: null, unitsSold: none }).totals.unfiled).toBe(1);
  });

  it('and an empty catalogue is all zeros and no top product', () => {
    const s = summariseProducts({ products: [], onHand: none, stockValue: null, unitsSold: none });
    expect(s.totals).toEqual({ products: 0, active: 0, unfiled: 0, outOfStock: 0, unitsOnHand: 0, unitsSold: 0 });
    expect(s.unitsSold).toEqual({});
    expect(s.top).toBeNull();
  });
});

describe('the stock', () => {
  const products = [P('a'), P('b'), P('c'), P('d')];

  it('— units on hand are summed, and a product with none (or absent from the answer) is out of stock', () => {
    const s = summariseProducts({ products, onHand: m(['a', 10], ['b', 5], ['c', 0]), stockValue: null, unitsSold: none });
    expect(s.totals.unitsOnHand).toBe(15);
    expect(s.totals.outOfStock).toBe(2); // c holds 0 and d is not in the answer at all
  });

  it('and a negative balance is out of stock and is not SUBTRACTED from what is on the shelf', () => {
    const s = summariseProducts({ products, onHand: m(['a', 10], ['b', -3]), stockValue: null, unitsSold: none });
    expect(s.totals.unitsOnHand).toBe(10);
    expect(s.totals.outOfStock).toBe(3);
  });

  it('and units held by a product outside the scope are not counted', () => {
    const s = summariseProducts({ products: [P('a')], onHand: m(['a', 4], ['elsewhere', 99]), stockValue: null, unitsSold: none });
    expect(s.totals.unitsOnHand).toBe(4);
  });
});

describe('the value of the stock', () => {
  const products = [P('a'), P('b'), P('c')];

  it('— is ABSENT, not zero, for a caller who may not see what goods cost', () => {
    const s = summariseProducts({ products, onHand: m(['a', 10]), stockValue: null, unitsSold: none });
    expect('stockValue' in s.totals).toBe(false);
  });

  it('and is the sum of what each product’s stock is worth — one owner for the figure, summed and not recomputed', () => {
    const s = summariseProducts({ products, onHand: m(['a', 10], ['b', 5]), stockValue: m(['a', 35], ['b', 12.5]), unitsSold: none });
    expect(s.totals.stockValue).toBe(47.5);
  });

  it('and a product the answer does not value contributes nothing — and floating-point dust does not reach the card', () => {
    const s = summariseProducts({ products, onHand: none, stockValue: m(['a', 0.1], ['b', 0.2]), unitsSold: none });
    expect(s.totals.stockValue).toBe(0.3);
  });

  it('and a value held for a product outside the scope is not counted', () => {
    const s = summariseProducts({ products: [P('a')], onHand: none, stockValue: m(['a', 10], ['elsewhere', 1000]), unitsSold: none });
    expect(s.totals.stockValue).toBe(10);
  });

  it('and a caller allowed to see cost with an empty shelf sees ZERO — a stated value, where absent means «not yours to see»', () => {
    const s = summariseProducts({ products, onHand: none, stockValue: new Map(), unitsSold: none });
    expect(s.totals.stockValue).toBe(0);
  });
});

describe('the sales', () => {
  const products = [P('a'), P('b'), P('c')];

  it('— units delivered are listed per product, and a product nobody received is absent, not a zero', () => {
    const s = summariseProducts({ products, onHand: none, stockValue: null, unitsSold: m(['a', 131], ['b', 0]) });
    expect(s.unitsSold).toEqual({ a: 131 });
    expect('b' in s.unitsSold).toBe(false);
  });

  it('and the total is the sum over the products in the scope — a product outside it adds nothing', () => {
    const s = summariseProducts({ products, onHand: none, stockValue: null, unitsSold: m(['a', 100], ['c', 31], ['elsewhere', 5000]) });
    expect(s.totals.unitsSold).toBe(131);
    expect(s.unitsSold).toEqual({ a: 100, c: 31 });
  });

  it('and the top product is the one with the most units — and its units', () => {
    const s = summariseProducts({ products, onHand: none, stockValue: null, unitsSold: m(['a', 10], ['b', 40], ['c', 25]) });
    expect(s.top).toEqual({ id: 'b', units: 40 });
  });

  it('and a tie goes to the smaller id — the same data names the same product, whatever order it arrives in', () => {
    const forward = summariseProducts({ products: [P('a'), P('b')], onHand: none, stockValue: null, unitsSold: m(['a', 7], ['b', 7]) });
    const backward = summariseProducts({ products: [P('b'), P('a')], onHand: none, stockValue: null, unitsSold: m(['b', 7], ['a', 7]) });
    expect(forward.top).toEqual({ id: 'a', units: 7 });
    expect(backward.top).toEqual({ id: 'a', units: 7 });
  });

  it('and when nothing was delivered there is no top product', () => {
    expect(summariseProducts({ products, onHand: none, stockValue: null, unitsSold: none }).top).toBeNull();
  });

  it('and the answer does not depend on the order the products arrive in', () => {
    const a = summariseProducts({ products, onHand: m(['a', 1], ['b', 2]), stockValue: m(['a', 3], ['b', 4]), unitsSold: m(['a', 5], ['c', 6]) });
    const b = summariseProducts({ products: [...products].reverse(), onHand: m(['a', 1], ['b', 2]), stockValue: m(['a', 3], ['b', 4]), unitsSold: m(['a', 5], ['c', 6]) });
    expect(b).toEqual(a);
  });
});
