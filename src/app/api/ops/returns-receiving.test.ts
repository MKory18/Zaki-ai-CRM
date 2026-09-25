import { beforeEach, describe, expect, it, vi } from 'vitest';

/** Nothing enters stock before the count-and-inspect acknowledgement. */

const { db, requireContext, requirePermission, logAudit, reverseForOrder } = vi.hoisted(() => ({
  reverseForOrder: vi.fn(async (..._a: unknown[]) => 1),
  db: {
    order: { findFirst: vi.fn(), update: vi.fn() },
    returnReceipt: { create: vi.fn() },
    inventoryMovement: { findFirst: vi.fn(), create: vi.fn() },
    productionBatch: { findFirst: vi.fn(), create: vi.fn(), aggregate: vi.fn() },
    orderItem: { updateMany: vi.fn() },
    orderNote: { create: vi.fn() },
    deliveryFee: { findFirst: vi.fn() },
    $transaction: vi.fn(async (fn: any) => fn(db)),
  },
  requireContext: vi.fn(),
  requirePermission: vi.fn(),
  logAudit: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ db }));
vi.mock('@/lib/geo-context', () => ({ requireContext: (...a: unknown[]) => requireContext(...a) }));
vi.mock('@/lib/authorization', () => ({ can: () => true, requirePermission: (...a: unknown[]) => requirePermission(...a) }));
vi.mock('@/lib/audit', () => ({ logAudit: (...a: unknown[]) => logAudit(...a) }));
vi.mock('@/lib/commission', () => ({ reverseForOrder }));

import { POST } from '@/app/api/ops/returns/route';

const ORDER_ID = '77777777-7777-4777-8777-777777777777';
const body = (b: unknown) =>
  new Request('http://localhost/x', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });

beforeEach(() => {
  vi.clearAllMocks();
  requireContext.mockResolvedValue({
    user: { id: 'u1', name: 'Warehouse', role: 'WAREHOUSE', status: 'ACTIVE' },
    companyId: 'c1', storeId: 's1',
    country: { minorUnit: 3, currencyCode: 'JOD' },
  });
  requirePermission.mockResolvedValue({});
  db.order.findFirst.mockResolvedValue({
    id: ORDER_ID, orderNumber: 'ORD-1', shippingStatus: 'RETURN_REQUESTED',
    regionId: 'r1', deliveryProviderId: 'dp1', returnReceipt: null,
    items: [{ id: 'i1', productId: 'p1', productName: 'مقشر', quantity: 3, freeQuantity: 0 }],
  });
  db.returnReceipt.create.mockImplementation(async ({ data }: any) => ({ id: 'rr1', ...data }));
  // No RETURN movement for this order yet — receiving one twice must not
  // restore the goods twice.
  // The ledger answers TWO different questions here, and one stub cannot
  // tell them apart: "was this already returned?" (RETURN) and "did it ever
  // leave the shelf?" (SALE). The default order in these tests is one that
  // WAS delivered and has not come back yet.
  db.inventoryMovement.findFirst.mockImplementation(async ({ where }: any) =>
    where?.type === 'SALE' ? { id: 'sale-1' } : null
  );
  db.productionBatch.findFirst.mockResolvedValue({ costPerUnit: 4 });
  db.productionBatch.create.mockResolvedValue({ id: 'b-ret' });
  db.productionBatch.aggregate.mockResolvedValue({ _sum: { quantityRemaining: 12 } });
  db.orderItem.updateMany.mockResolvedValue({ count: 1 });
  db.order.update.mockResolvedValue({});
  db.orderNote.create.mockResolvedValue({});
  db.deliveryFee.findFirst.mockResolvedValue({ fee: '2', lateThresholdDays: 3, returnFee: '1.5' });
});

