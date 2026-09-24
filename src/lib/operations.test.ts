import { beforeEach, describe, expect, it, vi } from 'vitest';

/** Preparation grouping, shipment blocks, fee resolution and transit days. */

const { db } = vi.hoisted(() => ({
  db: {
    orderItem: { findMany: vi.fn(), aggregate: vi.fn() },
    productionBatch: { aggregate: vi.fn() },
    order: { count: vi.fn() },
    deliveryFee: { findFirst: vi.fn() },
  },
}));
vi.mock('./db', () => ({ db }));

import { preparationGroups, shipmentBlocks, redactCustomerForWarehouse } from './operations';
import { resolveDeliveryFee, codForOrder } from './delivery-fees';
import { transitStatus } from './transit';

const scope = { companyId: 'c1', storeId: 's1' };

function stock(onHand: number, reservedElsewhere: number) {
  db.productionBatch.aggregate.mockResolvedValue({ _sum: { quantityRemaining: onHand } });
  db.orderItem.aggregate.mockResolvedValue({ _sum: { reservedQty: reservedElsewhere } });
}

const item = (over: Record<string, unknown> = {}) => ({
  productId: 'p1', productName: 'مقشر', quantity: 2, freeQuantity: 0, reservedQty: 0,
  order: {
    id: 'o1', orderNumber: 'ORD-1', confirmationStatus: 'CONFIRMED', shippingStatus: 'NOT_READY',
    customer: { fullName: 'أحمد' }, region: { name: 'عمّان' },
  },
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  db.order.count.mockResolvedValue(0);
  db.deliveryFee.findFirst.mockResolvedValue({ id: 'f1' });
});

describe('preparation is grouped by product', () => {
  it('sums required units per product, gift units included', async () => {
    db.orderItem.findMany.mockResolvedValue([
      item({ quantity: 2, freeQuantity: 1 }),
      item({ order: { ...item().order, id: 'o2', orderNumber: 'ORD-2' }, quantity: 3 }),
    ]);
    stock(10, 0);

    const [group] = await preparationGroups(db as never, scope);
    expect(group.orders).toBe(2);
    expect(group.required).toBe(6);
    expect(group.shortage).toBe(0);
    expect(group.lines).toHaveLength(2);
  });

  it('reports the shortage when the shelf cannot cover the orders', async () => {
    db.orderItem.findMany.mockResolvedValue([item({ quantity: 8 })]);
    stock(3, 0);
    const [group] = await preparationGroups(db as never, scope);
    expect(group.available).toBe(3);
    expect(group.shortage).toBe(5);
  });

  it('counts this order’s own reservation as available to it', async () => {
    db.orderItem.findMany.mockResolvedValue([item({ quantity: 5, reservedQty: 5 })]);
    // Five units on the shelf, all five reserved — by this very order.
    // Reserving does not consume the batch, so on-hand still shows them.
    stock(5, 5);
    const [group] = await preparationGroups(db as never, scope);
    expect(group.shortage).toBe(0);
  });
});

describe('shipment blocks', () => {
  const order = { id: 'o1', companyId: 'c1', storeId: 's1', customerId: 'cust1', regionId: 'r1', deliveryProviderId: 'dp1' };

  it('is clean when nothing is wrong', async () => {
    db.orderItem.findMany.mockResolvedValue([{ productId: 'p1', productName: 'x', quantity: 1, freeQuantity: 0, reservedQty: 1 }]);
    expect(await shipmentBlocks(db as never, order, { allowNegativeStock: false })).toEqual([]);
  });

  it('flags a duplicate inside the same batch (soft)', async () => {
    db.orderItem.findMany.mockResolvedValue([]);
    const blocks = await shipmentBlocks(db as never, order, { allowNegativeStock: false, batchOrderIds: ['o1', 'o1'] });
    expect(blocks[0]).toMatchObject({ code: 'DUPLICATE_IN_BATCH', hard: false });
  });

  it('flags a previous shipment in transit and a recent return (soft)', async () => {
    db.order.count.mockResolvedValue(1);
    db.orderItem.findMany.mockResolvedValue([]);
    const codes = (await shipmentBlocks(db as never, order, { allowNegativeStock: false })).map((b) => b.code);
    expect(codes).toContain('PREVIOUS_SHIPMENT_IN_TRANSIT');
    expect(codes).toContain('RECENT_RETURN');
  });

  it('hard-blocks a stock shortage when negative stock is disallowed', async () => {
    db.orderItem.findMany.mockResolvedValue([{ productId: 'p1', productName: 'مقشر', quantity: 4, freeQuantity: 0, reservedQty: 0 }]);
    stock(1, 0);
    const [block] = await shipmentBlocks(db as never, order, { allowNegativeStock: false });
    expect(block).toMatchObject({ code: 'STOCK_SHORTAGE', hard: true });
  });

  it('downgrades the same shortage to a warning when negative stock is allowed', async () => {
    db.orderItem.findMany.mockResolvedValue([{ productId: 'p1', productName: 'مقشر', quantity: 4, freeQuantity: 0, reservedQty: 0 }]);
    stock(1, 0);
    const [block] = await shipmentBlocks(db as never, order, { allowNegativeStock: true });
    expect(block).toMatchObject({ code: 'STOCK_SHORTAGE', hard: false });
  });

  it('hard-blocks an order with no region or no fee row', async () => {
    db.orderItem.findMany.mockResolvedValue([]);
    const noRegion = await shipmentBlocks(db as never, { ...order, regionId: null }, { allowNegativeStock: true });
    expect(noRegion[0]).toMatchObject({ code: 'NO_REGION', hard: true });

    db.deliveryFee.findFirst.mockResolvedValue(null);
    const noFee = await shipmentBlocks(db as never, order, { allowNegativeStock: true });
    expect(noFee[0]).toMatchObject({ code: 'NO_FEE_ROW', hard: true });
  });
});

