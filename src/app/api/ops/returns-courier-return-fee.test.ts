import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A CONFIGURED RETURN FEE OF ZERO IS ZERO.
 *
 * `returns/route.ts` charged the courier `fee.returnFee || fee.fee`. The
 * value is a plain `number` by then — `delivery_fees.returnFee` is NOT NULL
 * DEFAULT 0 and `resolveDeliveryFee` returns `roundMinor(Number(...))` — so
 * the only falsy value it can hold is a REAL, configured 0: «we charge
 * nothing to carry goods back». `||` billed those couriers the whole
 * OUTBOUND delivery fee instead.
 *
 * Measured on the live database on 2026-10-02: 13 of 25 active fee rows hold
 * returnFee 0 with fee > 0; none hold NULL.
 *
 * These tests assert the NUMBER and the sum it feeds, not that a name
 * appears. Put `|| fee.fee` back and the first one reads 2.5 against 0 and
 * the arithmetic one reads -1.5 against 1.
 */

const { db, requireContext, requirePermission, logAudit, reverseForOrder } = vi.hoisted(() => ({
  reverseForOrder: vi.fn(async (..._a: unknown[]) => 1),
  db: {
    order: { findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn() },
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

/** JOD: three decimals. The fee table on this courier charges 2.5 outbound. */
const JOD_MINOR = 3;
const DELIVERY_FEE = 2.5;

/**
 * THE MEASURED ORDER, from the collection door's own note (2026-10-02).
 *
 * Three units at 1.000, delivery fee 2.5, the customer kept ONE and refused
 * two. The courier took 1.000 + 2.5 = 3.5 at the door and keeps the 2.5
 * outbound fee, so he owes 1.000 — minus whatever the returns desk charges
 * him to carry the other two back.
 */
const GOODS_KEPT = 1.0;
const TAKEN_AT_THE_DOOR = GOODS_KEPT + DELIVERY_FEE; // 3.5

const post = (b: unknown) =>
  new Request('http://localhost/x', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });

/** What the courier is left owing once this receipt's fee comes off. */
const owedByCourier = (returnFeeCharged: number) => TAKEN_AT_THE_DOOR - DELIVERY_FEE - returnFeeCharged;

beforeEach(() => {
  vi.clearAllMocks();
  requireContext.mockResolvedValue({
    user: { id: 'u1', name: 'Warehouse', role: 'WAREHOUSE', status: 'ACTIVE' },
    companyId: 'c1', storeId: 's1',
    country: { minorUnit: JOD_MINOR, currencyCode: 'JOD' },
  });
  requirePermission.mockResolvedValue({});
  db.order.findFirst.mockResolvedValue({
    id: ORDER_ID, orderNumber: 'ORD-1', shippingStatus: 'PARTIALLY_DELIVERED',
    settlementStatus: 'PENDING_COLLECTION',
    regionId: 'r1', deliveryProviderId: 'dp1', returnReceipt: null,
    items: [{ id: 'i1', productId: 'p1', productName: 'مقشر', quantity: 3, freeQuantity: 0, deliveredQty: 1 }],
  });
  db.returnReceipt.create.mockImplementation(async ({ data }: any) => ({ id: 'rr1', ...data }));
  db.inventoryMovement.findFirst.mockImplementation(async ({ where }: any) =>
    where?.type === 'SALE' ? { id: 'sale-1' } : null
  );
  db.productionBatch.findFirst.mockResolvedValue({ costPerUnit: 1 });
  db.productionBatch.create.mockResolvedValue({ id: 'b-ret' });
  db.productionBatch.aggregate.mockResolvedValue({ _sum: { quantityRemaining: 2 } });
  db.orderItem.updateMany.mockResolvedValue({ count: 1 });
  db.order.update.mockResolvedValue({});
  db.orderNote.create.mockResolvedValue({});
});

/** Two units are coming back; the desk charges the courier for carrying them. */
const receive = () =>
  POST(post({ orderId: ORDER_ID, receivedQty: 2, countedAndInspected: true, chargeCourierFee: true }));

describe('the courier return fee the returns desk charges', () => {
  it('charges 0 — not the 2.5 delivery fee — when the table says 0', async () => {
    db.deliveryFee.findFirst.mockResolvedValue({ fee: '2.5', lateThresholdDays: 3, returnFee: '0' });
    const res = await receive();
    expect(res.status).toBe(201);
    expect((await res.json()).courierFeeAmount).toBe(0);
  });

  it('writes that 0 onto the receipt the settlement rule reads', async () => {
    // `expectedAmountFor` in lib/settlement.ts reads
    // `ReturnReceipt.courierFeeAmount`, so the stored figure is the one that
    // moves money — not the response body.
    db.deliveryFee.findFirst.mockResolvedValue({ fee: '2.5', lateThresholdDays: 3, returnFee: '0' });
    await receive();
    expect(db.returnReceipt.create.mock.calls[0][0].data.courierFeeAmount).toBe(0);
  });

  it('leaves the courier owing 1.000 on the measured order, not us owing him 1.5', async () => {
    // 3 units at 1.000, fee 2.5, one kept: 3.5 taken at the door, 2.5 kept
    // as the outbound fee. With a return fee of 0 he owes 1.000. With the
    // old `|| fee.fee` the desk charged 2.5 and the sum ran backwards to
    // -1.5, which the collection door refuses outright as OWED_TO_COURIER.
    db.deliveryFee.findFirst.mockResolvedValue({ fee: '2.5', lateThresholdDays: 3, returnFee: '0' });
    const charged = (await (await receive()).json()).courierFeeAmount as number;
    expect(owedByCourier(charged)).toBe(1.0);
    expect(owedByCourier(charged)).toBeGreaterThan(0);
  });

  it('says 0 in the note the clerk and the courier read', async () => {
    db.deliveryFee.findFirst.mockResolvedValue({ fee: '2.5', lateThresholdDays: 3, returnFee: '0' });
    await receive();
    expect(db.orderNote.create.mock.calls[0][0].data.body).toContain('أجرة إرجاع 0');
  });

  it('still charges a return fee that IS configured', async () => {
    db.deliveryFee.findFirst.mockResolvedValue({ fee: '2.5', lateThresholdDays: 3, returnFee: '1.5' });
    expect((await (await receive()).json()).courierFeeAmount).toBe(1.5);
  });

  it('charges nothing when the courier has no fee row for the region at all', async () => {
    // `resolveDeliveryFee` answers `source: 'NONE'` with both figures 0, so
    // this case charged 0 before the fix too. Pinned so the next change to
    // the unset policy has to be made on purpose.
    db.deliveryFee.findFirst.mockResolvedValue(null);
    expect((await (await receive()).json()).courierFeeAmount).toBe(0);
  });

  it('charges nothing at all unless the desk asked for it', async () => {
    db.deliveryFee.findFirst.mockResolvedValue({ fee: '2.5', lateThresholdDays: 3, returnFee: '1.5' });
    const res = await POST(post({ orderId: ORDER_ID, receivedQty: 2, countedAndInspected: true }));
    expect((await res.json()).courierFeeAmount).toBe(0);
    expect(db.deliveryFee.findFirst).not.toHaveBeenCalled();
  });
});
