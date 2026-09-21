import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Order numbering.
 *
 * The defect this covers: the number came from counting rows, so deleting or
 * voiding an order dropped the count back onto a number already in use. The
 * insert then hit the unique index, and on Postgres a failed statement
 * aborts the whole transaction — which meant the retry written to recover
 * from exactly this could not run either.
 */

const { db } = vi.hoisted(() => ({ db: { order: { findFirst: vi.fn(), count: vi.fn() } } }));
vi.mock('./db', () => ({ db }));

import { ORDER_NUMBER_RE, nextOrderNumber, orderRefFields } from './order-ref';

const AT = new Date('2026-09-20T10:00:00Z');

beforeEach(() => vi.clearAllMocks());

describe('nextOrderNumber', () => {
  it('continues from the highest number issued, not the row count', async () => {
    db.order.findFirst.mockResolvedValue({ orderNumber: 'ORD-2026-0007' });
    expect(await nextOrderNumber(db as never, 'c1', 'ORD', 0, AT)).toBe('ORD-2026-0008');
  });

  it('does not reuse a number after one is deleted', async () => {
    // Six orders remain but 0007 was the highest ever issued.
    db.order.count.mockResolvedValue(6);
    db.order.findFirst.mockResolvedValue({ orderNumber: 'ORD-2026-0007' });
    const next = await nextOrderNumber(db as never, 'c1', 'ORD', 0, AT);
    expect(next).toBe('ORD-2026-0008');
    expect(next).not.toBe('ORD-2026-0007');
  });

  it('starts at one for a company with no orders this year', async () => {
    db.order.findFirst.mockResolvedValue(null);
    expect(await nextOrderNumber(db as never, 'c1', 'ORD', 0, AT)).toBe('ORD-2026-0001');
  });

  it('steps forward on each retry attempt', async () => {
    db.order.findFirst.mockResolvedValue({ orderNumber: 'ORD-2026-0007' });
    expect(await nextOrderNumber(db as never, 'c1', 'ORD', 1, AT)).toBe('ORD-2026-0009');
    expect(await nextOrderNumber(db as never, 'c1', 'ORD', 2, AT)).toBe('ORD-2026-0010');
  });

  it('looks only at this prefix and this year', async () => {
    db.order.findFirst.mockResolvedValue({ orderNumber: 'ORD-2026-0007' });
    await nextOrderNumber(db as never, 'c1', 'ORD', 0, AT);
    expect(db.order.findFirst.mock.calls[0][0].where).toMatchObject({
      companyId: 'c1',
      orderNumber: { startsWith: 'ORD-2026-' },
    });
  });

  it('survives a malformed number already in the table', async () => {
    db.order.findFirst.mockResolvedValue({ orderNumber: 'ORD-2026-XXXX' });
    expect(await nextOrderNumber(db as never, 'c1', 'ORD', 0, AT)).toBe('ORD-2026-0001');
  });

  it('honours a country prefix other than ORD', async () => {
    db.order.findFirst.mockResolvedValue({ orderNumber: 'SY-2026-0044' });
    expect(await nextOrderNumber(db as never, 'c1', 'SY', 0, AT)).toBe('SY-2026-0045');
  });
});

describe('orderRefFields', () => {
  it('makes the merchant reference the order number — one identifier, not two', async () => {
    db.order.findFirst.mockResolvedValue({ orderNumber: 'ORD-2026-0007' });
    const refs = await orderRefFields(db as never, 'c1', 'ORD', 0, AT);
    expect(refs).toEqual({ orderNumber: 'ORD-2026-0008', merchantRef: 'ORD-2026-0008' });
  });
});

describe('the shape of an order number', () => {
  it('accepts what the generator actually produces, for any store prefix', async () => {
    // The public upsell route used to carry its own pattern demanding a
    // literal "ORD-". Every Syrian and Jordanian order failed it, so the
    // upsell had never once succeeded.
    for (const prefix of ['SY', 'JO', 'ORD', 'EG1']) {
      db.order.findFirst.mockResolvedValue(null);
      const n = await nextOrderNumber(db as never, 'c1', prefix, 0, AT);
      expect(ORDER_NUMBER_RE.test(n), n).toBe(true);
    }
  });

  it('still refuses something that is not an order number', () => {
    for (const bad of ['', 'SY-2026', 'SY-26-0001', '../../etc', 'SY-2026-0001; DROP', 'sy-2026-0001']) {
      expect(ORDER_NUMBER_RE.test(bad), bad).toBe(false);
    }
  });
});
