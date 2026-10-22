// A customer's counters, read back from their orders the way the live doors
// write them one event at a time (held by src/lib/customer-counters.test.ts):
//
//   totalOrders        +1 for every order created          (POST /api/orders)
//   confirmedOrders    +1 when an order is confirmed        (orders/[id] → CONFIRMED)
//   deliveredOrders    +1 when something was taken at the door — a whole
//                      delivery or a partial one            (orders/[id], partial-delivery)
//   totalPurchaseValue + the order total on a delivery, the collected
//                      amount on a partial                  (same two doors)
//   cancelledOrders    +1 for a rejected or cancelled order, and for a door
//                      that took nothing back (a refusal)   (orders/[id], partial-delivery)
//   first/lastOrderDate  the earliest and latest order
//
// The import wrote orders but never these, so a customer who ordered three
// times read as a customer who never ordered. Recomputing them from the
// orders themselves is idempotent: running it twice gives the same numbers.

const CANCELLED = ['REJECTED', 'CANCELLED'];

/**
 * @param {Array<{ confirmationStatus: string, shippingStatus: string,
 *   totalAmount: number|string, collectedAmount?: number|string|null, createdAt: Date }>} orders
 */
export function countersFromOrders(orders) {
  let confirmedOrders = 0, deliveredOrders = 0, cancelledOrders = 0, totalPurchaseValue = 0;
  let first = null, last = null;
  for (const o of orders) {
    if (o.confirmationStatus === 'CONFIRMED') confirmedOrders++;
    if (o.shippingStatus === 'DELIVERED') {
      deliveredOrders++;
      totalPurchaseValue += Number(o.totalAmount) || 0;
    } else if (o.shippingStatus === 'PARTIALLY_DELIVERED') {
      deliveredOrders++;
      totalPurchaseValue += Number(o.collectedAmount ?? o.totalAmount) || 0;
    } else if (o.shippingStatus === 'RETURNED' || o.shippingStatus === 'CANCELLED' || CANCELLED.includes(o.confirmationStatus)) {
      cancelledOrders++;
    }
    const at = new Date(o.createdAt);
    if (!first || at < first) first = at;
    if (!last || at > last) last = at;
  }
  return {
    totalOrders: orders.length,
    confirmedOrders,
    deliveredOrders,
    cancelledOrders,
    totalPurchaseValue: Math.round(totalPurchaseValue * 1000) / 1000,
    firstOrderDate: first,
    lastOrderDate: last,
  };
}
