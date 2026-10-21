import { describe, expect, it } from 'vitest';
import { giftUnits } from './offer-gift';
import { repoFile, stripComments } from './guard-source';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * THE GIFT IS ONE PER BUNDLE — AND THE TWO DOORS THAT WRITE ORDERS AGREE ON IT.
 *
 * The owner, 22/10: «الهدية مش وهمي… لازم ينحسب سعرو على التكلفة وينخصم من الستوك… هي من نفس صنف المنتج قطعة زيادة».
 * The landing page wrote «3 + 1» as 3 + 1; the manual door read the gift as «per piece» and wrote it 3 + 3, because the order
 * dialog sets a picked offer's line to the offer's own quantity. This is the one rule, and it is checked against the
 * storefront's own formula over every shape of offer rather than against the one shape somebody thought of.
 * ═══════════════════════════════════════════════════════════════════════
 */

describe('one gift per bundle', () => {
  const threePlusOne = { quantity: 3, freeQuantity: 1 };

  it('— a line of one bundle carries one gift, two bundles two, and so on', () => {
    expect(giftUnits(threePlusOne, 3)).toBe(1);
    expect(giftUnits(threePlusOne, 6)).toBe(2);
    expect(giftUnits(threePlusOne, 9)).toBe(3);
  });

  it('and a bundle that gives two gives two per bundle', () => {
    expect(giftUnits({ quantity: 2, freeQuantity: 2 }, 2)).toBe(2);
    expect(giftUnits({ quantity: 2, freeQuantity: 2 }, 4)).toBe(4);
  });

  it('and «1 + 1» is a gift per piece only because its bundle IS one piece', () => {
    expect(giftUnits({ quantity: 1, freeQuantity: 1 }, 1)).toBe(1);
    expect(giftUnits({ quantity: 1, freeQuantity: 1 }, 5)).toBe(5);
  });

  it('and a line that is not a whole number of bundles earns the whole bundles in it — the seventh unit is an ordinary one', () => {
    expect(giftUnits(threePlusOne, 7)).toBe(2);
    expect(giftUnits(threePlusOne, 8)).toBe(2);
  });

  it('and a line shorter than one bundle earns none — the customer did not buy the offer', () => {
    expect(giftUnits(threePlusOne, 2)).toBe(0);
    expect(giftUnits(threePlusOne, 1)).toBe(0);
    expect(giftUnits(threePlusOne, 0)).toBe(0);
  });
});

describe('and no gift where there is none', () => {
  it('— no offer, an offer with no gift, a zero or negative gift', () => {
    expect(giftUnits(null, 3)).toBe(0);
    expect(giftUnits(undefined, 3)).toBe(0);
    expect(giftUnits({ quantity: 3, freeQuantity: 0 }, 3)).toBe(0);
    expect(giftUnits({ quantity: 3, freeQuantity: -1 }, 3)).toBe(0);
  });

  it('and nonsense for a gift is no gift — never NaN', () => {
    expect(giftUnits({ quantity: 3, freeQuantity: NaN }, 3)).toBe(0);
  });

  it('and nonsense for a line quantity is no gift, never NaN, never negative, never infinite', () => {
    for (const q of [-5, NaN, Infinity, -Infinity]) {
      expect(giftUnits({ quantity: 3, freeQuantity: 1 }, q), String(q)).toBe(0);
    }
    expect(giftUnits({ quantity: 3, freeQuantity: 1 }, 3.9)).toBe(1);
  });

  it('and an offer whose bundle size is nonsense is read as a bundle of one: never a division by zero, never NaN', () => {
    for (const quantity of [0, -2, NaN]) {
      expect(giftUnits({ quantity, freeQuantity: 1 }, 4), String(quantity)).toBe(4);
    }
  });
});

describe('the two doors agree', () => {
  it('— over every shape of offer and every number of bundles, the manual door’s reading equals the storefront’s: `freeQuantity × bundles` on a line of `quantity × bundles` units', () => {
    for (let quantity = 1; quantity <= 6; quantity++) {
      for (let freeQuantity = 0; freeQuantity <= 3; freeQuantity++) {
        for (let bundles = 1; bundles <= 5; bundles++) {
          const storefront = freeQuantity * bundles;
          expect(giftUnits({ quantity, freeQuantity }, quantity * bundles), `${quantity}+${freeQuantity} ×${bundles}`).toBe(storefront);
        }
      }
    }
  });

  it('and the storefront still writes the gift that way — so the equality above is about the real thing', () => {
    const storefront = stripComments(repoFile('src/lib/public-order.ts'));
    expect(storefront).toMatch(/freeQuantity: \(offer \? offer\.freeQuantity : 0\) \* want\.count/);
    expect(storefront).toMatch(/quantity: unitsPerPick \* want\.count/);
  });

  it('and the manual door asks the one rule — and no longer multiplies a gift by the piece count', () => {
    const manual = stripComments(repoFile('src/app/api/orders/route.ts'));
    expect(manual).toContain("from '@/lib/offer-gift'");
    expect(manual).toMatch(/giftUnits\(/);
    expect(manual).not.toMatch(/freeFor|freeQuantity[^;]*\*\s*line\.quantity|freeFor\(l\)\s*\*/);
  });
});
