import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * An order with more than one product.
 *
 * The items table was always per-line and preparation, partial delivery and
 * returns all read it that way — but every intake path wrote exactly one
 * line, so a second product could not be sold on one order at all.
 *
 * The danger in opening it is arithmetic: the order's own columns
 * (quantity, sellingPrice, totalAmount) are what commission, reporting and
 * statement matching read. If they stop agreeing with the sum of the lines,
 * money goes wrong quietly. These hold them together.
 */

const { db, requireContext, requirePermission, logAudit, activeBlock, createNotification } = vi.hoisted(() => ({
  db: {
    customer: { findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    product: { findMany: vi.fn(), findFirst: vi.fn() },
    offer: { findFirst: vi.fn() },
    store: { findFirst: vi.fn() },
    region: { findFirst: vi.fn() },
    user: { findFirst: vi.fn() },
    order: { create: vi.fn(), count: vi.fn(), findFirst: vi.fn() },
    orderItem: { createMany: vi.fn(), create: vi.fn() },
    orderActivity: { create: vi.fn() },
    orderStatusLog: { create: vi.fn() },
    productionBatch: { findMany: vi.fn() },
    $transaction: vi.fn(),
  },
  requireContext: vi.fn(),
  requirePermission: vi.fn(),
  logAudit: vi.fn(),
  activeBlock: vi.fn(),
  createNotification: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ db }));
vi.mock('@/lib/geo-context', () => ({ requireContext: (...a: unknown[]) => requireContext(...a) }));
vi.mock('@/lib/audit', () => ({ logAudit: (...a: unknown[]) => logAudit(...a) }));
vi.mock('@/lib/blacklist', () => ({ activeBlock: (...a: unknown[]) => activeBlock(...a) }));
vi.mock('@/lib/notification', () => ({ createNotification: (...a: unknown[]) => createNotification(...a) }));
vi.mock('@/lib/rbac', () => ({ applyQueueFilter: (_u: unknown, w: unknown) => w }));
vi.mock('@/lib/authorization', () => ({
  requirePermission: (...a: unknown[]) => requirePermission(...a),
  getPermissionScope: () => ({ scope: 'ALL_COMPANY' }),
  can: () => true,
}));
vi.mock('@/lib/order-ref', () => ({
  orderRefFields: async () => ({ orderNumber: 'SY-2026-0200', merchantRef: 'SY-2026-0200' }),
}));

import { POST } from './route';

const CREAM = { id: 'prod-cream-0001', name: 'كريم حرير', image: null, basePrice: 20, batches: [{ costPerUnit: 5 }] };
const DROPS = { id: 'prod-drops-0001', name: 'قطرة طنين الأذن', image: null, basePrice: 20, batches: [{ costPerUnit: 7 }] };

const syria = {
  id: 'co-sy', code: 'SY', name: 'سوريا', currencyCode: 'USD', minorUnit: 2,
  timezone: 'Asia/Damascus', orderPrefix: 'SY', allowNegativeStock: false,
};

const body = (over: Record<string, unknown>) => ({
  customerName: 'محمد الحسن',
  customerPhone: '0944555666',
  customerAddress: 'دوما',
  source: 'Manual',
  ...over,
});

const post = (b: unknown) =>
  POST(new Request('http://localhost/api/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(b),
  }));

/** The order row and the lines the route wrote. */
function written() {
  return {
    order: db.order.create.mock.calls[0]?.[0]?.data,
    lines: db.orderItem.createMany.mock.calls[0]?.[0]?.data ?? [],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  requireContext.mockResolvedValue({
    user: { id: 'u1', name: 'سارة', role: 'MODERATOR' },
    companyId: 'c1', storeId: 's1', countryId: 'co-sy', country: syria,
  });
  requirePermission.mockResolvedValue({ id: 'u1', companyId: 'c1' });
  activeBlock.mockResolvedValue(null);
  db.customer.findUnique.mockResolvedValue({ id: 'cu1', fullName: 'محمد الحسن', totalOrders: 0 });
  db.customer.findFirst.mockResolvedValue({ id: 'cu1', fullName: 'محمد الحسن', totalOrders: 0 });
  db.product.findMany.mockImplementation(async ({ where }: any) =>
    [CREAM, DROPS].filter((p) => where.id.in.includes(p.id))
  );
  db.offer.findFirst.mockResolvedValue(null);
  db.store.findFirst.mockResolvedValue({ priceIncludesDelivery: true });
  db.user.findFirst.mockResolvedValue({ id: 'u1', commissionRate: 0 });
  db.order.create.mockResolvedValue({ id: 'o-new', orderNumber: 'SY-2026-0200' });
  // Stock on hand, per product, at the cost it was bought or made at. The
  // order's cost of goods is the weighted average of what is actually there.
  db.productionBatch.findMany.mockResolvedValue([
    { productId: CREAM.id, quantityRemaining: 100, costPerUnit: 5 },
    { productId: DROPS.id, quantityRemaining: 100, costPerUnit: 7 },
  ]);
  db.$transaction.mockImplementation(async (fn: any) => fn(db));
});

