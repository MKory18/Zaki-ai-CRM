import { describe, expect, it } from 'vitest';
import { receiptsInStatementCurrency, type ReceiptLine } from './receipt-conversion';

/**
 * What arrived, in the currency the statement is written in.
 *
 * The gap between «أقرّت الشركة» and «وصل فعلاً» decides whether a statement
 * may be approved, and approval is the moment money enters a wallet. A gap
 * computed by adding dinars to dollars is a gate that opens on arithmetic
 * nobody did.
 */

const line = (over: Partial<ReceiptLine> = {}): ReceiptLine => ({
  amount: 100,
  currencyCode: 'USD',
  exchangeRate: null,
  ...over,
});

describe('receipts in the statement currency', () => {
  it('takes a same-currency receipt as it stands', () => {
    expect(receiptsInStatementCurrency([line({ amount: 1889.48 })], 'USD', 2)).toEqual({
      received: 1889.48,
      unconvertible: 0,
    });
  });

  it('adds several same-currency receipts — cash plus a transfer', () => {
    const sum = receiptsInStatementCurrency([line({ amount: 60 }), line({ amount: 40.5 })], 'USD', 2);
    expect(sum.received).toBe(100.5);
  });

  /**
   * The rate is stored as statement → wallet, the same direction a wallet
   * transfer stores it (`amountIn = amountOut * rate`). Coming back therefore
   * divides.
   */
  it('converts a receipt taken in another currency by the rate stored with it', () => {
    const sum = receiptsInStatementCurrency(
      [line({ amount: 709, currencyCode: 'JOD', exchangeRate: 0.709 })],
      'USD',
      2
    );
    expect(sum.received).toBe(1000);
    expect(sum.unconvertible).toBe(0);
  });

  it('mixes a converted receipt with a native one without confusing the two', () => {
    const sum = receiptsInStatementCurrency(
      [line({ amount: 500 }), line({ amount: 354.5, currencyCode: 'JOD', exchangeRate: 0.709 })],
      'USD',
      2
    );
    expect(sum.received).toBe(1000);
  });

  it('rounds to the statement currency, not to some other precision', () => {
    const sum = receiptsInStatementCurrency(
      [line({ amount: 1, currencyCode: 'JOD', exchangeRate: 3 })],
      'USD',
      2
    );
    expect(sum.received).toBe(0.33);
  });

  /** ── What must NOT happen ── */

  it('never adds a foreign amount to the total when no rate was stored', () => {
    const sum = receiptsInStatementCurrency(
      [line({ amount: 500 }), line({ amount: 709, currencyCode: 'JOD', exchangeRate: null })],
      'USD',
      2
    );
    expect(sum.received, 'دينارٌ جُمِع مع الدولار').toBe(500);
    expect(sum.unconvertible).toBe(1);
  });

  it('treats a zero rate as no rate rather than dividing by it', () => {
    const sum = receiptsInStatementCurrency(
      [line({ amount: 709, currencyCode: 'JOD', exchangeRate: 0 })],
      'USD',
      2
    );
    expect(Number.isFinite(sum.received)).toBe(true);
    expect(sum.received).toBe(0);
    expect(sum.unconvertible).toBe(1);
  });

  it('treats a negative rate the same way', () => {
    expect(
      receiptsInStatementCurrency([line({ currencyCode: 'JOD', exchangeRate: -2 })], 'USD', 2).unconvertible
    ).toBe(1);
  });

  it('reports nothing arrived when there are no receipts', () => {
    expect(receiptsInStatementCurrency([], 'USD', 2)).toEqual({ received: 0, unconvertible: 0 });
  });
});
