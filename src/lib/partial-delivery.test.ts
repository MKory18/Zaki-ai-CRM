import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Partial delivery — the customer took some lines and refused others.
 *
 * The test that matters most is the fee one. The courier travelled to that
 * door whether one line was taken or all of them, so prorating the fee would
 * quietly make every partial cheaper than it was and leave the difference
 * unexplained in the settlement.
 */

const { db } = vi.hoisted(() => ({
  db: {
    order: { findFirst: vi.fn(), update: vi.fn() },
    orderItem: { update: vi.fn() },
    orderActivity: { create: vi.fn() },
  },
}));
vi.mock('./db', () => ({ db }));

import { PartialDeliveryRefused, recordPartialDelivery } from './partial-delivery';

const ORDER = 'o1';

/** Two lines: 2 × 10 and 1 × 30, no discount, 5 delivery fee. */
const order = (over: Record<string, unknown> = {}) => ({
  id: ORDER,
  orderNumber: 'SY-2026-0001',
  shippingStatus: 'OUT_FOR_DELIVERY',
  deliveryFee: 5,
  priceIncludesDelivery: false,
  collectedAmount: null,
  items: [
    { id: 'i1', productId: 'p1', productName: 'كريم', quantity: 2, freeQuantity: 0, unitPrice: 10, discountShare: 0 },
    { id: 'i2', productId: 'p2', productName: 'قطرة', quantity: 1, freeQuantity: 0, unitPrice: 30, discountShare: 0 },
  ],
  ...over,
});

const run = (lines: { itemId: string; deliveredQty: number }[]) =>
  recordPartialDelivery(db as never, {
    companyId: 'c1', orderId: ORDER, lines, minorUnit: 2, userId: 'u1',
  });

beforeEach(() => {
  vi.clearAllMocks();
  db.order.findFirst.mockResolvedValue(order());
  db.order.update.mockResolvedValue({});
  db.orderItem.update.mockResolvedValue({});
  db.orderActivity.create.mockResolvedValue({});
});

describe('the delivery fee is charged in full', () => {
  it('charges the whole fee when only one line of two was taken', async () => {
    // Took both units of the 10 line, refused the 30 line.
    const result = await run([{ itemId: 'i1', deliveredQty: 2 }, { itemId: 'i2', deliveredQty: 0 }]);

    expect(result.status).toBe('PARTIALLY_DELIVERED');
    expect(result.deliveredValue).toBe(20);
    expect(result.deliveryFee).toBe(5); // NOT prorated to 2.5
    expect(result.collectedAmount).toBe(25);
  });

  it('charges the same whole fee when almost nothing was taken', async () => {
    const result = await run([{ itemId: 'i1', deliveredQty: 1 }, { itemId: 'i2', deliveredQty: 0 }]);
    expect(result.deliveredValue).toBe(10);
    expect(result.deliveryFee).toBe(5);
    expect(result.collectedAmount).toBe(15);
  });

  it('waives it only when nothing at all was taken — that trip is a return', async () => {
    const result = await run([{ itemId: 'i1', deliveredQty: 0 }, { itemId: 'i2', deliveredQty: 0 }]);
    expect(result.status).toBe('RETURNED');
    expect(result.deliveryFee).toBe(0);
    expect(result.collectedAmount).toBe(0);
  });

  it('does not add the fee twice when the price already includes it', async () => {
    db.order.findFirst.mockResolvedValue(order({ priceIncludesDelivery: true }));
    const result = await run([{ itemId: 'i1', deliveredQty: 2 }, { itemId: 'i2', deliveredQty: 0 }]);
    expect(result.collectedAmount).toBe(20); // the 5 is already inside the line prices
  });
});

describe('what happened to each line', () => {
  it('records delivered and returned units per line', async () => {
    await run([{ itemId: 'i1', deliveredQty: 1 }, { itemId: 'i2', deliveredQty: 1 }]);

    const writes = db.orderItem.update.mock.calls.map((c: any) => [c[0].where.id, c[0].data]);
    expect(writes).toContainEqual(['i1', { deliveredQty: 1, returnedQty: 1 }]);
    expect(writes).toContainEqual(['i2', { deliveredQty: 1, returnedQty: 0 }]);
  });

  it('treats a line nobody mentioned as not delivered', async () => {
    const result = await run([{ itemId: 'i1', deliveredQty: 2 }]);
    expect(result.linesReturned).toBe(1);
    expect(result.returnedUnits).toEqual([
      { itemId: 'i2', productId: 'p2', productName: 'قطرة', quantity: 1 },
    ]);
  });

  it('hands the refused units back rather than restocking them', async () => {
    const result = await run([{ itemId: 'i1', deliveredQty: 0 }, { itemId: 'i2', deliveredQty: 1 }]);
    // Returned to the caller for count-and-inspect; nothing re-entered stock here.
    expect(result.returnedUnits).toEqual([
      { itemId: 'i1', productId: 'p1', productName: 'كريم', quantity: 2 },
    ]);
  });

  it('closes as DELIVERED when every unit was taken', async () => {
    const result = await run([{ itemId: 'i1', deliveredQty: 2 }, { itemId: 'i2', deliveredQty: 1 }]);
    expect(result.status).toBe('DELIVERED');
    expect(result.collectedAmount).toBe(55); // 20 + 30 + 5
  });
});

describe('gift units', () => {
  it('counts a free unit as stock but never charges for it', async () => {
    db.order.findFirst.mockResolvedValue(
      order({
        items: [
          { id: 'i1', productId: 'p1', productName: 'كريم', quantity: 1, freeQuantity: 1, unitPrice: 10, discountShare: 0 },
        ],
      })
    );

    const result = await run([{ itemId: 'i1', deliveredQty: 2 }]);
    expect(result.deliveredValue).toBe(10); // one paid unit, one gift
    expect(result.collectedAmount).toBe(15);
  });
});

describe('the discount follows the line', () => {
  it('charges the discounted unit price for what was taken', async () => {
    db.order.findFirst.mockResolvedValue(
      order({
        items: [
          { id: 'i1', productId: 'p1', productName: 'كريم', quantity: 2, freeQuantity: 0, unitPrice: 10, discountShare: 4 },
        ],
      })
    );

    // One of two units, carrying half the line's 4 discount.
    const result = await run([{ itemId: 'i1', deliveredQty: 1 }]);
    expect(result.deliveredValue).toBe(8);
  });
});

describe('what it refuses', () => {
  it('refuses a parcel that never left for delivery', async () => {
    db.order.findFirst.mockResolvedValue(order({ shippingStatus: 'READY_FOR_PICKUP' }));
    await expect(run([{ itemId: 'i1', deliveredQty: 1 }])).rejects.toThrow(/قبل خروج الشحنة/);
  });

  it('refuses to settle the same order twice', async () => {
    db.order.findFirst.mockResolvedValue(order({ collectedAmount: 25 }));
    await expect(run([{ itemId: 'i1', deliveredQty: 1 }])).rejects.toThrow(/مسبقاً/);
  });

  it('refuses more units than were shipped', async () => {
    await expect(run([{ itemId: 'i1', deliveredQty: 3 }])).rejects.toThrow(PartialDeliveryRefused);
  });

  it('refuses a line from another order', async () => {
    await expect(run([{ itemId: 'not-ours', deliveredQty: 1 }])).rejects.toThrow(/لا ينتمي/);
  });
});