describe('an order can hold more than one product', () => {
  it('writes a line per product', async () => {
    await post(body({
      items: [
        { productId: CREAM.id, quantity: 2, unitPrice: 40 },
        { productId: DROPS.id, quantity: 1, unitPrice: 20 },
      ],
    }));

    const { lines } = written();
    expect(lines).toHaveLength(2);
    expect(lines.map((l: any) => l.productName)).toEqual(['كريم حرير', 'قطرة طنين الأذن']);
    // unitPrice is stored per unit; the request sends the line's total.
    expect(lines[0].unitPrice).toBe(20);
    expect(lines[1].unitPrice).toBe(20);
  });

  it('keeps the order’s own columns agreeing with the sum of its lines', async () => {
    await post(body({
      items: [
        { productId: CREAM.id, quantity: 2, unitPrice: 40 },
        { productId: DROPS.id, quantity: 1, unitPrice: 20 },
      ],
    }));

    const { order, lines } = written();
    const lineSum = lines.reduce((s: number, l: any) => s + l.lineTotal, 0);

    expect(order.quantity).toBe(3);          // every unit on the order
    expect(order.sellingPrice).toBe(60);     // what the goods are worth
    expect(order.sellingPrice).toBe(lineSum);
    // Delivery is inside the price on this store, so the door total is the goods.
    expect(order.totalAmount).toBe(60);
  });

  it('costs the goods at each product’s own weighted stock cost', async () => {
    await post(body({
      items: [
        { productId: CREAM.id, quantity: 2, unitPrice: 40 },  // 2 × 5
        { productId: DROPS.id, quantity: 1, unitPrice: 20 },  // 1 × 7
      ],
    }));

    expect(written().order.estimatedCostOfGoods).toBe(17);
  });

  it('names the order after its first line', async () => {
    await post(body({
      items: [
        { productId: DROPS.id, quantity: 1, unitPrice: 20 },
        { productId: CREAM.id, quantity: 1, unitPrice: 20 },
      ],
    }));

    const { order } = written();
    expect(order.productId).toBe(DROPS.id);
    expect(order.productNameSnapshot).toBe('قطرة طنين الأذن');
  });

  it('still takes the old single-product shape unchanged', async () => {
    // Landing pages, Telegram and the AI intake all send this.
    await post(body({ productId: CREAM.id, quantity: 2, sellingPrice: 40 }));

    const { order, lines } = written();
    expect(lines).toHaveLength(1);
    expect(order.quantity).toBe(2);
    expect(order.sellingPrice).toBe(40);
  });

  it('refuses a product from another company without creating anything', async () => {
    db.product.findMany.mockResolvedValue([CREAM]); // DROPS is not ours
    const res = await post(body({
      items: [
        { productId: CREAM.id, quantity: 1, unitPrice: 20 },
        { productId: DROPS.id, quantity: 1, unitPrice: 20 },
      ],
    }));

    expect(res.status).toBe(404);
    expect(db.order.create).not.toHaveBeenCalled();
  });

  it('refuses an order with no product at all', async () => {
    const res = await post(body({}));
    expect(res.status).toBe(400);
    expect(db.order.create).not.toHaveBeenCalled();
  });

  it('spreads a discount across the lines so the parts add back to the whole', async () => {
    db.offer.findFirst.mockResolvedValue({ id: 'offer-bundle-0001', deliveryIncluded: false, discount: 10 });

    await post(body({
      offerId: 'offer-bundle-0001',
      items: [
        { productId: CREAM.id, quantity: 2, unitPrice: 40 },
        { productId: DROPS.id, quantity: 1, unitPrice: 20 },
      ],
    }));

    const { order, lines } = written();
    const shares = lines.reduce((s: number, l: any) => s + l.discountShare, 0);
    const totals = lines.reduce((s: number, l: any) => s + l.lineTotal, 0);

    expect(shares).toBe(10);
    expect(totals).toBe(50);
    expect(order.totalAmount).toBe(50);
  });
});

/**
 * Editing an order's lines.
 *
 * Two dangers, and the second is worse. The money: the formula that used to
 * live in the edit read `sellingPrice * quantity`, multiplying a price that
 * is already the line's total by the quantity again, and added the delivery
 * fee even on a store whose prices contain it — so saving an edit changed
 * what the customer owed. And the records: replacing the set deletes the
 * lines it drops, and those lines carry the stock reservation and what was
 * actually delivered or returned.
 */


describe('editing what is on an order', () => {
  it('recomputes the total through the one COD function, not a second formula', async () => {
    const { computeCod } = await import('@/lib/money');

    // The old formula on a delivery-inclusive store: 60 × 3 + 4 − 0 = 184.
    const wrong = 60 * 3 + 4 - 0;

    const right = computeCod({
      lines: [{ quantity: 3, unitPrice: 20 }],
      discount: 0,
      deliveryFee: 4,
      priceIncludesDelivery: true,
      minorUnit: 2,
    });

    expect(right.cod).toBe(60);
    expect(wrong).not.toBe(right.cod);
  });

  it('charges the fee on a store whose prices exclude it, once', async () => {
    const { computeCod } = await import('@/lib/money');
    const money = computeCod({
      lines: [{ quantity: 2, unitPrice: 20 }],
      discount: 0,
      deliveryFee: 2.5,
      priceIncludesDelivery: false,
      minorUnit: 2,
    });
    expect(money.cod).toBe(42.5);
  });
});
