import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * THE OFFER'S GIFT IS A PIECE, NOT A SENTENCE.
 *
 * A bundle promise the manual order model can declare — «قطعتين والثالثة
 * مجانا» — reached the order as a PRICE only. The door struck it through
 * the discount and never wrote `OrderItem.freeQuantity`, so the third
 * piece existed nowhere: it left no stock, rode no waybill, settled no
 * delivery, and the order detail drew two pieces of a three-piece
 * promise. The storefront door (`createPublicOrder`) already wrote the
 * gift; these are the staff doors, held to the same rule.
 *
 * The shape that must hold: `quantity` keeps the PAID count, `freeQuantity`
 * carries the promise, and the pieces a parcel owes are their sum. The
 * customer's money does not move for a gift; the company's cost of goods
 * does, because the third piece leaves the same stock the paid two do.
 */

const { db, requireContext, requirePermission, logAudit, activeBlock, createNotification } = vi.hoisted(() => ({
  db: {
    customer: { findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    product: { findMany: vi.fn(), findFirst: vi.fn() },
    offer: { findFirst: vi.fn(), findMany: vi.fn() },
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
  orderRefFields: async () => ({ orderNumber: 'SY-2026-0300', merchantRef: 'SY-2026-0300' }),
}));

import { POST } from './route';

const CREAM = { id: 'prod-cream-0001', name: 'كريم حرير', image: null, basePrice: 20, batches: [{ costPerUnit: 5 }] };
const DROPS = { id: 'prod-drops-0001', name: 'قطرة طنين الأذن', image: null, basePrice: 20, batches: [{ costPerUnit: 7 }] };

const syria = {
  id: 'co-sy', code: 'SY', name: 'سوريا', currencyCode: 'USD', minorUnit: 2,
  timezone: 'Asia/Damascus', orderPrefix: 'SY', allowNegativeStock: false,
};

/** «قطعتين والثالثة مجانا» — paid 2, one rides along. */
const TWO_PLUS_ONE = {
  id: 'offer-two-plus-1', companyId: 'c1', productId: CREAM.id,
  quantity: 2, freeQuantity: 1, discount: 0,
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

const writtenLines = () => db.orderItem.createMany.mock.calls[0]?.[0]?.data ?? [];
const writtenOrder = () => db.order.create.mock.calls[0]?.[0]?.data;

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
  db.offer.findFirst.mockResolvedValue(TWO_PLUS_ONE);
  db.offer.findMany.mockImplementation(async ({ where }: any) =>
    [TWO_PLUS_ONE].filter((o: { id: string }) => where.id.in.includes(o.id))
  );
  db.store.findFirst.mockResolvedValue({ priceIncludesDelivery: true });
  db.user.findFirst.mockResolvedValue({ id: 'u1', commissionRate: 0 });
  db.order.create.mockResolvedValue({ id: 'o-new', orderNumber: 'SY-2026-0300' });
  db.productionBatch.findMany.mockResolvedValue([
    { productId: CREAM.id, quantityRemaining: 100, costPerUnit: 5 },
  ]);
  db.$transaction.mockImplementation(async (fn: any) => fn(db));
});

describe('an offer that gifts a piece writes the gift on the line', () => {
  it('a full bundle rides with its gift — paid 2, one free', async () => {
    await post(body({ productId: CREAM.id, offerId: TWO_PLUS_ONE.id, quantity: 2, sellingPrice: 40 }));
    const lines = writtenLines();
    expect(lines[0].quantity).toBe(2);
    expect(lines[0].freeQuantity).toBe(1);
    expect(lines[0].unitPrice).toBe(20);
  });

  it('the money is the two paid pieces — the gift costs the customer zero', async () => {
    await post(body({ productId: CREAM.id, offerId: TWO_PLUS_ONE.id, quantity: 2, sellingPrice: 40 }));
    const order = writtenOrder();
    expect(order.quantity).toBe(2);
    expect(order.sellingPrice).toBe(40);
    expect(order.totalAmount).toBe(40);
  });

  it('two bundles make two gifts', async () => {
    await post(body({ productId: CREAM.id, offerId: TWO_PLUS_ONE.id, quantity: 4, sellingPrice: 80 }));
    const lines = writtenLines();
    expect(lines[0].quantity).toBe(4);
    expect(lines[0].freeQuantity).toBe(2);
  });

  it('below one bundle the line is plain — no invented gift', async () => {
    await post(body({ productId: CREAM.id, offerId: TWO_PLUS_ONE.id, quantity: 1, sellingPrice: 20 }));
    const lines = writtenLines();
    expect(lines[0].quantity).toBe(1);
    expect(lines[0].freeQuantity).toBe(0);
  });

  it('and the goods are costed by every piece that leaves, gift included', async () => {
    await post(body({ productId: CREAM.id, offerId: TWO_PLUS_ONE.id, quantity: 2, sellingPrice: 40 }));
    // 3 pieces leave the shelf (2 paid + 1 gift) at 5 each.
    expect(writtenOrder().estimatedCostOfGoods).toBe(15);
  });

  it('a line without the offer is untouched', async () => {
    await post(body({ productId: CREAM.id, quantity: 2, sellingPrice: 40 }));
    const lines = writtenLines();
    expect(lines[0].quantity).toBe(2);
    expect(lines[0].freeQuantity).toBe(0);
  });

  it('refuses an offer that answers to another company', async () => {
    db.offer.findMany.mockResolvedValue([]);
    const res = await post(body({ productId: CREAM.id, offerId: 'offer-foreign-99', quantity: 2, sellingPrice: 40 }));
    expect(res.status).toBe(400);
    expect(db.order.create).not.toHaveBeenCalled();
  });

  it('refuses an offer that answers to another product', async () => {
    // Both products ours; the offer belongs to the CREAM shelf while the
    // line sells the drops — a mix-up the seller must name again.
    const res = await post(body({
      items: [{ productId: DROPS.id, offerId: TWO_PLUS_ONE.id, quantity: 2, unitPrice: 40 }],
    }));
    expect(res.status).toBe(400);
    expect(db.order.create).not.toHaveBeenCalled();
  });
});
