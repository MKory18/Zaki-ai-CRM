import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Settling a مندوب — or any courier with no API — by hand.
 *
 * It is the same gate as approving a statement, reached by a different road:
 * the wallet movement is written here and nowhere earlier, the amount is the
 * NET after the courier's fee, and nothing is settled twice.
 */

const { db, requireContext, requirePermission, logAudit, recordMovement, markPayableForOrders } = vi.hoisted(() => ({
  db: {
    wallet: { findFirst: vi.fn() },
    order: { findMany: vi.fn(), updateMany: vi.fn() },
    orderActivity: { create: vi.fn() },
    $transaction: vi.fn(async (fn: any) => fn(db)),
  },
  requireContext: vi.fn(),
  requirePermission: vi.fn(),
  logAudit: vi.fn(),
  recordMovement: vi.fn(),
  markPayableForOrders: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ db }));
vi.mock('@/lib/geo-context', () => ({ requireContext: (...a: unknown[]) => requireContext(...a) }));
vi.mock('@/lib/authorization', () => ({ requirePermission: (...a: unknown[]) => requirePermission(...a), can: () => true }));
vi.mock('@/lib/audit', () => ({ logAudit: (...a: unknown[]) => logAudit(...a) }));
vi.mock('@/lib/wallets', async (orig) => ({
  ...(await orig<typeof import('@/lib/wallets')>()),
  recordMovement: (...a: unknown[]) => recordMovement(...a),
}));
vi.mock('@/lib/commission', async (orig) => ({
  ...(await orig<typeof import('@/lib/commission')>()),
  markPayableForOrders: (...a: unknown[]) => markPayableForOrders(...a),
}));

import { POST } from './route';

const ORDER_A = '11111111-1111-4111-8111-111111111111';
const ORDER_B = '22222222-2222-4222-8222-222222222222';
const WALLET = '33333333-3333-4333-8333-333333333333';