describe('return receiving', () => {
  it('refuses without the count-and-inspect acknowledgement, and writes no stock', async () => {
    const res = await POST(body({ orderId: ORDER_ID, receivedQty: 3 }));
    expect(res.status).toBe(400);
    expect(db.inventoryMovement.create).not.toHaveBeenCalled();
    expect(db.returnReceipt.create).not.toHaveBeenCalled();
  });

  it('computes the missing units instead of trusting a typed number', async () => {
    const res = await POST(body({ orderId: ORDER_ID, receivedQty: 1, damagedQty: 1, countedAndInspected: true }));
    expect(res.status).toBe(201);
    expect((await res.json()).missingQty).toBe(1);
    expect(db.returnReceipt.create.mock.calls[0][0].data).toMatchObject({ expectedQty: 3, missingQty: 1 });
  });

  it('restores only the sound units, after the acknowledgement', async () => {
    await POST(body({ orderId: ORDER_ID, receivedQty: 2, damagedQty: 1, countedAndInspected: true }));
    expect(db.inventoryMovement.create).toHaveBeenCalledTimes(1);
    expect(db.inventoryMovement.create.mock.calls[0][0].data).toMatchObject({ type: 'RETURN', quantity: 2, balanceAfter: 12 });
  });

  it('puts the sound units into a real batch, not only into the ledger', async () => {
    // A ledger line on its own moves nothing: stock lives in batches, and
    // without one the shipment screen keeps reporting a shortage for goods
    // the ledger says are back on the shelf.
    await POST(body({ orderId: ORDER_ID, receivedQty: 2, damagedQty: 1, countedAndInspected: true }));
    expect(db.productionBatch.create).toHaveBeenCalledTimes(1);
    expect(db.productionBatch.create.mock.calls[0][0].data).toMatchObject({
      quantityRemaining: 2,
      quantitySold: 0,
      costPerUnit: 4,
    });
  });

  it('takes the courier return fee from the table, never from the receiver', async () => {
    const res = await POST(body({ orderId: ORDER_ID, receivedQty: 3, countedAndInspected: true, chargeCourierFee: true, courierFeeAmount: 999 }));
    expect((await res.json()).courierFeeAmount).toBe(1.5);
  });

  it('refuses more units than were shipped', async () => {
    const res = await POST(body({ orderId: ORDER_ID, receivedQty: 5, countedAndInspected: true }));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('OVER_RECEIVED');
  });

  it('refuses a second receipt for the same order', async () => {
    db.order.findFirst.mockResolvedValue({
      id: ORDER_ID, orderNumber: 'ORD-1', returnReceipt: { id: 'rr0' }, items: [], regionId: 'r1', deliveryProviderId: 'dp1',
    });
    const res = await POST(body({ orderId: ORDER_ID, receivedQty: 1, countedAndInspected: true }));
    expect(res.status).toBe(409);
  });

  it('takes the commission back off, in the LEDGER', async () => {
    // The order was delivered, so the ledger accrued on it. Zeroing the
    // legacy `moderatorCommission` column — which is what this used to do —
    // left the ledger holding the full amount, so the month still paid
    // commission on goods that are back on the shelf.
    await POST(body({ orderId: ORDER_ID, receivedQty: 3, countedAndInspected: true }));
    expect(db.order.update.mock.calls[0][0].data).toMatchObject({ shippingStatus: 'RETURNED' });
    expect(reverseForOrder).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ orderId: ORDER_ID })
    );
  });

  it('reverses inside the same transaction as the receipt, so neither can land alone', async () => {
    await POST(body({ orderId: ORDER_ID, receivedQty: 3, countedAndInspected: true }));
    // `db` is what $transaction hands the callback in this mock; being
    // called with it is what says the reversal is inside.
    expect(reverseForOrder.mock.calls[0][0]).toBe(db);
  });

  it('does not write the retired per-order commission column at all', async () => {
    await POST(body({ orderId: ORDER_ID, receivedQty: 3, countedAndInspected: true }));
    expect(db.order.update.mock.calls[0][0].data).not.toHaveProperty('moderatorCommission');
  });
});

/**
 * NOTHING COMES BACK THAT NEVER LEFT.
 *
 * Stock is consumed at DELIVERY, not at dispatch. So a parcel refused at the
 * door never took its units out of any batch — and "restoring" them then
 * does not put stock back, it INVENTS it: a fresh batch of units the shelf
 * already holds. The figure climbs by a whole parcel every time one comes
 * back undelivered, which on a refusal-heavy week is most of them.
 */
