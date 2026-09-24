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

describe('computeCod — add-ons', () => {
  const base = { lines: [{ quantity: 1, unitPrice: 20 }], deliveryFee: 3, minorUnit: 2 };

  it('collects them', () => {
    expect(computeCod({ ...base, addOns: [{ quantity: 1, unitPrice: 12 }] }).cod).toBe(35);
  });

  it('counts them as revenue', () => {
    expect(computeCod({ ...base, addOns: [{ quantity: 1, unitPrice: 12 }] }).revenue).toBe(32);
  });

  it('keeps them out of the subtotal — sellingPrice and the discount ceiling are the order’s own lines', () => {
    const m = computeCod({ ...base, addOns: [{ quantity: 1, unitPrice: 12 }] });
    expect(m.subtotal).toBe(20);
    expect(m.addOns).toBe(12);
  });

  it('does not spread the order’s discount over them', () => {
    // The discount was agreed before the add-on existed.
    const m = computeCod({ ...base, discount: 5, addOns: [{ quantity: 1, unitPrice: 12 }] });
    expect(m.discountShares).toEqual([5]);
    expect(m.lineTotals).toEqual([15]);
    expect(m.cod).toBe(20 - 5 + 12 + 3);
  });

  it('rounds to the currency, three decimals for a dinar', () => {
    const m = computeCod({ lines: [{ quantity: 1, unitPrice: 10 }], minorUnit: 3, addOns: [{ quantity: 3, unitPrice: 1.3335 }] });
    expect(m.addOns).toBe(4.001);
    expect(m.cod).toBe(14.001);
  });

  it('ignores a negative quantity or price rather than subtracting it', () => {
    const m = computeCod({ ...base, addOns: [{ quantity: -1, unitPrice: 12 }, { quantity: 1, unitPrice: -5 }] });
    expect(m.addOns).toBe(0);
    expect(m.cod).toBe(23);
  });

  it('is zero when there are none, so every existing caller is unchanged', () => {
    expect(computeCod(base).addOns).toBe(0);
    expect(computeCod(base).cod).toBe(23);
  });
});
