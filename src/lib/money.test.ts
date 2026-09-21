import { describe, expect, it } from 'vitest';
import { allocateDiscount, computeCod, roundMinor } from './money';

/** COD = price - discount + delivery fee, with the currency's minor unit. */

describe('roundMinor', () => {
  it('rounds to the currency minor unit, not a global rule', () => {
    expect(roundMinor(12.3456, 2)).toBe(12.35);
    expect(roundMinor(12.3456, 3)).toBe(12.346); // JOD
    expect(roundMinor(12.5, 0)).toBe(13);
  });

  it('survives binary-representation edges', () => {
    expect(roundMinor(2.675, 2)).toBe(2.68);
    expect(roundMinor(1.005, 2)).toBe(1.01);
  });
});

describe('computeCod', () => {
  const lines = [{ quantity: 2, unitPrice: 10 }];

  it('adds the delivery fee when the price excludes it', () => {
    const r = computeCod({ lines, deliveryFee: 3, minorUnit: 2 });
    expect(r.cod).toBe(23);
    expect(r.revenue).toBe(20);
  });

  it('deducts the fee from revenue when the price includes delivery', () => {
    const r = computeCod({ lines, deliveryFee: 3, priceIncludesDelivery: true, minorUnit: 2 });
    expect(r.cod).toBe(20); // the customer pays the price, nothing more
    expect(r.revenue).toBe(17); // the fee comes out of the business's side
  });

  it('applies the discount before the fee', () => {
    const r = computeCod({ lines, discount: 5, deliveryFee: 3, minorUnit: 2 });
    expect(r.cod).toBe(18);
  });

  it('never lets a discount exceed the subtotal', () => {
    const r = computeCod({ lines, discount: 999, minorUnit: 2 });
    expect(r.discount).toBe(20);
    expect(r.cod).toBe(0);
  });

  it('keeps gift units out of the money maths', () => {
    const withGift = computeCod({ lines: [{ quantity: 2, unitPrice: 10, freeQuantity: 1 }], minorUnit: 2 });
    expect(withGift.cod).toBe(20);
  });

  it('honours a three-decimal currency', () => {
    const r = computeCod({ lines: [{ quantity: 3, unitPrice: 4.3335 }], minorUnit: 3 });
    expect(r.subtotal).toBe(13.001);
    expect(r.cod).toBe(13.001);
  });
});

describe('allocateDiscount', () => {
  const lines = [
    { quantity: 1, unitPrice: 30 },
    { quantity: 1, unitPrice: 10 },
  ];

  it('splits proportionally to line value', () => {
    expect(allocateDiscount(lines, 8, 2)).toEqual([6, 2]);
  });

  it('always sums to the discount, remainder on the largest line', () => {
    const shares = allocateDiscount(lines, 10 / 3, 2);
    expect(shares.reduce((a, b) => a + b, 0)).toBe(roundMinor(10 / 3, 2));
  });

  it('is zero for every line when there is no discount', () => {
    expect(allocateDiscount(lines, 0, 2)).toEqual([0, 0]);
  });

  it('a partial return refunds that line, not an average', () => {
    const r = computeCod({ lines, discount: 8, minorUnit: 2 });
    // Returning the 30 line refunds 30 - 6, never half of the 8.
    expect(r.lineTotals).toEqual([24, 8]);
  });
});
