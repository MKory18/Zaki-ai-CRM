import { describe, expect, it } from 'vitest';
import { countersFromOrders } from '../../scripts/migration/lib/customer-counters.mjs';

/**
 * The counters a customer row carries, read back from their orders exactly as
 * the live doors write them one event at a time. The import wrote orders and
 * never these, so «ordered three times» read as «never ordered».
 */
const at = (d: string) => new Date(`2026-${d}T10:00:00Z`);

describe('a customer\'s counters from their orders', () => {
  it('counts every order, and dates the first and the last', () => {
    const c = countersFromOrders([
      { confirmationStatus: 'CONFIRMED', shippingStatus: 'DELIVERED', totalAmount: 20, createdAt: at('03-01') },
      { confirmationStatus: 'CONFIRMED', shippingStatus: 'DELIVERED', totalAmount: '25.5', createdAt: at('05-10') },
      { confirmationStatus: 'CONFIRMED', shippingStatus: 'SHIPPED', totalAmount: 15, createdAt: at('10-19') },
    ]);
    expect(c).toEqual({
      totalOrders: 3, confirmedOrders: 3, deliveredOrders: 2, cancelledOrders: 0,
      totalPurchaseValue: 45.5, firstOrderDate: at('03-01'), lastOrderDate: at('10-19'),
    });
  });

  it('a return (cancelled after shipping) and a cancellation before shipping are both cancelled, and buy nothing', () => {
    const c = countersFromOrders([
      { confirmationStatus: 'CONFIRMED', shippingStatus: 'RETURNED', totalAmount: 20, createdAt: at('04-01') },
      { confirmationStatus: 'CONFIRMED', shippingStatus: 'CANCELLED', totalAmount: 20, createdAt: at('04-02') },
      { confirmationStatus: 'REJECTED', shippingStatus: 'NOT_READY', totalAmount: 20, createdAt: at('04-03') },
    ]);
    expect(c.cancelledOrders).toBe(3);
    expect(c.deliveredOrders).toBe(0);
    expect(c.totalPurchaseValue).toBe(0);
  });

  it('a partial delivery is a delivery, valued at what was collected', () => {
    const c = countersFromOrders([
      { confirmationStatus: 'CONFIRMED', shippingStatus: 'PARTIALLY_DELIVERED', totalAmount: 54, collectedAmount: 30, createdAt: at('06-01') },
    ]);
    expect(c.deliveredOrders).toBe(1);
    expect(c.totalPurchaseValue).toBe(30);
  });

  it('a postponed order is counted as an order, and as nothing else', () => {
    const c = countersFromOrders([{ confirmationStatus: 'POSTPONED', shippingStatus: 'NOT_READY', totalAmount: 20, createdAt: at('07-01') }]);
    expect(c).toMatchObject({ totalOrders: 1, confirmedOrders: 0, deliveredOrders: 0, cancelledOrders: 0 });
  });

  it('no orders, no dates — never an invented one', () => {
    expect(countersFromOrders([])).toMatchObject({ totalOrders: 0, firstOrderDate: null, lastOrderDate: null });
  });
});
