import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Stock has two doors, and which one a product uses is a property of the
 * product, not a choice made at the keyboard.
 *
 * There used to be three. The loosest of them took a signed quantity and a
 * movement type of the caller's choosing, and added units at a cost of zero
 * — which drags the weighted average down, so every order costed afterwards
 * reports a profit that was never made. That door is gone; these hold the
 * remaining two shut against the wrong product.
 */

const { db, requireCompanyTenant, requirePermission, logAudit, receiveStock, drawDownStock, onHandTotal } =
  vi.hoisted(() => ({
    db: {
      product: { findFirst: vi.fn() },
      productionBatch: { findFirst: vi.fn() },
      inventoryMovement: { create: vi.fn() },
      $transaction: vi.fn(),
    },
    requireCompanyTenant: vi.fn(),
    requirePermission: vi.fn(),
    logAudit: vi.fn(),
    receiveStock: vi.fn(),
    drawDownStock: vi.fn(),
    onHandTotal: vi.fn(),
  }));

vi.mock('@/lib/db', () => ({ db }));
vi.mock('@/lib/auth', () => ({ requireCompanyTenant: (...a: unknown[]) => requireCompanyTenant(...a) }));
vi.mock('@/lib/authorization', () => ({ requirePermission: (...a: unknown[]) => requirePermission(...a) }));
vi.mock('@/lib/audit', () => ({ logAudit: (...a: unknown[]) => logAudit(...a) }));
vi.mock('@/lib/receiving', () => ({
  receiveStock: (...a: unknown[]) => receiveStock(...a),
  drawDownStock: (...a: unknown[]) => drawDownStock(...a),
  onHandTotal: (...a: unknown[]) => onHandTotal(...a),
}));

import { POST } from './route';

const post = (b: unknown) =>
  POST(new Request('http://localhost/api/inventory', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(b),
  }));

const PRODUCT_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

beforeEach(() => {
  vi.clearAllMocks();
  requireCompanyTenant.mockResolvedValue({ user: { id: 'u1' }, companyId: 'c1' });
  requirePermission.mockResolvedValue({});
  db.$transaction.mockImplementation(async (fn: any) => fn(db));
  db.inventoryMovement.create.mockImplementation(async ({ data }: any) => data);
  db.productionBatch.findFirst.mockResolvedValue({ costPerUnit: 6 });
  receiveStock.mockResolvedValue({ batch: { batchNumber: 'RCV-1' }, movement: {}, balanceAfter: 10 });
  onHandTotal.mockResolvedValue(10);
});

describe('receiving', () => {
  it('refuses a product that is made, and says where it belongs', async () => {
    db.product.findFirst.mockResolvedValue({ id: PRODUCT_ID, name: 'كريم', sourceType: 'MANUFACTURED' });
    const res = await post({ action: 'receive', productId: PRODUCT_ID, quantity: 10, unitCost: 3 });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe('WRONG_DOOR');
    expect(body.error).toContain('تشغيلات الإنتاج');
    expect(receiveStock).not.toHaveBeenCalled();
  });

  it('accepts a bought product at the cost it was bought for', async () => {
    db.product.findFirst.mockResolvedValue({ id: PRODUCT_ID, name: 'طاقية', sourceType: 'PURCHASED' });
    const res = await post({ action: 'receive', productId: PRODUCT_ID, quantity: 40, unitCost: 2.5 });
    expect(res.status).toBe(200);
    expect(receiveStock.mock.calls[0][1]).toMatchObject({ quantity: 40, unitCost: 2.5 });
  });

  it('refuses a receipt of nothing', async () => {
    db.product.findFirst.mockResolvedValue({ id: PRODUCT_ID, name: 'طاقية', sourceType: 'PURCHASED' });
    expect((await post({ action: 'receive', productId: PRODUCT_ID, quantity: 0 })).status).toBe(400);
  });

  it('refuses a movement type of the caller’s choosing — there is no such field', async () => {
    db.product.findFirst.mockResolvedValue({ id: PRODUCT_ID, name: 'طاقية', sourceType: 'PURCHASED' });
    // The old shape: a signed quantity and a type. It must not parse at all.
    expect((await post({ productId: PRODUCT_ID, quantity: 500, type: 'PRODUCTION' })).status).toBe(400);
  });
});

describe('a stock count', () => {
  beforeEach(() => {
    db.product.findFirst.mockResolvedValue({ id: PRODUCT_ID, name: 'كريم', sourceType: 'MANUFACTURED' });
  });

  it('takes what was counted and derives the difference itself', async () => {
    onHandTotal.mockResolvedValue(500);
    const res = await post({ action: 'recount', productId: PRODUCT_ID, countedQuantity: 480, reason: 'جرد الشهر' });
    expect(res.status).toBe(200);
    expect((await res.json()).difference).toBe(-20);
    expect(drawDownStock.mock.calls[0][1]).toMatchObject({ quantity: 20, allowNegative: false });
  });

  it('brings a surplus in at the cost of the stock already there, never at zero', async () => {
    // Units at zero cost lower the average and overstate every later profit.
    onHandTotal.mockResolvedValue(100);
    await post({ action: 'recount', productId: PRODUCT_ID, countedQuantity: 105, reason: 'وُجدت في المستودع' });
    expect(receiveStock.mock.calls[0][1]).toMatchObject({ quantity: 5, unitCost: 6 });
  });

  it('writes nothing when the count agrees', async () => {
    onHandTotal.mockResolvedValue(500);
    const res = await post({ action: 'recount', productId: PRODUCT_ID, countedQuantity: 500, reason: 'جرد' });
    expect((await res.json()).difference).toBe(0);
    expect(drawDownStock).not.toHaveBeenCalled();
    expect(receiveStock).not.toHaveBeenCalled();
  });

  it('demands a reason, because an unexplained correction is a missing story', async () => {
    expect((await post({ action: 'recount', productId: PRODUCT_ID, countedQuantity: 10, reason: '' })).status).toBe(400);
    expect((await post({ action: 'recount', productId: PRODUCT_ID, countedQuantity: 10 })).status).toBe(400);
  });

  it('records what was counted and what the system held, not just the delta', async () => {
    onHandTotal.mockResolvedValue(500);
    await post({ action: 'recount', productId: PRODUCT_ID, countedQuantity: 480, reason: 'تالف' });
    expect(db.inventoryMovement.create.mock.calls[0][0].data.reason).toContain('480');
    expect(db.inventoryMovement.create.mock.calls[0][0].data.reason).toContain('500');
  });

  it('counts a product of another company as missing', async () => {
    db.product.findFirst.mockResolvedValue(null);
    expect((await post({ action: 'recount', productId: PRODUCT_ID, countedQuantity: 1, reason: 'جرد' })).status).toBe(404);
  });
});
