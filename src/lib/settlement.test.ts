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

import { expectedAmountFor, fileHash, parseStatement, parseStatementRows, refFromNotes, receiptGap, runMatching } from './settlement';

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
    const { rows, total } = parseStatement(
      'merchant_ref,barcode,amount,status\nORD-1,BC1,12.5,delivered\nORD-2,BC2,7.5,delivered'
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ merchantRef: 'ORD-1', barcode: 'BC1', amount: 12.5, status: 'delivered' });
    expect(total).toBe(20);
  });

  it('accepts Arabic headers and semicolons', () => {
    const { rows } = parseStatement('المرجع;المبلغ\nORD-9;30');
    expect(rows[0]).toMatchObject({ merchantRef: 'ORD-9', amount: 30 });
  });

  it('refuses a file with no amount column', () => {
    expect(parseStatement('merchant_ref,status\nORD-1,delivered').error).toContain('عمود للمبلغ');
  });

  it('refuses a file with neither reference nor barcode — nothing to match on', () => {
    expect(parseStatement('amount,status\n10,delivered').error).toContain('المطابقة');
  });
});

describe('a real courier statement, as the courier writes it', () => {
  // The shape of the file the user actually receives: Arabic headers, three
  // money columns, and the merchant's order number buried at the start of
  // the notes because the courier has no reference column.
  const HEADER = [
    'باركود الشحنة', 'الكمية', 'باركود كشف التحصيل', 'اسم المستلم',
    'الملاحظات', 'التحصيل', 'السعر', 'الصافي', 'الحالة',
  ];
  const rowsIn = [
    ['100522160432', '1.0', '7446091600029', 'محمد', '15133 ', '12.0', '3.0', '9.0', 'تم توصيلها'],
    ['100522160425', '1.0', '7446091600029', 'هاشم', '15132 - العميل طلب التأجيل', '20.0', '3.0', '17.0', 'تم توصيلها'],
    ['100522159603', '1.0', '7446091600029', 'فائز', '15055 - تم الرفض قبل الوصول', '0.0', '0.0', '0.0', 'تم إرجاعها'],
    ['', '', '', '', '', '', '', '', ''],
  ];

  it('stores the NET as the amount — that is what the courier hands over', () => {
    const { rows, total } = parseStatementRows(HEADER, rowsIn);
    expect(rows).toHaveLength(3); // the blank row is dropped
    expect(rows[0]).toMatchObject({ amount: 9, collected: 12, fee: 3 });
    expect(total).toBe(26); // 9 + 17 + 0
  });

  it('reads the merchant reference out of the notes', () => {
    const { rows } = parseStatementRows(HEADER, rowsIn);
    expect(rows.map((r) => r.merchantRef)).toEqual(['15133', '15132', '15055']);
  });

  it('keeps the courier barcode as the second matching key', () => {
    const { rows } = parseStatementRows(HEADER, rowsIn);
    expect(rows[0].barcode).toBe('100522160432');
  });

  it('carries a returned line through at zero rather than dropping it', () => {
    const { rows } = parseStatementRows(HEADER, rowsIn);
    const returned = rows.find((r) => r.status?.includes('إرجاع'));
    expect(returned).toMatchObject({ amount: 0, merchantRef: '15055' });
  });

  it('derives the net when the file states only the COD and the fee', () => {
    const header = ['المرجع', 'التحصيل', 'السعر'];
    const { rows } = parseStatementRows(header, [['ORD-1', '20', '3']]);
    expect(rows[0]).toMatchObject({ amount: 17, collected: 20, fee: 3 });
  });

  it('falls back to the COD when there is no fee column at all', () => {
    const { rows } = parseStatementRows(['المرجع', 'المبلغ'], [['ORD-1', '20']]);
    expect(rows[0].amount).toBe(20);
  });
});

describe('refFromNotes', () => {
  it('takes the reference written before the free text', () => {
    expect(refFromNotes('15132 - بردلي خبر بس يخلص شغل')).toBe('15132');
    expect(refFromNotes('  ORD-2026-0007 ملاحظة')).toBe('ORD-2026-0007');
  });

  it('returns null when the note is only prose', () => {
    expect(refFromNotes('تم الرفض قبل الوصول')).toBeNull();
    expect(refFromNotes('')).toBeNull();
    expect(refFromNotes(null)).toBeNull();
  });
});

describe('expected amount', () => {
  it('is the collected amount once a partial delivery recorded one', () => {
    expect(expectedAmountFor({ shippingStatus: 'DELIVERED', totalAmount: 100, collectedAmount: 60 })).toBe(60);
  });

  it('is zero for a returned order', () => {
    expect(expectedAmountFor({ shippingStatus: 'RETURNED', totalAmount: 100 })).toBe(0);
  });

  it('subtracts the courier fee — a statement states what they hand over', () => {
    expect(expectedAmountFor({ shippingStatus: 'DELIVERED', totalAmount: 20, deliveryFee: 3 })).toBe(17);
  });

  it('is the order total otherwise', () => {
    expect(expectedAmountFor({ shippingStatus: 'DELIVERED', totalAmount: 100 })).toBe(100);
  });
});

