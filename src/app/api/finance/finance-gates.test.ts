import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The money gates: no fund movement before settlement approval, no approval
 * over an unexplained gap, no closing approved by the person who recorded
 * it, and an unexplained difference blocks the next day.
 */

const { db, requireContext, requirePermission, logAudit, recordMovement, markPayableForOrders, receiptGap, blockingClosing, walletBalance } =
  vi.hoisted(() => ({
    db: {
      courierStatement: { findFirst: vi.fn(), update: vi.fn() },
      statementReceipt: { create: vi.fn(), aggregate: vi.fn() },
      wallet: { findFirst: vi.fn() },
      // Approving a statement now also closes the deliveries it reports.
      order: { updateMany: vi.fn(), findMany: vi.fn(), update: vi.fn() },
      orderActivity: { create: vi.fn() },
      orderItem: { findMany: vi.fn() },
      inventoryMovement: { findFirst: vi.fn(), create: vi.fn() },
      productionBatch: { findMany: vi.fn(), update: vi.fn() },
      dailyClosing: { findFirst: vi.fn(), findUnique: vi.fn(), upsert: vi.fn(), update: vi.fn() },
      walletMovement: { findFirst: vi.fn() },
      $transaction: vi.fn(async (fn: any) => fn(db)),
    },
    requireContext: vi.fn(),
    requirePermission: vi.fn(),
    logAudit: vi.fn(),
    recordMovement: vi.fn(),
    markPayableForOrders: vi.fn(),
    receiptGap: vi.fn(),
    blockingClosing: vi.fn(),
    walletBalance: vi.fn(),
  }));

vi.mock('@/lib/db', () => ({ db }));
vi.mock('@/lib/geo-context', () => ({ requireContext: (...a: unknown[]) => requireContext(...a) }));
vi.mock('@/lib/authorization', () => ({ requirePermission: (...a: unknown[]) => requirePermission(...a), can: () => true }));
vi.mock('@/lib/audit', () => ({ logAudit: (...a: unknown[]) => logAudit(...a) }));
vi.mock('@/lib/settlement', async (orig) => ({
  ...(await orig<typeof import('@/lib/settlement')>()),
  receiptGap: (...a: unknown[]) => receiptGap(...a),
}));
vi.mock('@/lib/wallets', async (orig) => ({
  ...(await orig<typeof import('@/lib/wallets')>()),
  recordMovement: (...a: unknown[]) => recordMovement(...a),
  blockingClosing: (...a: unknown[]) => blockingClosing(...a),
  walletBalance: (...a: unknown[]) => walletBalance(...a),
}));
vi.mock('@/lib/commission', async (orig) => ({
  ...(await orig<typeof import('@/lib/commission')>()),
  markPayableForOrders: (...a: unknown[]) => markPayableForOrders(...a),
}));

vi.mock('@/lib/stock-consumption', () => ({ consumeOrderStock: vi.fn().mockResolvedValue({ taken: 0, short: 0, alreadyDone: false }) }));

import { PATCH as approveStatement } from '@/app/api/finance/statements/[id]/route';
import { POST as recordClosing, PATCH as approveClosing } from '@/app/api/finance/closing/route';

