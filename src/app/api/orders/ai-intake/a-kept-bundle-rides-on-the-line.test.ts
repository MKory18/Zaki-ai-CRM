import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A BUNDLE THE REVIEWER KEEPS RIDES ON THE ORDER — WITH ITS GIFT PIECES.
 *
 * The AI intake's review screen now carries the offer the parse suggested
 * (`suggestedOffer`), and the reviewer confirms with that id in the
 * payload. The door used to have no `offerId` RULE AT ALL: the suggestion
 * died on the preview, the order went out as a plain line, and the third
 * piece of «قطعتين والثالثة مجانا» was never seen again in the system the
 * seller had promised it in.
 *
 * What must hold on this door, the same as the manual and storefront
 * ones: the offer answers to THIS company and THIS product; the gift is
 * `freeQuantity × bundles` with bundles = how many times the paid count
 * fits; below a bundle nothing is invented; and the gift leaves real
 * stock, so the cost of goods counts it.
 */

const { db, requireContext, requirePermission, activeBlock, findOrCreateCustomer,
  orderRefFields, productCost, resolveRegionId, logAudit, notify } = vi.hoisted(() => ({
  db: {
    product: { findFirst: vi.fn(), findMany: vi.fn() },
    offer: { findFirst: vi.fn() },
    user: { findFirst: vi.fn() },
    order: { create: vi.fn() },
    orderItem: { create: vi.fn() },
    customer: { update: vi.fn() },
    orderActivity: { create: vi.fn() },
    $transaction: vi.fn(async (fn: unknown) =>
      typeof fn === 'function' ? (fn as (tx: unknown) => unknown)(db) : fn
    ),
  },
  requireContext: vi.fn(),
  requirePermission: vi.fn(),
  activeBlock: vi.fn(),
  findOrCreateCustomer: vi.fn(),
  orderRefFields: vi.fn(),
  productCost: vi.fn(),
  resolveRegionId: vi.fn(),
  logAudit: vi.fn(),
  notify: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ db }));
vi.mock('@/lib/geo-context', () => ({ requireContext: (...a: unknown[]) => requireContext(...a) }));
vi.mock('@/lib/authorization', () => ({ can: () => false, requirePermission: (...a: unknown[]) => requirePermission(...a) }));
vi.mock('@/lib/blacklist', () => ({ activeBlock: (...a: unknown[]) => activeBlock(...a) }));
vi.mock('@/lib/customer-identity', () => ({ findOrCreateCustomer: (...a: unknown[]) => findOrCreateCustomer(...a) }));
vi.mock('@/lib/order-ref', () => ({ orderRefFields: (...a: unknown[]) => orderRefFields(...a) }));
vi.mock('@/lib/product-cost', () => ({ productCost: (...a: unknown[]) => productCost(...a) }));
vi.mock('@/lib/regions', () => ({ resolveRegionId: (...a: unknown[]) => resolveRegionId(...a) }));
vi.mock('@/lib/audit', () => ({ logAudit: (...a: unknown[]) => logAudit(...a) }));
vi.mock('@/lib/notify', () => ({ notify: (...a: unknown[]) => notify(...a) }));
vi.mock('@/lib/offers', () => ({ activeOffersFor: vi.fn(async () => []) }));
vi.mock('@/lib/order-parser', () => ({
  parseOrderText: vi.fn(),
  matchProduct: vi.fn(),
  normalizeArabic: (s: string) => s,
}));

import { POST } from './route';

const PRODUCT_ID = 'prod-000000001';
const ANOTHER_ID = 'prod-000000002';

const TWO_PLUS_ONE = {
  id: 'offer-2p1-000001', companyId: 'c1', productId: PRODUCT_ID,
  quantity: 2, freeQuantity: 1, discount: 0,
};

const GOOD = {
  customerName: 'سارة علي',
  phone: '0791234567',
  address: 'عمّان',
  productId: PRODUCT_ID,
  quantity: 2,
  finalPrice: 25_000,
};

const confirm = (parsed: Record<string, unknown>) =>
  POST(
    new Request('http://localhost/api/orders/ai-intake', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirm: true, parsed: { ...GOOD, ...parsed } }),
    })
  );

beforeEach(() => {
  vi.clearAllMocks();
  requireContext.mockResolvedValue({
    user: { id: 'u1', name: 'هدى', role: 'CONFIRMATION_AGENT' },
    companyId: 'c1', storeId: 's1', countryId: 'co1',
    country: { id: 'co1', code: 'JO', minorUnit: 2, currencyCode: 'JOD', orderPrefix: 'ORD' },
  });
  requirePermission.mockResolvedValue(undefined);
  activeBlock.mockResolvedValue(null);
  findOrCreateCustomer.mockResolvedValue({ id: 'cu1', city: 'عمّان', firstOrderDate: null });
  db.product.findFirst.mockResolvedValue({
    id: PRODUCT_ID, name: 'كريم مرطّب', image: null, basePrice: 14, batches: [],
  });
  productCost.mockResolvedValue({ average: 7 });
  orderRefFields.mockResolvedValue({ orderNumber: 'ORD-2026-0001' });
  resolveRegionId.mockResolvedValue('r1');
  db.order.create.mockImplementation(async (args: any) => ({ id: 'o1', ...args.data }));
  db.orderItem.create.mockResolvedValue({});
  db.customer.update.mockResolvedValue({});
  db.orderActivity.create.mockResolvedValue({});
});

describe('a kept bundle lands on the line with its gift', () => {
  it('one full bundle: paid 2, one free, and the cost of 3 pieces', async () => {
    db.offer.findFirst.mockResolvedValue(TWO_PLUS_ONE);
    await confirm({ offerId: TWO_PLUS_ONE.id });

    const item = db.orderItem.create.mock.calls[0][0].data;
    expect(item.quantity).toBe(2);
    expect(item.freeQuantity).toBe(1);
    // 2 paid + 1 gift piece from the same shelf, at 7 each.
    expect(db.order.create.mock.calls[0][0].data.estimatedCostOfGoods).toBe(21);
  });

  it('below a bundle the line is plain, and no gift is invented', async () => {
    db.offer.findFirst.mockResolvedValue(TWO_PLUS_ONE);
    await confirm({ offerId: TWO_PLUS_ONE.id, quantity: 1, finalPrice: 12_000 });

    const item = db.orderItem.create.mock.calls[0][0].data;
    expect(item.quantity).toBe(1);
    expect(item.freeQuantity).toBe(0);
    expect(db.order.create.mock.calls[0][0].data.estimatedCostOfGoods).toBe(7);
    // And the money is untouched by an offer that granted nothing.
    expect(db.order.create.mock.calls[0][0].data.totalAmount).toBe(12_000);
  });

  it('an offer of another product is refused by name', async () => {
    db.offer.findFirst.mockResolvedValue(null);
    const res = await confirm({ offerId: TWO_PLUS_ONE.id });
    expect(res.status).toBe(400);
    expect(db.order.create).not.toHaveBeenCalled();
  });

  it('no offer named is the plain line it always was', async () => {
    await confirm({});
    const item = db.orderItem.create.mock.calls[0][0].data;
    expect(item.quantity).toBe(2);
    expect(item.freeQuantity).toBe(0);
    expect(item.unitPrice).toBe(12_500);
  });
});
