import { describe, expect, it } from 'vitest';
import {
  MAX_CART_LINES,
  MAX_LINE_QUANTITY,
  addToCart,
  cartCount,
  cartKey,
  cartToOrderItems,
  parseCart,
  removeFromCart,
  setCartQuantity,
} from './cart';
import { repoFile, stripComments } from './guard-source';

/**
 * THE CART HOLDS IDENTITIES AND COUNTS.
 *
 * Everything else about it is a rule with a reason: no prices, because a
 * price in a browser is a price a browser can edit; no personal data,
 * because a storefront promises none on the device; and no throwing,
 * because this value comes out of `localStorage`, which is shared with
 * everything on the origin and survives a deploy that changed its shape.
 */

const line = (productId: string, offerId: string | null, quantity: number) => ({
  productId,
  offerId,
  quantity,
});

describe('reading whatever was in storage', () => {
  it('reads a cart that is a cart', () => {
    expect(parseCart([line('p1', 'o1', 2)])).toEqual([line('p1', 'o1', 2)]);
  });

  it('reads it from the string it was stored as', () => {
    expect(parseCart(JSON.stringify([line('p1', null, 1)]))).toEqual([line('p1', null, 1)]);
  });

  it.each([
    ['not JSON at all', '{{{'],
    ['an object where a list belongs', '{"p1":2}'],
    ['nothing', null],
    ['a number', 7],
  ])('answers an empty cart for %s, and does not throw', (_why, raw) => {
    expect(parseCart(raw)).toEqual([]);
  });

  it('drops a row with no product, and keeps the rest', () => {
    expect(parseCart([{ offerId: 'o1', quantity: 2 }, line('p2', null, 1)])).toEqual([
      line('p2', null, 1),
    ]);
  });

  it('drops a row nobody wants any of', () => {
    expect(parseCart([line('p1', null, 0), line('p1', null, -3)])).toEqual([]);
  });

  /**
   * The same thing chosen twice is two of it. Left apart, a customer sees
   * «قطعة ×1» twice under one heading and is charged for both.
   */
  it('adds up two rows for the same product and the same bundle', () => {
    expect(parseCart([line('p1', 'o1', 2), line('p1', 'o1', 3)])).toEqual([line('p1', 'o1', 5)]);
  });

  /** The negative control: a different bundle of the same product is a different line. */
  it('keeps two bundles of one product apart', () => {
    expect(parseCart([line('p1', 'o1', 1), line('p1', 'o2', 1)])).toHaveLength(2);
    expect(parseCart([line('p1', 'o1', 1), line('p1', null, 1)])).toHaveLength(2);
  });

  it('will not hold more lines than a person can be asked to pack', () => {
    const many = Array.from({ length: MAX_CART_LINES + 5 }, (_, i) => line(`p${i}`, null, 1));
    expect(parseCart(many)).toHaveLength(MAX_CART_LINES);
  });

  it('caps a quantity somebody typed into storage by hand', () => {
    expect(parseCart([line('p1', null, 10_000)])[0].quantity).toBe(MAX_LINE_QUANTITY);
  });
});

describe('changing what is in it', () => {
  const cart = [line('p1', 'o1', 1)];

  it('adds one by default', () => {
    expect(addToCart(cart, { productId: 'p2', offerId: null })).toEqual([
      line('p1', 'o1', 1),
      line('p2', null, 1),
    ]);
  });

  it('adds to the line that is already there', () => {
    expect(addToCart(cart, { productId: 'p1', offerId: 'o1', quantity: 2 })).toEqual([
      line('p1', 'o1', 3),
    ]);
  });

  it('sets a count', () => {
    expect(setCartQuantity(cart, { productId: 'p1', offerId: 'o1' }, 4)).toEqual([line('p1', 'o1', 4)]);
  });

  it('takes it out at zero — there is no «٠ × قطعة» to draw', () => {
    expect(setCartQuantity(cart, { productId: 'p1', offerId: 'o1' }, 0)).toEqual([]);
  });

  it('removes only the line asked for', () => {
    const two = [line('p1', 'o1', 1), line('p1', 'o2', 1)];
    expect(removeFromCart(two, { productId: 'p1', offerId: 'o1' })).toEqual([line('p1', 'o2', 1)]);
  });

  it('leaves the cart it was given alone', () => {
    const before = [line('p1', 'o1', 1)];
    addToCart(before, { productId: 'p2', offerId: null });
    setCartQuantity(before, { productId: 'p1', offerId: 'o1' }, 9);
    expect(before).toEqual([line('p1', 'o1', 1)]);
  });

  /**
   * PIECES, not lines. «٣» beside a basket holding one bundle of three is
   * what the customer is about to receive; «١» reads as «two were lost».
   */
  it('counts pieces on the basket', () => {
    expect(cartCount([line('p1', 'o1', 3), line('p2', null, 2)])).toBe(5);
    expect(cartCount([])).toBe(0);
  });

  it('gives each shop its own cart', () => {
    expect(cartKey('sehha')).not.toBe(cartKey('other'));
  });

  it('hands the order path identities and counts', () => {
    expect(cartToOrderItems([line('p1', 'o1', 2), line('p2', null, 1)])).toEqual([
      { productId: 'p1', offerId: 'o1', quantity: 2 },
      { productId: 'p2', quantity: 1 },
    ]);
  });
});

describe('and it carries no money and nobody’s name', () => {
  const src = () => stripComments(repoFile('src/lib/cart.ts'));

  /**
   * A price here would be a price the browser decides, and every figure a
   * customer is charged comes from `computeCod` on the server. A name or a
   * phone here would be personal data on a device that was promised none.
   */
  it.each(['price', 'total', 'cod', 'currency', 'phone', 'address', 'fullName', 'name'])(
    'the cart module never mentions %s',
    (word) => {
      expect(src().toLowerCase()).not.toMatch(new RegExp(`\\b${word.toLowerCase()}\\b`));
    }
  );

  /** The anchor: it does mention the things it is for. */
  it('and does mention what it holds', () => {
    expect(src()).toMatch(/\bproductId\b/);
    expect(src()).toMatch(/\bquantity\b/);
  });
});
