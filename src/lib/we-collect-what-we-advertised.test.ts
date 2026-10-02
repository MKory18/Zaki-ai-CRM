import { describe, expect, it } from 'vitest';
import { computeCod, roundMinor } from './money';
import { repoFile, stripComments } from './guard-source';

/**
 * «العرض ع ٣ بـ١٠ بنحصّل ع ١٠. إذا قطعة بنحسب ثمن قطعة عدد صحيح.»
 *
 * The owner's rule, and it settles a conflict I had reported as unresolvable:
 * a total that does not divide evenly cannot be `quantity × unitPrice` at any
 * number of decimals, so somebody must absorb the remainder. The answer is
 * that nobody does — because the unit price must not be rounded at all.
 *
 * The division carries its own precision and the PRODUCT is what gets
 * rounded. 10 ÷ 3 is 3.3333333333333335; multiplied by three it is
 * 10.000000000000002; rounded to the currency it is exactly 10. Round the
 * unit price first and you get 3.333 and a total of 9.999 — a fils lost to
 * arithmetic nobody asked for.
 *
 * I had this wrong twice in one day: the Telegram door rounded to two
 * decimals, I "fixed" it to round by the currency, and both are wrong in the
 * same way. The offers door never rounded, which is why it was always right.
 */

const JOD = 3; // minorUnit in this database

describe('what was advertised is what is collected', () => {
  it('three for ten collects ten, not 9.999', () => {
    const money = computeCod({
      lines: [{ quantity: 3, unitPrice: 10 / 3 }],
      deliveryFee: 0,
      minorUnit: JOD,
    });
    expect(money.cod).toBe(10);
  });

  it('and rounding the unit price first is what loses the fils', () => {
    // The shape of the bug, kept so the reason is visible rather than
    // remembered: both of these were shipped at some point today.
    const roundedByCurrency = computeCod({
      lines: [{ quantity: 3, unitPrice: roundMinor(10 / 3, JOD) }],
      deliveryFee: 0,
      minorUnit: JOD,
    });
    expect(roundedByCurrency.cod).toBe(9.999);

    const roundedToTwo = computeCod({
      lines: [{ quantity: 3, unitPrice: Number((10 / 3).toFixed(2)) }],
      deliveryFee: 0,
      minorUnit: JOD,
    });
    expect(roundedToTwo.cod).toBe(9.99);
  });

  it('a single piece is its own whole price', () => {
    // «إذا قطعة بنحسب ثمن قطعة عدد صحيح».
    const money = computeCod({ lines: [{ quantity: 1, unitPrice: 14 / 1 }], deliveryFee: 0, minorUnit: JOD });
    expect(money.cod).toBe(14);
  });

  it('and it holds for the awkward divisions, not just the famous one', () => {
    for (const [total, qty] of [[10, 3], [100, 7], [25, 6], [1, 3], [37.5, 4], [14, 3]] as const) {
      const money = computeCod({
        lines: [{ quantity: qty, unitPrice: total / qty }],
        deliveryFee: 0,
        minorUnit: JOD,
      });
      expect(money.cod, `${total} ÷ ${qty}`).toBe(total);
    }
  });

  it('the delivery fee still lands on top of it, unrounded away', () => {
    const money = computeCod({
      lines: [{ quantity: 3, unitPrice: 10 / 3 }],
      deliveryFee: 2.5,
      minorUnit: JOD,
    });
    expect(money.cod).toBe(12.5);
  });
});

describe('every door divides the same way', () => {
  it('the offers door never rounds a derived unit price', () => {
    const src = stripComments(repoFile('src/lib/public-order.ts'));
    // `offer.price` is the total for the offer's own quantity, and this is
    // the division that makes it a unit price.
    expect(src).toContain('offer.price / offer.quantity');
    expect(src).not.toMatch(/roundMinor\(\s*offer\.price/);
    expect(src).not.toMatch(/offer\.price \/ offer\.quantity\)\.toFixed/);
  });

  it('and the Telegram door does not either', () => {
    const src = stripComments(repoFile('src/lib/telegram/order-creation.ts'));
    expect(src).toContain('const price = totalAmount / quantity;');
    expect(src).not.toMatch(/const price = roundMinor/);
    expect(src).not.toMatch(/const price = Number\(\(totalAmount/);
  });

  it('while the money that is WRITTEN is still rounded by the currency', () => {
    // Not rounding the unit price is not «stop rounding». The cost of goods,
    // the add-on's total and every stored figure still go through
    // `roundMinor` — it is the derived intermediate that must keep its
    // precision until the multiplication is done.
    const src = stripComments(repoFile('src/lib/telegram/order-creation.ts'));
    expect(src).toMatch(/estimatedCostOfGoods = roundMinor\(/);
    expect(src).toContain('parseAdvertisedPrice(priceText, store.country.minorUnit)');
  });
});
