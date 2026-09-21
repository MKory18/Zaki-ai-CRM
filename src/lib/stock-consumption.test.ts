import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./db', () => ({ db: {} }));

const drawDownStock = vi.fn();
const onHandTotal = vi.fn();
vi.mock('./receiving', () => ({
  drawDownStock: (...a: unknown[]) => drawDownStock(...a),
  onHandTotal: (...a: unknown[]) => onHandTotal(...a),
}));

import { consumeOrderStock, restoreOrderStock } from './stock-consumption';

/**
 * Delivering an order used to consume nothing: the reservation was released,
 * the batch kept its remainder, and the unit went back on sale. The measured
 * damage on the live database was 173 units handed to customers while every
 * batch still read 0 sold.
 *
 * So the failures that matter here are the two that let a unit be sold
 * twice, and the one that takes it twice.
 */

const ORDER = {
  orderNumber: 'SY-2026-0100',
  items: [
    { productId: 'p1', productName: 'أ', quantity: 2, freeQuantity: 1 },
    { productId: 'p2', productName: 'ب', quantity: 1, freeQuantity: 0 },
  ],
};

function makeTx(over: Record<string, unknown> = {}) {
  return {
    inventoryMovement: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn() },
    order: { findFirst: vi.fn().mockResolvedValue(ORDER) },
    orderItem: { updateMany: vi.fn() },
    productionBatch: { findFirst: vi.fn().mockResolvedValue({ costPerUnit: 4 }), create: vi.fn().mockResolvedValue({ id: 'b-new' }) },
    ...over,
  } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  drawDownStock.mockResolvedValue({ taken: 0, short: 0 });
  onHandTotal.mockResolvedValue(0);
});

describe('delivering an order', () => {
  it('takes the gift units out too, not just the paid ones', async () => {
    // 2 paid + 1 free left the warehouse. Leaving the free one in stock is
    // how a shelf ends up holding goods that were given away.
    const tx = makeTx();
    drawDownStock.mockResolvedValue({ taken: 3, short: 0 });
    await consumeOrderStock(tx, { orderId: 'o1', companyId: 'c1', allowNegativeStock: false });
    expect(drawDownStock.mock.calls[0][1].quantity).toBe(3);
    expect(drawDownStock.mock.calls[1][1].quantity).toBe(1);
  });

  it('refuses to consume the same order twice', async () => {
    // Couriers retry and humans press the button again; consuming twice
    // would invent a shortage that never happened.
    const tx = makeTx({
      inventoryMovement: { findFirst: vi.fn().mockResolvedValue({ id: 'm1' }), create: vi.fn() },
    });
    const res = await consumeOrderStock(tx, { orderId: 'o1', companyId: 'c1', allowNegativeStock: false });
    expect(res.alreadyDone).toBe(true);
    expect(drawDownStock).not.toHaveBeenCalled();
  });

  it('keys that check to THIS order, not to any sale', async () => {
    const tx = makeTx();
    await consumeOrderStock(tx, { orderId: 'o1', companyId: 'c1', allowNegativeStock: false });
    expect((tx as any).inventoryMovement.findFirst.mock.calls[0][0].where).toEqual({
      referenceId: 'o1',
      type: 'SALE',
    });
  });

  it('writes the movement as a negative quantity, because stock went down', async () => {
    const tx = makeTx();
    drawDownStock.mockResolvedValue({ taken: 3, short: 0 });
    await consumeOrderStock(tx, { orderId: 'o1', companyId: 'c1', allowNegativeStock: false });
    expect((tx as any).inventoryMovement.create.mock.calls[0][0].data.quantity).toBe(-3);
  });

  it('records no movement for a line that supplied nothing', async () => {
    // A ledger line for zero units is noise that makes a real one harder to find.
    const tx = makeTx();
    drawDownStock.mockResolvedValue({ taken: 0, short: 3 });
    await consumeOrderStock(tx, { orderId: 'o1', companyId: 'c1', allowNegativeStock: false });
    expect((tx as any).inventoryMovement.create).not.toHaveBeenCalled();
  });

  it('reports the shortfall instead of hiding it', async () => {
    const tx = makeTx();
    drawDownStock.mockResolvedValue({ taken: 1, short: 2 });
    const res = await consumeOrderStock(tx, { orderId: 'o1', companyId: 'c1', allowNegativeStock: true });
    expect(res.short).toBe(4); // two lines, two short each way
  });

  it('clears the reservation, because the units are gone and not held', async () => {
    const tx = makeTx();
    await consumeOrderStock(tx, { orderId: 'o1', companyId: 'c1', allowNegativeStock: false });
    expect((tx as any).orderItem.updateMany).toHaveBeenCalledWith({
      where: { orderId: 'o1', reservedQty: { gt: 0 } },
      data: { reservedQty: 0 },
    });
  });

  it('does nothing for an order of another company', async () => {
    const tx = makeTx({ order: { findFirst: vi.fn().mockResolvedValue(null) } });
    const res = await consumeOrderStock(tx, { orderId: 'o1', companyId: 'someone-else', allowNegativeStock: false });
    expect(res).toMatchObject({ taken: 0, short: 0 });
    expect(drawDownStock).not.toHaveBeenCalled();
  });
});

describe('receiving a return', () => {
  it('puts the units into a real batch, not only into the ledger', async () => {
    // The whole bug: a ledger line moves nothing, and the shipment screen
    // keeps reporting a shortage for stock the ledger says is back.
    const tx = makeTx();
    await restoreOrderStock(tx, { orderId: 'o1', companyId: 'c1', receivedQty: 3 });
    expect((tx as any).productionBatch.create).toHaveBeenCalled();
    const data = (tx as any).productionBatch.create.mock.calls[0][0].data;
    expect(data.quantityRemaining).toBe(3);
    expect(data.quantitySold).toBe(0);
  });

  it('returns them at the cost they left at', async () => {
    const tx = makeTx();
    await restoreOrderStock(tx, { orderId: 'o1', companyId: 'c1', receivedQty: 2 });
    const data = (tx as any).productionBatch.create.mock.calls[0][0].data;
    expect(data.costPerUnit).toBe(4);
    expect(data.totalProductionCost).toBe(8);
  });

  it('restores only what was counted, never what was shipped', async () => {
    // Three went out, one came back sound. Two are gone.
    const tx = makeTx();
    await restoreOrderStock(tx, { orderId: 'o1', companyId: 'c1', receivedQty: 1 });
    expect((tx as any).productionBatch.create.mock.calls[0][0].data.quantityRemaining).toBe(1);
    expect((tx as any).productionBatch.create).toHaveBeenCalledTimes(1);
  });

  it('does nothing when nothing came back sound', async () => {
    const tx = makeTx();
    const res = await restoreOrderStock(tx, { orderId: 'o1', companyId: 'c1', receivedQty: 0 });
    expect(res.restored).toBe(0);
    expect((tx as any).productionBatch.create).not.toHaveBeenCalled();
  });

  it('refuses to restore the same return twice', async () => {
    const tx = makeTx({
      inventoryMovement: { findFirst: vi.fn().mockResolvedValue({ id: 'm1' }), create: vi.fn() },
    });
    const res = await restoreOrderStock(tx, { orderId: 'o1', companyId: 'c1', receivedQty: 3 });
    expect(res.alreadyDone).toBe(true);
    expect((tx as any).productionBatch.create).not.toHaveBeenCalled();
  });
});
