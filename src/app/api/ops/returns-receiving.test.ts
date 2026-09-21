import { beforeEach, describe, expect, it, vi } from 'vitest';

/** Nothing enters stock before the count-and-inspect acknowledgement. */

const { db, requireContext, requirePermission, logAudit } = vi.hoisted(() => ({
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
  db.inventoryMovement.findFirst.mockResolvedValue(null);
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

  it('leaves a returned order with zero commission', async () => {
    await POST(body({ orderId: ORDER_ID, receivedQty: 3, countedAndInspected: true }));
    expect(db.order.update.mock.calls[0][0].data).toMatchObject({ shippingStatus: 'RETURNED', moderatorCommission: 0 });
  });
});
