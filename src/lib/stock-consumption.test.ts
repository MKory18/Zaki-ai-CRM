import { beforeEach, describe, expect, it, vi } from 'vitest';
import { repoFile, stripComments } from './guard-source';

vi.mock('./db', () => ({ db: {} }));

const drawDownStock = vi.fn();
const onHandTotal = vi.fn();
vi.mock('./receiving', () => ({
  drawDownStock: (...a: unknown[]) => drawDownStock(...a),
  onHandTotal: (...a: unknown[]) => onHandTotal(...a),
}));

import { consumeOrderStock, restoreOrderStock, absorbDamaged } from './stock-consumption';

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
  /**
   * Every case here is a return of goods that WERE delivered — the ledger
   * holds a SALE for the order. That is the premise, not a detail: goods
   * that never left the shelf are a different case entirely, below.
   */
  const delivered = (over: Record<string, unknown> = {}) =>
    makeTx({
      inventoryMovement: {
        findFirst: vi.fn(async ({ where }: any) => (where?.type === 'SALE' ? { id: 'sale-1' } : null)),
        create: vi.fn(),
      },
      ...over,
    });

  it('puts the units into a real batch, not only into the ledger', async () => {
    // The whole bug: a ledger line moves nothing, and the shipment screen
    // keeps reporting a shortage for stock the ledger says is back.
    const tx = delivered();
    await restoreOrderStock(tx, { orderId: 'o1', companyId: 'c1', receivedQty: 3 });
    expect((tx as any).productionBatch.create).toHaveBeenCalled();
    const data = (tx as any).productionBatch.create.mock.calls[0][0].data;
    expect(data.quantityRemaining).toBe(3);
    expect(data.quantitySold).toBe(0);
  });

  it('returns them at the cost they left at', async () => {
    const tx = delivered();
    await restoreOrderStock(tx, { orderId: 'o1', companyId: 'c1', receivedQty: 2 });
    const data = (tx as any).productionBatch.create.mock.calls[0][0].data;
    expect(data.costPerUnit).toBe(4);
    expect(data.totalProductionCost).toBe(8);
  });

  it('restores only what was counted, never what was shipped', async () => {
    // Three went out, one came back sound. Two are gone.
    const tx = delivered();
    await restoreOrderStock(tx, { orderId: 'o1', companyId: 'c1', receivedQty: 1 });
    expect((tx as any).productionBatch.create.mock.calls[0][0].data.quantityRemaining).toBe(1);
    expect((tx as any).productionBatch.create).toHaveBeenCalledTimes(1);
  });

  it('does nothing when nothing came back sound', async () => {
    const tx = delivered();
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

describe('a return of goods that never left the shelf', () => {
  /**
   * Consumption happens at DELIVERY, not at dispatch. An order refused at
   * the door never took its units out of a batch, so "restoring" them
   * creates stock that was never removed — a fresh batch of units the shelf
   * already holds. The figure climbs by a whole parcel each time.
   */
  const neverDelivered = () =>
    makeTx({ inventoryMovement: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn() } });

  it('restores nothing, and says why', async () => {
    const tx = neverDelivered();
    const res = await restoreOrderStock(tx, { orderId: 'o1', companyId: 'c1', receivedQty: 3 });
    expect(res).toMatchObject({ restored: 0, neverConsumed: true });
    expect((tx as any).productionBatch.create).not.toHaveBeenCalled();
    expect((tx as any).inventoryMovement.create).not.toHaveBeenCalled();
  });

  it('is not the same answer as "already returned"', async () => {
    // Both restore nothing, and a caller that cannot tell them apart cannot
    // report either one honestly.
    const tx = neverDelivered();
    const res = await restoreOrderStock(tx, { orderId: 'o1', companyId: 'c1', receivedQty: 3 });
    expect(res.alreadyDone).toBe(false);
  });

  it('asks the LEDGER whether it left, never the order’s status', async () => {
    // A status can be rewritten by a later path; a movement row cannot.
    const tx = neverDelivered();
    await restoreOrderStock(tx, { orderId: 'o1', companyId: 'c1', receivedQty: 3 });
    const asked = (tx as any).inventoryMovement.findFirst.mock.calls.map((c: any) => c[0].where.type);
    expect(asked).toContain('SALE');
  });
});

/**
 * THE DAMAGED UNITS LEAVE THE SHELF; THEIR MONEY DOES NOT LEAVE THE PRODUCT.
 *
 * The owner ruled it: «إذا في توالف لازم تنقص من المخزون بس داخلة ضمن
 * التكلفة تبع المخزون للمنتج». Writing them off would be the ordinary
 * treatment and it is not what was asked — the cost stays on the product,
 * carried by whatever survived, so the price set from that cost is the one
 * that earns the money back.
 */
describe('absorbDamaged — the cost of what broke', () => {
  it('puts the whole parcel’s money onto the units that survived', () => {
    // Sixteen units at 2.00 went out; twelve came back sound, four broken.
    const r = absorbDamaged({ sound: 12, damaged: 4, costPerUnit: 2 });
    expect(r.quantity).toBe(12);
    expect(r.totalCost).toBe(32);
    expect(r.costPerUnit).toBe(2.67);
    expect(r.absorbed).toBe(8);
  });

  /**
   * THE INVARIANT. Absorption moves money between units; it never creates
   * or destroys any. A mutation that "spreads" the cost by inventing some
   * of it would pass every rate check and fail this.
   */
  it('and not one piastre more or less than went out', () => {
    for (const [sound, damaged, cost] of [[12, 4, 2], [1, 9, 3.5], [7, 0, 1.25], [100, 3, 0.99]] as const) {
      const r = absorbDamaged({ sound, damaged, costPerUnit: cost });
      expect(r.totalCost).toBeCloseTo(cost * (sound + damaged), 1);
    }
  });

  it('changes nothing at all when nothing broke', () => {
    const r = absorbDamaged({ sound: 12, damaged: 0, costPerUnit: 2 });
    expect(r.costPerUnit).toBe(2);
    expect(r.totalCost).toBe(24);
    expect(r.absorbed).toBe(0);
  });

  /**
   * AND WHEN EVERY UNIT BROKE THERE IS NOBODY TO CARRY IT.
   *
   * Returning a cost with no units to hold it would put money into a batch
   * of nothing, and the average cost of the product would divide by zero or
   * — worse — quietly land on a different batch. The loss is real here, and
   * the function says so by returning nothing rather than pretending.
   */
  it('carries nothing when no unit came back sound', () => {
    expect(absorbDamaged({ sound: 0, damaged: 6, costPerUnit: 2 })).toEqual({
      quantity: 0,
      totalCost: 0,
      costPerUnit: 0,
      absorbed: 0,
    });
  });

  it('returns the units even when what they cost was never recorded', () => {
    // Cost of goods is unrecorded on almost every order in this shop, so
    // this is the common case, not the edge: the units still go back.
    const r = absorbDamaged({ sound: 5, damaged: 2, costPerUnit: 0 });
    expect(r.quantity).toBe(5);
    expect(r.totalCost).toBe(0);
    expect(r.absorbed).toBe(0);
  });

  it('refuses nonsense instead of writing it into a batch', () => {
    expect(absorbDamaged({ sound: -3, damaged: 2, costPerUnit: 2 }).quantity).toBe(0);
    expect(absorbDamaged({ sound: 4, damaged: -2, costPerUnit: 2 }).totalCost).toBe(8);
    expect(absorbDamaged({ sound: 4, damaged: 1, costPerUnit: Number.NaN }).totalCost).toBe(0);
    expect(absorbDamaged({ sound: 4.9, damaged: 1.9, costPerUnit: 2 }).quantity).toBe(4);
  });
});

/**
 * AND THE COUNTING DESK ACTUALLY HANDS THE DAMAGE OVER.
 *
 * The rule can be perfect and reach nothing: `restoreOrderStock` takes the
 * damaged count as an OPTIONAL argument, so a caller that forgets it gets
 * the old write-off behaviour silently, with every test above still green.
 * This is the wire.
 */
describe('the returns desk passes the damaged count to the shelf', () => {
  it('hands both counts to restoreOrderStock', () => {
    const src = stripComments(repoFile('src/app/api/ops/returns/route.ts'));
    expect(src.length).toBeGreaterThan(200);
    expect(src).toMatch(/restoreOrderStock\(tx, \{[\s\S]{0,200}?damagedQty: input\.damagedQty/);
  });
});
