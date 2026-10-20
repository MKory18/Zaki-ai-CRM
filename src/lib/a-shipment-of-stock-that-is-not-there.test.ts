import { describe, expect, it, vi, beforeEach } from 'vitest';

const db = {
  order: { count: vi.fn() },
  orderItem: { findMany: vi.fn(), aggregate: vi.fn() },
  productionBatch: { aggregate: vi.fn() },
  deliveryFee: { findFirst: vi.fn() },
};
vi.mock('./db', () => ({ db }));

import { shipmentBlocks } from './operations';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * THE ORDER IS TAKEN WITHOUT STOCK. IT STOPS AT THE SHIPMENT.
 *
 * The owner, 20/10: «ع فرص اجى طلب وفش ستوك — المفروض ياخدو من المودريتور
 * ومن السايت، بس يوقف عند انشاء الشحنة».
 *
 * Both halves of that were measured against the code:
 *
 *   • TAKING it is already right. Neither `POST /api/orders` nor
 *     `createPublicOrder` asks about stock, the product picker does not
 *     hide a product that has none, and confirming does not refuse —
 *     `reserveOrderLines` simply leaves a short line unreserved. An order
 *     for something that is not on the shelf can be entered and confirmed
 *     from either door, which is what he asked for.
 *
 *   • STOPPING it was right in one configuration out of two.
 *
 * ── AND THE SECOND CONFIGURATION WAS WORSE THAN «DOES NOT STOP» ──
 *
 * `allowNegativeStock` is a per-country flag (default false). It was meant
 * to SOFTEN the shipment block — a shortage you may ship anyway, after
 * acknowledging it — and `shipmentBlocks` says exactly that:
 * `hard: !opts.allowNegativeStock`.
 *
 * That soft branch could never run. With the flag ON, confirming RESERVES
 * the line against stock that does not exist, so by the time the shipment
 * is built `reservedQty` equals the full quantity — and the block was
 * computed from what was left UNRESERVED:
 *
 *     const need = line.quantity + line.freeQuantity - line.reservedQty;
 *     if (need <= 0) continue;        // ← always, once reserved
 *
 * So `STOCK_SHORTAGE` only ever fired for a line nothing had reserved,
 * which only happens when the flag is OFF, where `hard` is then `true`.
 * **The flag did not soften the stop. It deleted it** — no block, no
 * acknowledgement, no line on the screen, and a parcel built for goods
 * that are not in the building.
 *
 * ── SO THE QUESTION CHANGES ──
 *
 * Not «how much of this line is still unreserved» — a reservation made
 * against nothing answers that with zero. The question is «is the stock
 * actually there», asked of the shelf: `availableStock` already excludes
 * this order's own reservation, so it is the honest number either way.
 * ═══════════════════════════════════════════════════════════════════════
 */

const order = {
  id: 'o1',
  companyId: 'c1',
  storeId: 's1',
  customerId: 'cust1',
  regionId: 'r1',
  deliveryProviderId: 'dp1',
};

/** The shelf: what is physically there, and what other orders hold. */
function shelf(onHand: number, reservedElsewhere = 0) {
  db.productionBatch.aggregate.mockResolvedValue({ _sum: { quantityRemaining: onHand } });
  db.orderItem.aggregate.mockResolvedValue({ _sum: { reservedQty: reservedElsewhere } });
}

/** One line of two units, reserved or not. */
function line(reservedQty: number) {
  db.orderItem.findMany.mockResolvedValue([
    { productId: 'p1', productName: 'مقشر', quantity: 2, freeQuantity: 0, reservedQty },
  ]);
}

const stockBlock = (blocks: { code: string; message: string; hard: boolean }[]) =>
  blocks.find((b) => b.code === 'STOCK_SHORTAGE');

beforeEach(() => {
  vi.clearAllMocks();
  db.order.count.mockResolvedValue(0);
  db.deliveryFee.findFirst.mockResolvedValue({ id: 'f1' });
});

describe('a shipment is refused for goods that are not on the shelf', () => {
  it('— when the country forbids negative stock, and the line was left unreserved', async () => {
    // The configuration that already worked. It still must.
    shelf(0);
    line(0);
    const blocks = await shipmentBlocks(db as never, order, { allowNegativeStock: false });
    expect(stockBlock(blocks)).toMatchObject({ code: 'STOCK_SHORTAGE', hard: true });
  });

  it('— AND when the country allows it, where the line was reserved against nothing', async () => {
    /*
     * THE ONE THAT WAS SILENT.
     *
     * Confirming with `allowNegativeStock: true` writes `reservedQty = 2`
     * although the shelf holds none. The old reading asked what was left
     * unreserved — zero — and skipped the line entirely.
     */
    shelf(0);
    line(2);
    const blocks = await shipmentBlocks(db as never, order, { allowNegativeStock: true });
    expect(stockBlock(blocks), 'الشحنة انبنت على مخزون مش موجود، وبلا ولا كلمة').toBeDefined();
  });

  it('and that one is SOFT — a shortage the country allows you to ship, deliberately', async () => {
    /*
     * The distinction the flag was always meant to make, and could not:
     * refused outright when negative stock is forbidden, and shippable
     * with an explicit acknowledgement when it is allowed. Soft is not
     * «ignored» — the shipments door refuses a soft block too unless THIS
     * order was acknowledged by name.
     */
    shelf(0);
    line(2);
    const blocks = await shipmentBlocks(db as never, order, { allowNegativeStock: true });
    expect(stockBlock(blocks)).toMatchObject({ hard: false });
  });

  it('and it says how many are missing, not merely that something is', async () => {
    // A picker reads this at the shelf. «ينقص ٢» is an instruction;
    // «نقص مخزون» is a riddle.
    shelf(0);
    line(2);
    const blocks = await shipmentBlocks(db as never, order, { allowNegativeStock: true });
    expect(stockBlock(blocks)!.message).toContain('مقشر');
    expect(stockBlock(blocks)!.message).toContain('2');
  });
});

describe('and it is not refused for goods that ARE there', () => {
  it('— the ordinary order, reserved against real stock', async () => {
    /*
     * `availableStock` excludes THIS order's own reservation, so a line
     * holding two of the ten on the shelf must read as «eight others
     * could still take, and my two are covered» — not as a shortage of
     * its own making. Getting this wrong would block every shipment in
     * the company.
     */
    shelf(10);
    line(2);
    const blocks = await shipmentBlocks(db as never, order, { allowNegativeStock: false });
    expect(stockBlock(blocks), 'طلب مخزونه موجود انحجز عليه').toBeUndefined();
  });

  it('and an unreserved line that the shelf can still cover', async () => {
    // Nothing has reserved it yet, but the goods are there. The shipment
    // door is not the place to refuse that.
    shelf(10);
    line(0);
    const blocks = await shipmentBlocks(db as never, order, { allowNegativeStock: false });
    expect(stockBlock(blocks)).toBeUndefined();
  });

  it('but IS refused when another order already holds what is left', async () => {
    // Ten on the shelf, nine held by other orders, this order needs two.
    shelf(10, 9);
    line(0);
    const blocks = await shipmentBlocks(db as never, order, { allowNegativeStock: false });
    expect(stockBlock(blocks), 'اتنين انباعوا من نفس الواحد اللي ضايل').toMatchObject({ hard: true });
  });
});
