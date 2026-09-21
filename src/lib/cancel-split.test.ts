import { describe, expect, it } from 'vitest';
import { cancelledBeforeShipping } from './order-state';

/**
 * Two cancellations that share a word and share nothing else.
 *
 * Before the parcel left, the order costs nothing and the units go back on
 * the shelf. After, a parcel is out there, a courier will be paid, and the
 * stock only returns through the returns door. A screen that shows both as
 * "ملغى" hides the only part anybody needs.
 */

const order = (over: Record<string, unknown> = {}) =>
  ({
    confirmationStatus: 'CANCELLED',
    shippingStatus: 'NOT_READY',
    shippedAt: null,
    signatureStatus: 'UNSIGNED',
    ...over,
  }) as never;

describe('telling the two cancellations apart', () => {
  it('calls it before-shipping while the goods are still on the shelf', () => {
    expect(cancelledBeforeShipping(order())).toBe(true);
  });

  it('does not, once the parcel has shipped', () => {
    expect(cancelledBeforeShipping(order({ shippingStatus: 'SHIPPED' }))).toBe(false);
  });

  it('does not, once it has ever shipped even if the status moved back', () => {
    // shippedAt is the fact; a status that moved on afterwards does not
    // un-ship a parcel that left the building.
    expect(cancelledBeforeShipping(order({ shippedAt: new Date(), shippingStatus: 'CANCELLED' }))).toBe(false);
  });

  it('says nothing about an order that was never cancelled', () => {
    expect(cancelledBeforeShipping(order({ confirmationStatus: 'CONFIRMED' }))).toBe(false);
  });
});
