import { describe, expect, it } from 'vitest';
import {
  SHIPPING_GONE, assertCancellable, assertVoidable, deriveCoreState, getZone, hasEverShipped,
} from './order-state';
import { STATUS_TIMESTAMP } from './shipping-workflow';
import { orderSeal } from './order-seal';

/**
 * A PARTLY DELIVERED PARCEL IS GONE — the customer is holding it.
 *
 * PARTIALLY_DELIVERED was missing from the "out of our hands" list, so the
 * cancel and void guards let it through. Cancelling put its units back on
 * the shelf while they were in the customer's house, and the two facts that
 * were supposed to catch it both fail here: the courier feed writes a status
 * without ever setting shippedAt, and the door-side recorder writes
 * PARTIALLY_DELIVERED with no shipping transition at all.
 *
 * And a partial delivery had no deliveredAt, so the courier statement sweep
 * — which filters on that column — never saw money that had been collected,
 * and the parcel stayed on the courier's debt list for ever.
 */

const order = (over: Record<string, unknown> = {}) => ({
  confirmationStatus: 'CONFIRMED',
  shippingStatus: 'NOT_READY',
  shippedAt: null,
  labelPrintedAt: null,
  ...over,
}) as never;

/** What the door-side recorder writes: a status, and no timestamps at all. */
const doorPartial = order({ shippingStatus: 'PARTIALLY_DELIVERED' });

describe('cancelling and voiding a partly delivered order', () => {
  it('is refused, with no shippedAt to rely on', () => {
    expect(hasEverShipped(doorPartial)).toBe(true);
    expect(assertCancellable(doorPartial).allowed).toBe(false);
    expect(assertCancellable(doorPartial).code).toBe('CANCEL_AFTER_SHIPPED');
    expect(assertVoidable(doorPartial).allowed).toBe(false);
  });

  it('and it reads as closed, so nothing may still act on it', () => {
    expect(getZone(deriveCoreState(doorPartial))).toBe('CLOSED');
  });

  it('while an order that never left is still cancellable', () => {
    expect(assertCancellable(order()).allowed).toBe(true);
    expect(assertVoidable(order()).allowed).toBe(true);
    expect(hasEverShipped(order())).toBe(false);
  });
});

describe('the one list of shipping states that mean the parcel is gone', () => {
  it('holds every state a parcel can be in once it has left', () => {
    expect([...SHIPPING_GONE]).toEqual([
      'SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'PARTIALLY_DELIVERED',
      'FAILED_DELIVERY', 'RETURN_REQUESTED', 'RETURNED',
    ]);
  });

  it('is the same list the order seal uses — one idea, one list', () => {
    // The seal kept its own copy. It was the correct one; the guards' copy
    // was not, and a reader had no way to tell which to trust.
    for (const status of SHIPPING_GONE) {
      expect(orderSeal({ shippingStatus: status }).sealed, status).toBe(true);
    }
    expect(orderSeal({ shippingStatus: 'NOT_READY' }).sealed).toBe(false);
  });
});

describe('the timestamp a partial delivery sets', () => {
  it('is deliveredAt — a partial delivery is a delivery, and the money arrived', () => {
    expect(STATUS_TIMESTAMP.PARTIALLY_DELIVERED).toBe('deliveredAt');
    expect(STATUS_TIMESTAMP.DELIVERED).toBe('deliveredAt');
  });
});