describe('delivery fees', () => {
  it('returns the table fee and the late threshold', async () => {
    db.deliveryFee.findFirst.mockResolvedValue({ fee: '2.5', lateThresholdDays: 4, returnFee: '1.25' });
    const fee = await resolveDeliveryFee(db as never, { deliveryProviderId: 'dp1', regionId: 'r1', minorUnit: 2 });
    expect(fee).toEqual({ fee: 2.5, lateThresholdDays: 4, returnFee: 1.25, source: 'TABLE' });
  });

  it('says NONE instead of guessing a fee', async () => {
    db.deliveryFee.findFirst.mockResolvedValue(null);
    const fee = await resolveDeliveryFee(db as never, { deliveryProviderId: 'dp1', regionId: 'r1', minorUnit: 2 });
    expect(fee.source).toBe('NONE');
    expect(fee.fee).toBe(0);
  });

  it('adds the fee to COD, or deducts it from revenue when the price includes it', () => {
    const lines = [{ quantity: 2, unitPrice: 10, discountShare: 0 }];
    expect(codForOrder({ lines, deliveryFee: 3, priceIncludesDelivery: false, minorUnit: 2 }).cod).toBe(23);
    const included = codForOrder({ lines, deliveryFee: 3, priceIncludesDelivery: true, minorUnit: 2 });
    expect(included.cod).toBe(20);
    expect(included.revenue).toBe(17);
  });
});

describe('transit days', () => {
  it('marks a shipment late only past the region threshold', () => {
    const shipped = new Date('2026-09-10T08:00:00Z');
    const now = new Date('2026-09-14T08:00:00Z');
    expect(transitStatus(shipped, 3, now)).toEqual({ days: 4, late: true });
    expect(transitStatus(shipped, 5, now)).toEqual({ days: 4, late: false });
    expect(transitStatus(null, 3, now)).toEqual({ days: null, late: false });
  });
});

describe('warehouse payloads', () => {
  it('carry no phone and no address', () => {
    const customer = { fullName: 'أحمد', phone: '0790000000', rawPhone: '0790000000', address: 'عمّان' };
    expect(redactCustomerForWarehouse(customer, false)).toEqual({ fullName: 'أحمد', phone: undefined, rawPhone: undefined, address: undefined });
    expect(redactCustomerForWarehouse(customer, true)).toEqual(customer);
  });
});

describe('a change request waiting on an order being packed', () => {
  it('travels with the line, so the packer sees it before taping the box', async () => {
    // Packing to an address somebody is asking to change is work done twice.
    db.orderItem.findMany.mockResolvedValue([
      item({ order: { ...item().order, changeRequests: [{ id: 'cr-1' }] } }),
    ]);
    stock(10, 0);
    const [group] = await preparationGroups(db as never, scope);
    expect(group.lines[0].pendingChangeRequestId).toBe('cr-1');
  });

  it('is null when there is none', async () => {
    db.orderItem.findMany.mockResolvedValue([item({ order: { ...item().order, changeRequests: [] } })]);
    stock(10, 0);
    const [group] = await preparationGroups(db as never, scope);
    expect(group.lines[0].pendingChangeRequestId).toBeNull();
  });

  it('does not crash a packing screen when the relation is missing', async () => {
    // An older caller, or a select that forgot it, must not take the
    // warehouse's screen down.
    db.orderItem.findMany.mockResolvedValue([item()]);
    stock(10, 0);
    const [group] = await preparationGroups(db as never, scope);
    expect(group.lines[0].pendingChangeRequestId).toBeNull();
  });
});
