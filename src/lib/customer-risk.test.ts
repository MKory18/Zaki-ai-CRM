import { beforeEach, describe, expect, it, vi } from 'vitest';
import { customerHistory, customerRisk } from './customer-risk';

/**
 * ONE PHONE, ONE PERSON, ONE RISK HISTORY — behaviourally, not by reading the
 * source.
 *
 * This module had no test at all, and it was the module that both declared the
 * invariant in its own docstring and broke it: the risk was computed by
 * `customerId`, and `Customer` is unique per `[companyId, storeId, phone]`. So
 * a customer who returned six of ten parcels at one shop arrived SAFE at the
 * shop next door.
 *
 * These assert the WHERE that goes to the database, because that clause IS the
 * invariant. A source match would have been satisfied by the helper existing
 * and nobody calling it.
 */

const tx = {
  customer: { findFirst: vi.fn() },
  order: { findMany: vi.fn() },
};

const NOW = new Date('2026-10-02T12:00:00.000Z');
const ago = (days: number) => new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);

beforeEach(() => {
  vi.clearAllMocks();
  tx.customer.findFirst.mockResolvedValue({ phone: '0999123456' });
  tx.order.findMany.mockResolvedValue([]);
});

const risk = () => customerRisk(tx as never, 'c1', 'cust-of-store-a', NOW);

describe('the question is asked about the PERSON', () => {
  it('both windows are scoped by phone across the company, never by the row id', async () => {
    await risk();
    const wheres = tx.order.findMany.mock.calls.map((c) => c[0].where);
    expect(wheres).toHaveLength(2);
    for (const w of wheres) {
      expect(w.customer).toEqual({ phone: '0999123456' });
      expect(w.companyId).toBe('c1');
      // The store's row id must not narrow it, and no storeId may appear.
      expect(w.customerId).toBeUndefined();
      expect(w.storeId).toBeUndefined();
    }
  });

  it('and the six-month window is the only one with a date bound', async () => {
    await risk();
    const [first, second] = tx.order.findMany.mock.calls.map((c) => c[0]);
    expect(first.where.createdAt.gte.getTime()).toBe(NOW.getTime() - 182 * 24 * 60 * 60 * 1000);
    expect(second.where.createdAt).toBeUndefined();
    expect(second.take).toBe(10);
    expect(second.orderBy).toEqual({ createdAt: 'desc' });
  });

  it('and a customer row that cannot be read falls back to the id, not to nothing', async () => {
    // Narrowing the question is honest; throwing would take down a
    // confirmation screen because one row is missing.
    tx.customer.findFirst.mockResolvedValue(null);
    await risk();
    for (const c of tx.order.findMany.mock.calls) {
      expect(c[0].where.customerId).toBe('cust-of-store-a');
      expect(c[0].where.customer).toBeUndefined();
    }
  });
});

describe('the tier is read off the window that says more', () => {
  const order = (shippingStatus: string, days: number, returnedAt?: Date) => ({
    shippingStatus,
    createdAt: ago(days),
    returnedAt: returnedAt ?? null,
  });

  it('six of ten returned is HIGH, and it is the SAME person across two stores', async () => {
    // Four of these orders belong to the other store's customer row. Before
    // the fix this call saw none of them.
    const rows = [
      ...Array.from({ length: 6 }, (_, i) => order('RETURNED', 200 + i, ago(190 + i))),
      ...Array.from({ length: 4 }, (_, i) => order('DELIVERED', 210 + i)),
    ];
    // Older than six months, so the LAST TEN window is the fuller one.
    tx.order.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce(rows);
    const r = await risk();
    expect(r.orders).toBe(10);
    expect(r.returns).toBe(6);
    expect(r.tier).toBe('HIGH');
    expect(r.requiresPrepaymentOrApproval).toBe(true);
    expect(r.excludedFromAutomatedConfirmation).toBe(true);
    // `windowDays` is 0 when the last-ten window won: it is not a six-month
    // figure and must not be reported as one.
    expect(r.windowDays).toBe(0);
  });

  it('and two returns inside sixty days is HIGH on an otherwise clean record', async () => {
    const rows = [
      order('RETURNED', 10, ago(5)),
      order('FAILED_DELIVERY', 20, ago(15)),
      ...Array.from({ length: 48 }, (_, i) => order('DELIVERED', 30 + i)),
    ];
    tx.order.findMany.mockResolvedValueOnce(rows).mockResolvedValueOnce(rows.slice(0, 10));
    const r = await risk();
    expect(r.recentReturns60d).toBe(2);
    expect(r.tier).toBe('HIGH');
    expect(r.windowDays).toBe(182);
  });

  it('and a return dated by when it CAME BACK, not when it was ordered', async () => {
    // Ordered eleven months ago, returned last week. It is a recent return.
    const rows = [
      order('RETURNED', 330, ago(7)),
      order('RETURNED', 320, ago(3)),
      ...Array.from({ length: 40 }, (_, i) => order('DELIVERED', 10 + i)),
    ];
    tx.order.findMany.mockResolvedValueOnce(rows).mockResolvedValueOnce(rows.slice(0, 10));
    expect((await risk()).recentReturns60d).toBe(2);
  });

  it('and a customer with no orders at all is SAFE, not a division by zero', async () => {
    const r = await risk();
    expect(r.orders).toBe(0);
    expect(r.returnRate).toBe(0);
    expect(r.tier).toBe('SAFE');
  });
});

describe('the history is the same person’s, and it is the one resolver', () => {
  it('asks by phone, newest first, and can exclude the order in hand', async () => {
    await customerHistory(tx as never, 'c1', 'cust-of-store-a', { exceptOrderId: 'o-now' });
    const arg = tx.order.findMany.mock.calls[0][0];
    expect(arg.where.customer).toEqual({ phone: '0999123456' });
    expect(arg.where.id).toEqual({ not: 'o-now' });
    expect(arg.orderBy).toEqual({ createdAt: 'desc' });
    expect(arg.take).toBe(10);
  });

  it('and sends no phone, address or city back out', async () => {
    await customerHistory(tx as never, 'c1', 'cust-of-store-a');
    const select = tx.order.findMany.mock.calls[0][0].select;
    for (const leak of ['phone', 'address', 'city', 'customerNotes']) {
      expect(select[leak], leak).toBeUndefined();
    }
    expect(Object.keys(select).sort()).toEqual(
      ['confirmationStatus', 'createdAt', 'orderNumber', 'shippingStatus', 'totalAmount']
    );
  });

  it('and omits the exclusion entirely when there is nothing to exclude', async () => {
    await customerHistory(tx as never, 'c1', 'cust-of-store-a');
    expect(tx.order.findMany.mock.calls[0][0].where.id).toBeUndefined();
  });
});