describe('a return of goods that never left', () => {
  beforeEach(() => {
    // No SALE on this order: it was refused at the door, so nothing was ever
    // consumed for it.
    db.inventoryMovement.findFirst.mockResolvedValue(null);
  });

  it('creates no batch and no ledger line', async () => {
    await POST(body({ orderId: ORDER_ID, receivedQty: 3, countedAndInspected: true }));
    expect(db.productionBatch.create).not.toHaveBeenCalled();
    expect(db.inventoryMovement.create).not.toHaveBeenCalled();
  });

  it('still records the receipt — the count happened and is the record of it', async () => {
    // Refusing to restore stock is not refusing the return. The parcel was
    // counted and inspected; that fact is kept whatever the ledger says.
    const res = await POST(body({ orderId: ORDER_ID, receivedQty: 3, countedAndInspected: true }));
    expect(res.status).toBe(201);
    expect(db.returnReceipt.create).toHaveBeenCalledTimes(1);
  });

  it('asks the ledger, not the order’s status', async () => {
    // A status can be rewritten by a later path; the movement rows cannot.
    await POST(body({ orderId: ORDER_ID, receivedQty: 3, countedAndInspected: true }));
    const asked = db.inventoryMovement.findFirst.mock.calls.map((c: any) => c[0].where.type);
    expect(asked).toContain('SALE');
  });
});

/**
 * A PARTIAL DELIVERY'S REFUSED UNITS ARE A RETURN TOO.
 *
 * They left the warehouse with the parcel and the customer handed them back
 * to the courier. Until the desk could list the order, nobody counted them
 * in — and now that the door consumes the whole parcel, every refused unit
 * would be missing from stock permanently.
 */
describe('receiving what a partial delivery sent back', () => {
  const partial = (items: unknown[]) => {
    db.order.findFirst.mockResolvedValue({
      id: ORDER_ID, orderNumber: 'ORD-1', shippingStatus: 'PARTIALLY_DELIVERED',
      returnReceipt: null, regionId: 'r1', deliveryProviderId: 'dp1', items,
    });
  };

  it('expects only what the customer refused, not the whole parcel', async () => {
    // Three shipped, the customer kept two. One is coming back — and asking
    // for three would record two "missing" units the customer is holding and
    // has paid for, then put that shortfall on the courier's record.
    partial([{ id: 'i1', productId: 'p1', productName: 'X', quantity: 3, freeQuantity: 0, deliveredQty: 2 }]);
    const res = await POST(body({ orderId: ORDER_ID, receivedQty: 1, countedAndInspected: true }));
    expect(res.status).toBe(201);
    expect(db.returnReceipt.create.mock.calls[0][0].data).toMatchObject({ expectedQty: 1, missingQty: 0 });
  });

  it('refuses more units than were refused at the door', async () => {
    partial([{ id: 'i1', productId: 'p1', productName: 'X', quantity: 3, freeQuantity: 0, deliveredQty: 2 }]);
    const res = await POST(body({ orderId: ORDER_ID, receivedQty: 3, countedAndInspected: true }));
    expect((await res.json()).code).toBe('OVER_RECEIVED');
  });

  it('does NOT rewrite the order into a return', async () => {
    // It was partly delivered and the customer paid for what they kept.
    // Stamping RETURNED erases the delivery; NOT_APPLICABLE drops money the
    // courier is still holding out of everything that chases it.
    partial([{ id: 'i1', productId: 'p1', productName: 'X', quantity: 3, freeQuantity: 0, deliveredQty: 2 }]);
    await POST(body({ orderId: ORDER_ID, receivedQty: 1, countedAndInspected: true }));
    const data = db.order.update.mock.calls[0][0].data;
    expect(data.shippingStatus).toBeUndefined();
    expect(data.status).toBeUndefined();
    expect(data.settlementStatus).toBeUndefined();
  });

  it('still puts the refused units back on the shelf', async () => {
    partial([{ id: 'i1', productId: 'p1', productName: 'X', quantity: 3, freeQuantity: 0, deliveredQty: 2 }]);
    await POST(body({ orderId: ORDER_ID, receivedQty: 1, countedAndInspected: true }));
    // The door consumed the whole parcel, so a SALE exists and the restore
    // guard lets these through.
    expect(db.productionBatch.create).toHaveBeenCalledTimes(1);
  });

  it('a full return still becomes RETURNED, as it always did', async () => {
    await POST(body({ orderId: ORDER_ID, receivedQty: 3, countedAndInspected: true }));
    expect(db.order.update.mock.calls[0][0].data).toMatchObject({
      shippingStatus: 'RETURNED', status: 'RETURNED', settlementStatus: 'NOT_APPLICABLE',
    });
  });
});