const ID = '88888888-8888-4888-8888-888888888888';
const body = (b: unknown, method = 'PATCH') =>
  new Request('http://localhost/x', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
const CLOSING_ID = '99999999-9999-4999-8999-999999999999';
const params = { params: Promise.resolve({ id: ID }) };

beforeEach(() => {
  vi.clearAllMocks();
  // Nothing still in flight unless a test says so.
  db.order.findMany.mockResolvedValue([]);
  db.orderItem.findMany.mockResolvedValue([]);
  db.inventoryMovement.findFirst.mockResolvedValue(null);
  requireContext.mockResolvedValue({
    user: { id: 'u1', name: 'Accountant', role: 'ACCOUNTANT', status: 'ACTIVE' },
    companyId: 'c1', storeId: 's1',
    country: { minorUnit: 3, currencyCode: 'JOD' },
  });
  requirePermission.mockResolvedValue({});
  db.courierStatement.update.mockResolvedValue({ id: ID, status: 'APPROVED' });
  db.order.updateMany.mockResolvedValue({ count: 0 });
  markPayableForOrders.mockResolvedValue(0);
});

describe('statement approval', () => {
  const statement = (over: Record<string, unknown> = {}) => ({
    id: ID, status: 'MATCHED', reference: 'ST-1', gapExplanation: null,
    receipts: [{ id: 'r1', walletId: 'w1', amount: 90 }],
    matches: [{ orderId: 'o1', result: 'MATCHED' }],
    ...over,
  });

  it('refuses a statement with no receipts — nothing arrived yet', async () => {
    db.courierStatement.findFirst.mockResolvedValue(statement({ receipts: [] }));
    const res = await approveStatement(body({ approve: true }), params);
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('NO_RECEIPTS');
    expect(recordMovement).not.toHaveBeenCalled();
  });

  it('refuses to approve an unexplained gap', async () => {
    db.courierStatement.findFirst.mockResolvedValue(statement());
    receiptGap.mockResolvedValue({ claimed: 100, received: 90, gap: -10, needsExplanation: true, explained: false });

    const res = await approveStatement(body({ approve: true }), params);
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('GAP_REQUIRES_EXPLANATION');
    expect(recordMovement).not.toHaveBeenCalled();
  });

  it('refuses to approve before matching has run', async () => {
    db.courierStatement.findFirst.mockResolvedValue(statement({ matches: [] }));
    receiptGap.mockResolvedValue({ claimed: 100, received: 100, gap: 0, needsExplanation: false, explained: false });

    const res = await approveStatement(body({ approve: true }), params);
    expect((await res.json()).code).toBe('MATCHING_REQUIRED');
  });

  it('moves the money and makes commission payable only on approval', async () => {
    db.courierStatement.findFirst.mockResolvedValue(statement());
    receiptGap.mockResolvedValue({ claimed: 90, received: 90, gap: 0, needsExplanation: false, explained: false });

    const res = await approveStatement(body({ approve: true }), params);
    expect(res.status).toBe(200);
    expect(recordMovement).toHaveBeenCalledTimes(1);
    expect(recordMovement.mock.calls[0][1]).toMatchObject({ direction: 'IN', amount: 90, category: 'COURIER_SETTLEMENT' });
    expect(markPayableForOrders).toHaveBeenCalledWith(expect.anything(), 'c1', ['o1']);
  });

  it('never approves twice', async () => {
    db.courierStatement.findFirst.mockResolvedValue(statement({ status: 'APPROVED' }));
    expect((await approveStatement(body({ approve: true }), params)).status).toBe(409);
  });
});

describe('daily closing', () => {
  beforeEach(() => {
    db.wallet.findFirst.mockResolvedValue({ id: 'w1', name: 'الصندوق', isActive: true, country: { minorUnit: 3 } });
    walletBalance.mockResolvedValue({ balance: 100 });
    blockingClosing.mockResolvedValue(null);
    db.dailyClosing.findUnique.mockResolvedValue(null);
    db.dailyClosing.upsert.mockImplementation(async ({ create }: any) => ({ id: 'cl1', ...create }));
  });

  it('refuses a non-zero difference with no explanation', async () => {
    const res = await recordClosing(
      body({ walletId: ID, date: '2026-09-20', actualBalance: 95 }, 'POST')
    );
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('EXPLANATION_REQUIRED');
    expect(db.dailyClosing.upsert).not.toHaveBeenCalled();
  });

  it('blocks the day after an unexplained difference', async () => {
    blockingClosing.mockResolvedValue({ id: 'cl0', date: new Date('2026-09-19'), difference: -5 });
    const res = await recordClosing(body({ walletId: ID, date: '2026-09-20', actualBalance: 100 }, 'POST'));
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('PREVIOUS_CLOSING_UNEXPLAINED');
  });

  it('accepts a matching count', async () => {
    const res = await recordClosing(body({ walletId: ID, date: '2026-09-20', actualBalance: 100 }, 'POST'));
    expect(res.status).toBe(201);
    expect(db.dailyClosing.upsert.mock.calls[0][0].create).toMatchObject({ difference: 0, bookBalance: 100 });
  });

  it('refuses approval by the person who recorded it', async () => {
    db.dailyClosing.findFirst.mockResolvedValue({
      id: CLOSING_ID, walletId: 'w1', date: new Date('2026-09-20'), difference: 0, status: 'OPEN',
      recordedById: 'u1', explanation: null, wallet: { id: 'w1', name: 'الصندوق' },
    });
    db.walletMovement.findFirst.mockResolvedValue(null);

    const res = await approveClosing(body({ closingId: CLOSING_ID }));
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe('SEGREGATION_OF_DUTIES');
  });

  it('refuses approval by someone who recorded that wallet’s movements that day', async () => {
    db.dailyClosing.findFirst.mockResolvedValue({
      id: CLOSING_ID, walletId: 'w1', date: new Date('2026-09-20'), difference: 0, status: 'OPEN',
      recordedById: 'someone-else', explanation: null, wallet: { id: 'w1', name: 'الصندوق' },
    });
    db.walletMovement.findFirst.mockResolvedValue({ id: 'm1' });

    expect((await approveClosing(body({ closingId: CLOSING_ID }))).status).toBe(403);
  });

  it('approves when a different person signs it off', async () => {
    db.dailyClosing.findFirst.mockResolvedValue({
      id: CLOSING_ID, walletId: 'w1', date: new Date('2026-09-20'), difference: 0, status: 'OPEN',
      recordedById: 'someone-else', explanation: null, wallet: { id: 'w1', name: 'الصندوق' },
    });
    db.walletMovement.findFirst.mockResolvedValue(null);
    db.dailyClosing.update.mockResolvedValue({ id: 'cl1', status: 'APPROVED' });

    const res = await approveClosing(body({ closingId: CLOSING_ID }));
    expect(res.status).toBe(200);
  });
});

describe('the statement is the delivery proof', () => {
  // The courier has told us in writing that they delivered this parcel and
  // collected this amount. Reading that and then asking somebody to tick
  // "delivered" by hand is the same fact entered twice — and every order
  // nobody got round to ticking sat in the tracking list forever, long
  // after the money had arrived.
  const ID2 = '11111111-1111-4111-8111-111111111111';
  const approveWith = async (matches: unknown[], inFlight: unknown[]) => {
    db.courierStatement.findFirst.mockResolvedValue({
      id: ID2,
      status: 'MATCHED',
      reference: 'ST-1',
      gapExplanation: null,
      periodTo: new Date('2026-09-20T00:00:00.000Z'),
      // A statement cannot be approved with no receipt at all.
      receipts: [{ id: 'r1', walletId: 'w1', amount: 50.01 }],
      matches,
    });
    db.courierStatement.update.mockResolvedValue({ id: ID2 });
    db.order.findMany.mockResolvedValue(inFlight);
    receiptGap.mockResolvedValue({ claimed: 0, received: 0, gap: 0, needsExplanation: false, explained: false });
    return approveStatement(
      new Request('http://localhost/x', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approve: true }),
      }),
      { params: Promise.resolve({ id: ID2 }) }
    );
  };

  it('closes a matched order that is still in flight', async () => {
    const res = await approveWith(
      [{ orderId: 'o1', result: 'MATCHED', statementAmount: 50.01 }],
      [{ id: 'o1', orderNumber: 'SY-1' }]
    );
    expect(res.status).toBe(200);
    const written = db.order.update.mock.calls[0][0].data;
    expect(written.shippingStatus).toBe('DELIVERED');
    expect(written.collectedAmount).toBe(50.01);
    // The courier's period end, not the moment somebody uploaded a file.
    expect(written.deliveredAt).toEqual(new Date('2026-09-20T00:00:00.000Z'));
  });

  it('leaves an order that was already delivered by hand alone', async () => {
    // Whoever stood there and recorded it knew more than a spreadsheet.
    await approveWith([{ orderId: 'o1', result: 'MATCHED', statementAmount: 50 }], []);
    expect(db.order.update).not.toHaveBeenCalled();
  });

  it('does not close an order the statement did not match', async () => {
    await approveWith([{ orderId: 'o1', result: 'MISMATCHED', statementAmount: 10 }], []);
    expect(db.order.findMany.mock.calls[0][0].where.id).toEqual({ in: [] });
  });

  it('only ever touches orders still in flight', async () => {
    await approveWith([{ orderId: 'o1', result: 'MATCHED', statementAmount: 50 }], []);
    expect(db.order.findMany.mock.calls[0][0].where.shippingStatus).toEqual({
      in: ['SHIPPED', 'OUT_FOR_DELIVERY', 'READY_FOR_PICKUP'],
    });
  });
});
