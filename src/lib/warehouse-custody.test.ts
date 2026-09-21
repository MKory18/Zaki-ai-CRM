import { describe, expect, it } from 'vitest';
import { assertCancellable, assertVoidable, hasLeftWarehouse, type StateSource } from './order-state';
import { isValidShippingTransition } from './shipping-workflow';

/**
 * When do an order's goods come back to the shelf?
 *
 * Before the parcel leaves, cancelling frees them: nothing physical moved.
 * After it leaves, they come back only through the returns door, counted.
 *
 * The line between those used to sit at SHIPPED — but a parcel is packed,
 * labelled and handed to the courier a stage earlier. In that window an
 * order could be cancelled, its reservation dropped, and its units counted
 * as available again while they were sitting in a van. These hold the line
 * where the goods actually stop being ours to take back.
 */

const order = (over: Partial<StateSource> = {}): StateSource => ({
  confirmationStatus: 'CONFIRMED',
  shippingStatus: 'NOT_READY',
  ...over,
});

describe('while the parcel is still ours', () => {
  it('may be cancelled at every stage before it is committed', () => {
    for (const shippingStatus of ['NOT_READY', 'READY_FOR_SHIPPING', 'PACKING']) {
      expect(assertCancellable(order({ shippingStatus })).allowed, shippingStatus).toBe(true);
    }
  });

  it('may be voided too, while nothing has physically moved', () => {
    expect(assertVoidable(order({ shippingStatus: 'PACKING' })).allowed).toBe(true);
  });
});

describe('once it is committed to a courier', () => {
  it('a printed waybill closes cancellation, before the status says SHIPPED', () => {
    // The exact case that leaked: labelled and handed over, still "PACKING".
    const committed = order({ shippingStatus: 'PACKING', labelPrintedAt: new Date() });
    expect(hasLeftWarehouse(committed)).toBe(true);
    expect(assertCancellable(committed).allowed).toBe(false);
    expect(assertVoidable(committed).allowed).toBe(false);
  });

  it('waiting for pickup counts as gone, waybill or not', () => {
    expect(assertCancellable(order({ shippingStatus: 'READY_FOR_PICKUP' })).allowed).toBe(false);
  });

  it('stays closed at every stage after it left', () => {
    for (const shippingStatus of ['SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'FAILED_DELIVERY', 'RETURNED']) {
      expect(assertCancellable(order({ shippingStatus })).allowed, shippingStatus).toBe(false);
    }
  });

  it('says where the goods come back from, instead of only refusing', () => {
    const msg = assertCancellable(order({ shippingStatus: 'READY_FOR_PICKUP' })).message ?? '';
    expect(msg).toContain('المرتجع');
  });

  it('treats a shipped timestamp as final even if the status was rolled back', () => {
    expect(hasLeftWarehouse(order({ shippingStatus: 'PACKING', shippedAt: new Date() }))).toBe(true);
  });
});

describe('the way back', () => {
  it('a labelled parcel that never moved can be returned without faking a journey', () => {
    // Otherwise the only route was to mark it SHIPPED and then failed —
    // recording a delivery attempt that never happened, and dating the
    // stock movement to it.
    expect(isValidShippingTransition('READY_FOR_PICKUP', 'RETURN_REQUESTED')).toBe(true);
  });

  it('still cannot jump straight to delivered from the shelf', () => {
    expect(isValidShippingTransition('READY_FOR_PICKUP', 'DELIVERED')).toBe(false);
  });

  it('ends at RETURNED, where the count puts the goods back', () => {
    expect(isValidShippingTransition('RETURN_REQUESTED', 'RETURNED')).toBe(true);
  });
});
