import { describe, expect, it } from 'vitest';
import { computeCod } from './money';

/**
 * Whether the advertised price already contains delivery is a property of
 * the SHOP, not of an offer.
 *
 * It used to be read from the offer alone, so a direct order — a moderator
 * typing one in, the commonest kind — was always priced as price + fee.
 * On a store that advertises delivery-inclusive prices that asks the
 * customer at the door for money the seller never advertised, and the
 * courier statement then disagrees with the order by exactly the fee: the
 * matching screen shows a difference that is nobody's mistake.
 *
 * These lock the arithmetic on both sides of that rule.
 */

const line = (unitPrice: number, quantity = 1) => ({ quantity, unitPrice });

describe('a price that already contains delivery', () => {
  it('asks the customer for the advertised price and nothing more', () => {
    const cod = computeCod({
      lines: [line(15)],
      deliveryFee: 4,
      priceIncludesDelivery: true,
      minorUnit: 2,
    });

    // This is the real statement line for SY-2026-0145: the courier
    // collected 15, not 19.
    expect(cod.cod).toBe(15);
    // The fee is real — it comes out of what the seller keeps.
    expect(cod.deliveryFee).toBe(4);
    expect(cod.revenue).toBe(11);
  });

  it('adds the fee when the price does not contain it', () => {
    const cod = computeCod({
      lines: [line(12)],
      deliveryFee: 2.5,
      priceIncludesDelivery: false,
      minorUnit: 2,
    });

    // The Jordanian store's own data: 12 + 2.5 = 14.5 at the door.
    expect(cod.cod).toBe(14.5);
    expect(cod.revenue).toBe(12);
  });

  it('keeps the two apart by exactly the fee, never by anything else', () => {
    const inclusive = computeCod({ lines: [line(20, 2)], deliveryFee: 3, priceIncludesDelivery: true, minorUnit: 2 });
    const exclusive = computeCod({ lines: [line(20, 2)], deliveryFee: 3, priceIncludesDelivery: false, minorUnit: 2 });

    expect(exclusive.cod - inclusive.cod).toBe(3);
    expect(inclusive.subtotal).toBe(exclusive.subtotal);
  });

  it('takes the discount off the goods before the fee is considered', () => {
    const cod = computeCod({
      lines: [line(30)],
      discount: 5,
      deliveryFee: 4,
      priceIncludesDelivery: true,
      minorUnit: 2,
    });

    expect(cod.discount).toBe(5);
    expect(cod.cod).toBe(25);
    expect(cod.revenue).toBe(21);
  });

  it('is unmoved by a store with no fee set at all', () => {
    // SY-2026-0146 carries no delivery fee yet; the customer still owes the
    // advertised price, not a guess.
    const cod = computeCod({ lines: [line(25)], deliveryFee: 0, priceIncludesDelivery: true, minorUnit: 2 });
    expect(cod.cod).toBe(25);
    expect(cod.revenue).toBe(25);
  });

  it('never asks for a negative amount when the fee exceeds the price', () => {
    // A mis-set fee must not invert the order; revenue may go negative
    // (a real loss), but what the customer is asked for cannot.
    const cod = computeCod({ lines: [line(2)], deliveryFee: 5, priceIncludesDelivery: true, minorUnit: 2 });
    expect(cod.cod).toBe(2);
    expect(cod.cod).toBeGreaterThanOrEqual(0);
  });
});