const post = (body: unknown) =>
  new Request('http://localhost/x', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

const order = (over: Record<string, unknown> = {}) => ({
  id: ORDER_A, orderNumber: 'SY-2026-0001', currency: 'USD',
  shippingStatus: 'DELIVERED', settlementStatus: 'PENDING_COLLECTION',
  totalAmount: 20, deliveryFee: 3,
  deliveryProvider: { id: 'p1', name: 'أبو علي', kind: 'AGENT' },
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  requireContext.mockResolvedValue({
    user: { id: 'u1', name: 'محاسب' },
    companyId: 'c1', storeId: 's1',
    country: { minorUnit: 2, currencyCode: 'USD' },
  });
  requirePermission.mockResolvedValue({});
  db.wallet.findFirst.mockResolvedValue({ id: WALLET, name: 'صندوق سوريا', currencyCode: 'USD' });
  db.order.updateMany.mockResolvedValue({ count: 1 });
  db.orderActivity.create.mockResolvedValue({});
  recordMovement.mockResolvedValue({ id: 'm1' });
  markPayableForOrders.mockResolvedValue(0);
});

describe('what it collects', () => {
  it('takes the NET — the courier keeps their fee', async () => {
    db.order.findMany.mockResolvedValue([order(), order({ id: ORDER_B, orderNumber: 'SY-2026-0002', totalAmount: 15, deliveryFee: 4 })]);

    const res = await POST(post({ orderIds: [ORDER_A, ORDER_B], walletId: WALLET, note: 'استلمت منه نقداً' }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.expected).toBe(28); // (20-3) + (15-4)
    expect(recordMovement.mock.calls[0][1]).toMatchObject({ direction: 'IN', amount: 28, category: 'COURIER_SETTLEMENT' });
  });

  it('reports the shortfall when less was handed over than expected', async () => {
    db.order.findMany.mockResolvedValue([order()]);

    const res = await POST(post({ orderIds: [ORDER_A], walletId: WALLET, amount: 15, note: 'نقص معه' }));
    const body = await res.json();

    expect(body).toMatchObject({ expected: 17, amount: 15, difference: -2 });
    expect(body.message).toContain('بفارق');
  });

  it('makes commission payable and marks the orders settled, in the same transaction', async () => {
    db.order.findMany.mockResolvedValue([order()]);

    await POST(post({ orderIds: [ORDER_A], walletId: WALLET, note: 'استلمت منه' }));

    expect(db.order.updateMany.mock.calls[0][0].data).toMatchObject({ settlementStatus: 'SETTLED' });
    expect(markPayableForOrders).toHaveBeenCalledWith(expect.anything(), 'c1', [ORDER_A]);
  });
});

describe('what it refuses', () => {
  it('refuses an order that is already settled', async () => {
    db.order.findMany.mockResolvedValue([order({ settlementStatus: 'SETTLED' })]);

    const res = await POST(post({ orderIds: [ORDER_A], walletId: WALLET, note: 'مرة ثانية' }));
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('ALREADY_SETTLED');
    expect(recordMovement).not.toHaveBeenCalled();
  });

  it('refuses an order that was never delivered — nothing was collected', async () => {
    db.order.findMany.mockResolvedValue([order({ shippingStatus: 'SHIPPED' })]);

    const res = await POST(post({ orderIds: [ORDER_A], walletId: WALLET, note: 'استلمت منه' }));
    expect((await res.json()).code).toBe('NOT_DELIVERED');
    expect(recordMovement).not.toHaveBeenCalled();
  });

  it('ACCEPTS a partially delivered order — the customer paid at the door', async () => {
    // The refusal here was money with nowhere to go. The customer took some
    // lines and paid for them, `collectedAmount` holds the figure, and the
    // agent-custody report already counts it among what the courier is
    // holding — but this is the only endpoint that takes cash in, and it
    // turned the order away. The debt sat in his owing list with no way to
    // clear it.
    db.order.findMany.mockResolvedValue([order({ shippingStatus: 'PARTIALLY_DELIVERED' })]);

    const res = await POST(post({ orderIds: [ORDER_A], walletId: WALLET, note: 'استلمت منه' }));
    expect(res.status).toBe(200);
    expect(recordMovement).toHaveBeenCalled();
  });

  it('expects what the customer PAID on a partial, not the order’s full value', async () => {
    // Otherwise every partial reads as the courier coming up short, and the
    // screen accuses him of a shortfall that exists only in the arithmetic.
    db.order.findMany.mockResolvedValue([
      order({ shippingStatus: 'PARTIALLY_DELIVERED', totalAmount: 100, collectedAmount: 60, deliveryFee: 5 }),
    ]);

    const res = await POST(post({ orderIds: [ORDER_A], walletId: WALLET, note: 'استلمت منه' }));
    const body = await res.json();
    // 60 taken at the door, less his 5 fee.
    expect(body.expected ?? body.amount).toBe(55);
    expect(body.difference).toBe(0);
  });

  it('refuses a returned order, which owes nothing', async () => {
    db.order.findMany.mockResolvedValue([order({ shippingStatus: 'RETURNED' })]);
    expect((await POST(post({ orderIds: [ORDER_A], walletId: WALLET, note: 'استلمت منه' }))).status).toBe(409);
  });

  it('refuses a wallet in the wrong currency rather than guessing a rate', async () => {
    db.order.findMany.mockResolvedValue([order()]);
    db.wallet.findFirst.mockResolvedValue({ id: WALLET, name: 'صندوق الأردن', currencyCode: 'JOD' });

    const res = await POST(post({ orderIds: [ORDER_A], walletId: WALLET, note: 'استلمت منه' }));
    expect((await res.json()).code).toBe('WALLET_CURRENCY_MISMATCH');
  });

  it('refuses a mixed-currency batch', async () => {
    db.order.findMany.mockResolvedValue([order(), order({ id: ORDER_B, currency: 'JOD' })]);

    const res = await POST(post({ orderIds: [ORDER_A, ORDER_B], walletId: WALLET, note: 'استلمت منه' }));
    expect((await res.json()).code).toBe('MIXED_CURRENCY');
  });

  it('insists on a note — a hand-settled payment with no words is unauditable', async () => {
    db.order.findMany.mockResolvedValue([order()]);
    expect((await POST(post({ orderIds: [ORDER_A], walletId: WALLET }))).status).toBe(400);
    expect((await POST(post({ orderIds: [ORDER_A], walletId: WALLET, note: 'x' }))).status).toBe(400);
  });
});