describe('runMatching', () => {
  const scope = { companyId: 'c1', storeId: 's1', statementId: 'st1', minorUnit: 3 };

  it('matches on the courier BARCODE first — it is their identifier for the parcel', async () => {
    db.statementLine.findMany.mockResolvedValue([{ id: 'l1', merchantRef: 'ORD-1', barcode: 'BC1', amount: 12 }]);
    db.order.findFirst.mockResolvedValue({ id: 'o1', shippingStatus: 'DELIVERED', totalAmount: 12 });

    const outcome = await runMatching(db as never, scope);
    expect(outcome.matched).toBe(1);
    // The barcode is tried before the merchant reference, and it is what the
    // courier assigns when the parcel is handed over.
    expect(db.order.findFirst.mock.calls[0][0].where).toMatchObject({ trackingNumber: 'BC1' });
    expect(db.settlementMatch.create.mock.calls[0][0].data).toMatchObject({ result: 'MATCHED', matchedBy: 'BARCODE' });
  });

  it('falls back to our merchant reference when the barcode finds nothing', async () => {
    db.statementLine.findMany.mockResolvedValue([{ id: 'l1', merchantRef: 'ORD-1', barcode: 'BC-UNKNOWN', amount: 12 }]);
    db.order.findFirst
      .mockResolvedValueOnce(null) // by barcode
      .mockResolvedValueOnce({ id: 'o1', shippingStatus: 'DELIVERED', totalAmount: 12 }); // by reference

    const outcome = await runMatching(db as never, scope);
    expect(outcome.matched).toBe(1);
    expect(db.order.findFirst.mock.calls[1][0].where).toMatchObject({ merchantRef: 'ORD-1' });
    expect(db.settlementMatch.create.mock.calls[0][0].data).toMatchObject({ matchedBy: 'MERCHANT_REF' });
  });

  it('matches a line that carries only a barcode — a مندوب or an API courier leaves no reference', async () => {
    db.statementLine.findMany.mockResolvedValue([{ id: 'l1', merchantRef: null, barcode: 'BC1', amount: 12 }]);
    db.order.findFirst.mockResolvedValue({ id: 'o1', shippingStatus: 'DELIVERED', totalAmount: 12 });

    const outcome = await runMatching(db as never, scope);
    expect(outcome.matched).toBe(1);
    expect(db.settlementMatch.create.mock.calls[0][0].data).toMatchObject({ matchedBy: 'BARCODE' });
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

describe('the delivery fee is matched too', () => {
  const scope = { companyId: 'c1', storeId: 's1', statementId: 'st1', minorUnit: 3 };

  it('flags a fee higher than agreed even when the net still adds up', async () => {
    // The courier collected 2 more AND charged 2 more, so the net is exactly
    // what we expected — and our revenue is quietly 2 lower.
    db.statementLine.findMany.mockResolvedValue([
      { id: 'l1', merchantRef: null, barcode: 'BC1', amount: 17, collected: 22, fee: 5 },
    ]);
    db.order.findFirst.mockResolvedValue({ id: 'o1', shippingStatus: 'DELIVERED', totalAmount: 20, deliveryFee: 3 });

    const outcome = await runMatching(db as never, scope);
    expect(outcome.matched).toBe(0);
    expect(outcome.mismatched).toBe(1);
    expect(outcome.feeMismatched).toBe(1);

    const data = db.settlementMatch.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ result: 'MISMATCHED', expectedFee: 3, statementFee: 5, feeDifference: 2, difference: 0 });
    expect(data.note).toContain('أجرة التوصيل');
  });

  it('passes a line where both the net and the fee agree', async () => {
    db.statementLine.findMany.mockResolvedValue([
      { id: 'l1', merchantRef: null, barcode: 'BC1', amount: 17, collected: 20, fee: 3 },
    ]);
    db.order.findFirst.mockResolvedValue({ id: 'o1', shippingStatus: 'DELIVERED', totalAmount: 20, deliveryFee: 3 });

    const outcome = await runMatching(db as never, scope);
    expect(outcome).toMatchObject({ matched: 1, mismatched: 0, feeMismatched: 0 });
    expect(db.settlementMatch.create.mock.calls[0][0].data).toMatchObject({ feeDifference: 0 });
  });

  it('does not compare the fee on a returned parcel — none is charged', async () => {
    db.statementLine.findMany.mockResolvedValue([
      { id: 'l1', merchantRef: null, barcode: 'BC1', amount: 0, collected: 0, fee: 0 },
    ]);
    db.order.findFirst.mockResolvedValue({ id: 'o1', shippingStatus: 'RETURNED', totalAmount: 20, deliveryFee: 3 });

    const outcome = await runMatching(db as never, scope);
    expect(outcome.matched).toBe(1);
    expect(outcome.feeMismatched).toBe(0);
  });

  it('compares nothing when the file states no fee at all', async () => {
    db.statementLine.findMany.mockResolvedValue([
      { id: 'l1', merchantRef: null, barcode: 'BC1', amount: 17, collected: null, fee: null },
    ]);
    db.order.findFirst.mockResolvedValue({ id: 'o1', shippingStatus: 'DELIVERED', totalAmount: 20, deliveryFee: 3 });

    const outcome = await runMatching(db as never, scope);
    expect(outcome.matched).toBe(1);
    expect(db.settlementMatch.create.mock.calls[0][0].data).toMatchObject({ statementFee: null, feeDifference: null });
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
