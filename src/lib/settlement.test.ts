import { beforeEach, describe, expect, it, vi } from 'vitest';

/** Statement parsing, the file hash, matching keys and the receipt gap. */

const { db } = vi.hoisted(() => ({
  db: {
    statementLine: { findMany: vi.fn() },
    courierStatement: { findFirst: vi.fn(), findUnique: vi.fn() },
    settlementMatch: { deleteMany: vi.fn(), create: vi.fn() },
    order: { findFirst: vi.fn(), findMany: vi.fn() },
    statementReceipt: { aggregate: vi.fn() },
  },
}));
vi.mock('./db', () => ({ db }));

import { expectedAmountFor, fileHash, parseStatementCsv, receiptGap, runMatching } from './settlement';

beforeEach(() => {
  vi.clearAllMocks();
  db.settlementMatch.create.mockResolvedValue({});
  db.settlementMatch.deleteMany.mockResolvedValue({ count: 0 });
  db.order.findMany.mockResolvedValue([]);
  db.courierStatement.findFirst.mockResolvedValue({ id: 'st1', deliveryProviderId: 'dp1', periodFrom: null, periodTo: null });
});

describe('file hash', () => {
  it('is stable for identical content and different for a changed file', () => {
    expect(fileHash('a,b\n1,2')).toBe(fileHash('a,b\n1,2'));
    expect(fileHash('a,b\n1,2')).not.toBe(fileHash('a,b\n1,3'));
  });
});

describe('parseStatementCsv', () => {
  it('reads merchant reference, barcode, amount and status', () => {
    const { rows, total } = parseStatementCsv(
      'merchant_ref,barcode,amount,status\nORD-1,BC1,12.5,delivered\nORD-2,BC2,7.5,delivered'
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ merchantRef: 'ORD-1', barcode: 'BC1', amount: 12.5, status: 'delivered' });
    expect(total).toBe(20);
  });

  it('accepts Arabic headers and semicolons', () => {
    const { rows } = parseStatementCsv('المرجع;المبلغ\nORD-9;30');
    expect(rows[0]).toMatchObject({ merchantRef: 'ORD-9', amount: 30 });
  });

  it('refuses a file with no amount column', () => {
    expect(parseStatementCsv('merchant_ref,status\nORD-1,delivered').error).toContain('عمود للمبلغ');
  });

  it('refuses a file with neither reference nor barcode — nothing to match on', () => {
    expect(parseStatementCsv('amount,status\n10,delivered').error).toContain('المطابقة');
  });
});

describe('expected amount', () => {
  it('is the collected amount once a partial delivery recorded one', () => {
    expect(expectedAmountFor({ shippingStatus: 'DELIVERED', totalAmount: 100, collectedAmount: 60 })).toBe(60);
  });

  it('is zero for a returned order', () => {
    expect(expectedAmountFor({ shippingStatus: 'RETURNED', totalAmount: 100 })).toBe(0);
  });

  it('is the order total otherwise', () => {
    expect(expectedAmountFor({ shippingStatus: 'DELIVERED', totalAmount: 100 })).toBe(100);
  });
});

describe('runMatching', () => {
  const scope = { companyId: 'c1', storeId: 's1', statementId: 'st1', minorUnit: 3 };

  it('matches on the merchant reference first', async () => {
    db.statementLine.findMany.mockResolvedValue([{ id: 'l1', merchantRef: 'ORD-1', barcode: 'BC1', amount: 12 }]);
    db.order.findFirst.mockResolvedValue({ id: 'o1', shippingStatus: 'DELIVERED', totalAmount: 12 });

    const outcome = await runMatching(db as never, scope);
    expect(outcome.matched).toBe(1);
    expect(db.order.findFirst.mock.calls[0][0].where).toMatchObject({ merchantRef: 'ORD-1' });
    expect(db.settlementMatch.create.mock.calls[0][0].data).toMatchObject({ result: 'MATCHED', matchedBy: 'MERCHANT_REF' });
  });

  it('never falls back to the phone', async () => {
    db.statementLine.findMany.mockResolvedValue([{ id: 'l1', merchantRef: 'ORD-X', barcode: 'BC-X', amount: 5 }]);
    db.order.findFirst.mockResolvedValue(null);

    const outcome = await runMatching(db as never, scope);
    expect(outcome.missingInSystem).toBe(1);
    for (const call of db.order.findFirst.mock.calls) {
      expect(JSON.stringify(call[0].where)).not.toContain('phone');
      expect(JSON.stringify(call[0].where)).not.toContain('customer');
    }
  });

  it('flags a difference as mismatched with the exact gap', async () => {
    db.statementLine.findMany.mockResolvedValue([{ id: 'l1', merchantRef: 'ORD-1', barcode: null, amount: 10 }]);
    db.order.findFirst.mockResolvedValue({ id: 'o1', shippingStatus: 'DELIVERED', totalAmount: 12 });

    const outcome = await runMatching(db as never, scope);
    expect(outcome.mismatched).toBe(1);
    expect(db.settlementMatch.create.mock.calls[0][0].data).toMatchObject({
      result: 'MISMATCHED', expectedAmount: 12, statementAmount: 10, difference: -2,
    });
  });

  it('raises no exception for a partial delivery that matches the post-event amount', async () => {
    db.statementLine.findMany.mockResolvedValue([{ id: 'l1', merchantRef: 'ORD-1', barcode: null, amount: 60 }]);
    db.order.findFirst.mockResolvedValue({ id: 'o1', shippingStatus: 'DELIVERED', totalAmount: 100, collectedAmount: 60 });

    const outcome = await runMatching(db as never, scope);
    expect(outcome.matched).toBe(1);
    expect(outcome.mismatched).toBe(0);
  });

  it('lists a delivered order the courier never mentioned', async () => {
    db.statementLine.findMany.mockResolvedValue([]);
    db.order.findMany.mockResolvedValue([{ id: 'o9', shippingStatus: 'DELIVERED', totalAmount: 20 }]);

    const outcome = await runMatching(db as never, scope);
    expect(outcome.missingInStatement).toBe(1);
    expect(db.settlementMatch.create.mock.calls[0][0].data).toMatchObject({ result: 'MISSING_IN_STATEMENT', orderId: 'o9' });
  });
});

describe('receiptGap', () => {
  it('reports the gap between what was claimed and what arrived', async () => {
    db.courierStatement.findUnique.mockResolvedValue({ totalAmount: 100, gapExplanation: null });
    db.statementReceipt.aggregate.mockResolvedValue({ _sum: { amount: 90 } });

    const gap = await receiptGap(db as never, 'st1', 3);
    expect(gap).toMatchObject({ claimed: 100, received: 90, gap: -10, needsExplanation: true, explained: false });
  });

  it('needs no explanation when the receipts add up exactly', async () => {
    db.courierStatement.findUnique.mockResolvedValue({ totalAmount: 100, gapExplanation: null });
    db.statementReceipt.aggregate.mockResolvedValue({ _sum: { amount: 100 } });

    expect((await receiptGap(db as never, 'st1', 3)).needsExplanation).toBe(false);
  });
});
