import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * ONE ORDER'S MONEY IS POSTED TO THE PRODUCT TABLE EXACTLY ONCE.
 *
 * An order's shipping cost and its cost of goods belong to the ORDER; the
 * product rows split them by each product's share of the order's value, so
 * «the parts still add back up to the whole», which is what the file says
 * out loud above the arithmetic.
 *
 * A zero-value order has no value to split BY, and the fallback for that
 * returned a share of 1 — per ROW. One row is right: the whole order is
 * that row. TWO rows each took the whole, so the order's shipping cost, its
 * cost of goods and the money collected for it were all posted twice, and
 * the product table said the shop spent twice what it spent.
 *
 * Reachable: the order PATCH schema takes `unitPrice` `min(0)`, the price
 * box carries `min={0}`, and an order discount that meets a line's subtotal
 * writes `lineTotal` 0.
 */

const { db } = vi.hoisted(() => ({
  db: {
    order: { groupBy: vi.fn(), count: vi.fn(), aggregate: vi.fn(), findMany: vi.fn() },
    orderItem: { groupBy: vi.fn() },
    expense: { aggregate: vi.fn(async () => ({ _sum: { amount: 0 } })) },
    user: { findMany: vi.fn(async () => []) },
    product: { findMany: vi.fn() },
  },
}));
vi.mock('./db', () => ({ db }));
vi.mock('./commission', () => ({
  commissionCostForOrders: async () => 0,
  commissionByUserForOrders: async () => new Map(),
}));

import { getCompanyAnalytics } from './analytics';

interface Line {
  productId: string;
  orderId: string;
  lineTotal: number;
}
interface Order {
  id: string;
  totalAmount: number;
  collectedAmount: number | null;
  shippingCost: number;
  estimatedCostOfGoods: number;
}

/** A window holding exactly these delivered orders and these lines. */
function window(orders: Order[], lines: Line[]) {
  db.order.groupBy.mockImplementation(async ({ by }: { by: string[] }) => {
    if (by.includes('moderatorId')) return [];
    if (by.includes('confirmationStatus')) return [{ confirmationStatus: 'CONFIRMED', _count: { _all: orders.length } }];
    return [{ shippingStatus: 'DELIVERED', _count: { _all: orders.length } }];
  });
  db.orderItem.groupBy.mockResolvedValue(
    lines.map((l) => ({
      productId: l.productId,
      orderId: l.orderId,
      _sum: { lineTotal: l.lineTotal, quantity: 1 },
    }))
  );
  // The order rows the lines inherit their status and their costs from, and
  // — on the second call, the one carrying `include` — the recent-orders list.
  db.order.findMany.mockImplementation(async (args: { include?: unknown }) =>
    args.include
      ? []
      : orders.map((o) => ({
          ...o,
          confirmationStatus: 'CONFIRMED',
          shippingStatus: 'DELIVERED',
        }))
  );
  db.product.findMany.mockImplementation(async () =>
    [...new Set(lines.map((l) => l.productId))].map((id) => ({ id, name: id, sku: id, image: null }))
  );
  db.order.count.mockResolvedValue(0);
  db.order.aggregate.mockResolvedValue({ _count: { _all: orders.length }, _sum: {} });
  return getCompanyAnalytics({ companyId: 'c1', storeId: 's1' });
}

const sum = (rows: { shippingCost: number; cogs: number; revenue: number }[]) => ({
  shippingCost: Number(rows.reduce((s, r) => s + r.shippingCost, 0).toFixed(2)),
  cogs: Number(rows.reduce((s, r) => s + r.cogs, 0).toFixed(2)),
  revenue: Number(rows.reduce((s, r) => s + r.revenue, 0).toFixed(2)),
});

beforeEach(() => vi.clearAllMocks());

