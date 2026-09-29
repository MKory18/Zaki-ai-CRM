import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * THE DOOR CREATES TWO SETTLEMENTS AND SAYS SO.
 *
 *   «بصير الطلب بيتمم مرتين — مرة بيتمم للمستلم ومرة للطلب الراجع. واذا اتمم
 *    واحد فهو اتمم جزءي، ما بنغلق غير كامل»
 *
 * The person at this screen finishes their half and closes the dialog, so the
 * toast is the only moment they can be told there is a second one. It used to
 * read «تسليم جزئي — حُصِّل N», which says two wrong things at once: that
 * money was collected here (it is the courier's statement that writes money)
 * and that the order is done.
 */

const { db, requireContext, requirePermission, logAudit } = vi.hoisted(() => ({
  db: {
    orderItem: { findMany: vi.fn(), update: vi.fn() },
    order: { findFirst: vi.fn(), update: vi.fn() },
    orderActivity: { create: vi.fn() },
    orderNote: { create: vi.fn() },
    customer: { update: vi.fn() },
    deliveryAttempt: { findFirst: vi.fn(async () => null), create: vi.fn(async () => ({ id: 'a1', attemptNumber: 1 })) },
    $transaction: vi.fn(async (fn: any) => fn(db)),
  },
  requireContext: vi.fn(),
  requirePermission: vi.fn(),
  logAudit: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ db }));
vi.mock('@/lib/geo-context', () => ({ requireContext: (...a: unknown[]) => requireContext(...a) }));
vi.mock('@/lib/authorization', () => ({ requirePermission: (...a: unknown[]) => requirePermission(...a), can: () => true }));
vi.mock('@/lib/audit', () => ({ logAudit: (...a: unknown[]) => logAudit(...a) }));
vi.mock('@/lib/stock-consumption', () => ({ consumeOrderStock: vi.fn(async () => ({ taken: 0, short: 0 })) }));

import { POST } from './route';

const ORDER = '44444444-4444-4444-8444-444444444444';
const I1 = '55555555-5555-4555-8555-555555555555';

const post = (body: unknown) =>
  new Request('http://localhost/x', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

/** One line of three units at 10 each, 5 delivery fee. */
const order = (over: Record<string, unknown> = {}) => ({
  id: ORDER,
  orderNumber: 'SY-2026-0148',
  shippingStatus: 'OUT_FOR_DELIVERY',
  deliveryFee: 5,
  priceIncludesDelivery: false,
  customerId: 'cust-1',
  deliveredAt: null,
  returnedAt: null,
  deliveryProviderId: 'dp1',
  settlementStatus: 'PENDING_COLLECTION',
  items: [{ id: I1, productId: 'p1', productName: 'ماء الكمأ', quantity: 3, freeQuantity: 0, unitPrice: 10, discountShare: 0 }],
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  requireContext.mockResolvedValue({
    user: { id: 'u1', name: 'متابعة', role: 'FOLLOW_UP', status: 'ACTIVE' },
    companyId: 'c1', storeId: 's1',
    country: { minorUnit: 2, currencyCode: 'SYP', allowNegativeStock: false },
  });
  requirePermission.mockResolvedValue({});
  db.order.findFirst.mockResolvedValue(order());
  db.order.update.mockResolvedValue({});
  db.orderItem.update.mockResolvedValue({});
  db.orderActivity.create.mockResolvedValue({});
  db.customer.update.mockResolvedValue({});
});

describe('a partial delivery is reported as half done', () => {
  const partial = () => post({ orderId: ORDER, lines: [{ itemId: I1, deliveredQty: 2 }] });

  it('returns both halves, neither of them settled', async () => {
    const res = await POST(partial());
    const out = await res.json();
    expect(out.status).toBe('PARTIALLY_DELIVERED');
    expect(out.deliveredUnits).toBe(2);
    expect(out.refusedUnits).toBe(1);
    expect(out.completion.halves.map((h: { key: string }) => h.key)).toEqual(['MONEY', 'GOODS']);
    expect(out.completion.complete).toBe(false);
  });

  it('never claims the refused units are already back on a shelf', async () => {
    // They are in the courier's van. The returns desk settles that half.
    const out = await (await POST(partial())).json();
    expect(out.completion.halves.find((h: { key: string }) => h.key === 'GOODS').settled).toBe(false);
  });

  it('says in the message that the order will not close on one half', async () => {
    const out = await (await POST(partial())).json();
    expect(out.message).toContain('بانتظار');
    // «المتوقَّع», not «حُصِّل»: nobody at this screen knows what money
    // arrived, and the door deliberately does not write it.
    expect(out.message).not.toContain('حُصِّل');
    expect(out.message).toContain('المتوقَّع');
  });

  it('counts the refused units in the message, in Western digits', async () => {
    const out = await (await POST(partial())).json();
    expect(out.message).toContain('1 قطعة راجعة');
    expect(out.message).not.toMatch(/[٠-٩]/);
  });

  it('records which half it left open in the audit trail', async () => {
    await POST(partial());
    expect(logAudit.mock.calls[0][0].newData).toMatchObject({ completion: 'NONE', awaiting: ['MONEY', 'GOODS'] });
  });
});

describe('the two outcomes that are not halved', () => {
  it('a whole delivery has one half — nothing is coming back', async () => {
    db.orderItem.findMany.mockResolvedValue([{ id: I1, quantity: 3, freeQuantity: 0 }]);
    const out = await (await POST(post({ orderId: ORDER, outcome: 'ALL' }))).json();
    expect(out.status).toBe('DELIVERED');
    expect(out.completion.halves.map((h: { key: string }) => h.key)).toEqual(['MONEY']);
  });

  it('a whole refusal has one half, and it is the goods', async () => {
    db.orderItem.findMany.mockResolvedValue([{ id: I1, quantity: 3, freeQuantity: 0 }]);
    const out = await (await POST(post({ orderId: ORDER, outcome: 'NONE' }))).json();
    expect(out.status).toBe('RETURNED');
    expect(out.completion.halves.map((h: { key: string }) => h.key)).toEqual(['GOODS']);
    expect(out.message).not.toContain('بانتظار');
  });
});