describe('a zero-value order with TWO products', () => {
  // Both lines written 0 — a discount that met the subtotal. The shop still
  // paid the courier 10 and still shipped 40 of goods, and the door still
  // recorded 12 collected.
  const ZERO_TWO: Order = { id: 'o1', totalAmount: 0, collectedAmount: 12, shippingCost: 10, estimatedCostOfGoods: 40 };
  const LINES: Line[] = [
    { productId: 'cream', orderId: 'o1', lineTotal: 0 },
    { productId: 'serum', orderId: 'o1', lineTotal: 0 },
  ];

  it('posts the order’s shipping cost ONCE — 10, not 20', async () => {
    const a = await window([ZERO_TWO], LINES);
    expect(a.productStats).toHaveLength(2);
    expect(sum(a.productStats).shippingCost).toBe(10);
  });

  it('posts its cost of goods once — 40, not 80', async () => {
    const a = await window([ZERO_TWO], LINES);
    expect(sum(a.productStats).cogs).toBe(40);
  });

  it('posts the money collected once — 12, not 24', async () => {
    const a = await window([ZERO_TWO], LINES);
    expect(sum(a.productStats).revenue).toBe(12);
  });

  it('and splits each figure equally, because no line carries more value than the other', async () => {
    const a = await window([ZERO_TWO], LINES);
    for (const p of a.productStats) {
      expect(p.shippingCost).toBe(5);
      expect(p.cogs).toBe(20);
      expect(p.revenue).toBe(6);
    }
  });

  it('three zero lines are a third each — the error grew with the line count', async () => {
    const a = await window([ZERO_TWO], [
      ...LINES,
      { productId: 'soap', orderId: 'o1', lineTotal: 0 },
    ]);
    expect(a.productStats).toHaveLength(3);
    expect(sum(a.productStats).shippingCost).toBe(10);
    expect(sum(a.productStats).cogs).toBe(40);
  });
});

describe('the case the fallback was written for', () => {
  it('a zero-value order with ONE product still takes the whole of it', async () => {
    const a = await window(
      [{ id: 'o2', totalAmount: 0, collectedAmount: null, shippingCost: 7, estimatedCostOfGoods: 25 }],
      [{ productId: 'cream', orderId: 'o2', lineTotal: 0 }]
    );
    expect(a.productStats).toHaveLength(1);
    expect(a.productStats[0].shippingCost).toBe(7);
    expect(a.productStats[0].cogs).toBe(25);
    // Nothing collected on a zero order, and nothing invented for it.
    expect(a.productStats[0].revenue).toBe(0);
  });
});

describe('an order that does have value is untouched', () => {
  it('splits by each product’s share of it — 30/70, not half and half', async () => {
    const a = await window(
      [{ id: 'o3', totalAmount: 100, collectedAmount: null, shippingCost: 10, estimatedCostOfGoods: 50 }],
      [
        { productId: 'cream', orderId: 'o3', lineTotal: 30 },
        { productId: 'serum', orderId: 'o3', lineTotal: 70 },
      ]
    );
    const cream = a.productStats.find((p) => p.id === 'cream')!;
    const serum = a.productStats.find((p) => p.id === 'serum')!;
    expect(cream.shippingCost).toBe(3);
    expect(serum.shippingCost).toBe(7);
    expect(cream.revenue).toBe(30);
    expect(serum.revenue).toBe(70);
    expect(sum(a.productStats).shippingCost).toBe(10);
    expect(sum(a.productStats).revenue).toBe(100);
  });

  it('and a zero line beside a valued one gets none of the cost', async () => {
    // Not an equal split: this order HAS a value to allocate by, and the
    // free unit carried none of it.
    const a = await window(
      [{ id: 'o4', totalAmount: 100, collectedAmount: null, shippingCost: 10, estimatedCostOfGoods: 50 }],
      [
        { productId: 'cream', orderId: 'o4', lineTotal: 100 },
        { productId: 'gift', orderId: 'o4', lineTotal: 0 },
      ]
    );
    expect(a.productStats.find((p) => p.id === 'gift')!.shippingCost).toBe(0);
    expect(a.productStats.find((p) => p.id === 'cream')!.shippingCost).toBe(10);
  });
});

describe('two orders in the same window do not borrow each other’s line count', () => {
  it('the zero one splits in two and the valued one splits by value', async () => {
    const a = await window(
      [
        { id: 'o5', totalAmount: 0, collectedAmount: null, shippingCost: 10, estimatedCostOfGoods: 0 },
        { id: 'o6', totalAmount: 100, collectedAmount: null, shippingCost: 20, estimatedCostOfGoods: 0 },
      ],
      [
        { productId: 'cream', orderId: 'o5', lineTotal: 0 },
        { productId: 'serum', orderId: 'o5', lineTotal: 0 },
        { productId: 'cream', orderId: 'o6', lineTotal: 100 },
      ]
    );
    // cream: 5 from the zero order + 20 from the valued one.
    expect(a.productStats.find((p) => p.id === 'cream')!.shippingCost).toBe(25);
    expect(a.productStats.find((p) => p.id === 'serum')!.shippingCost).toBe(5);
    expect(sum(a.productStats).shippingCost).toBe(30);
  });
});
