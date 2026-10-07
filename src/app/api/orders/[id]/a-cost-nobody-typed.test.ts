import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';

/**
 * A COST OF SIXTEEN THAT NOBODY TYPED — AND `isNaN` IS NOT `isFinite`.
 *
 * `PATCH /api/orders/[id]/finance` read all six of its money columns
 * through one helper:
 *
 *     const numOrReject = (v: any, name: string) => {
 *       if (v === undefined) return undefined;
 *       const n = Number(v);
 *       if (isNaN(n) || n < 0) throw new Error(`Invalid ${name}`);
 *       return n;
 *     };
 *
 * MEASURED, not remembered: `Number('0x10')` is **16**, `'0b11'` is 3,
 * `'0o17'` is 15, and `isNaN` is happy with every one of them. So
 * `productCost: '0x10'` was stored as **16.00** with a 200, in a column
 * `grossProfit` and `netProfit` are computed from.
 *
 * And `Number('1e400')` is `Infinity`, `isNaN(Infinity)` is **false**, and
 * `Infinity < 0` is **false** — so `'1e400'` passed both halves of that
 * condition too. What it reached was measured against this database with an
 * `updateMany` whose `where` matches no row, so nothing could be written:
 *
 *     data: { productCost: new Prisma.Decimal(Infinity) }
 *       → PrismaClientUnknownRequestError: Could not convert argument value
 *         Object {"$type": "Decimal", "value": "Infinity"} to ArgumentValue
 *
 * `new Prisma.Decimal(Infinity)` does NOT throw — it is a Decimal whose
 * `toString()` is `'Infinity'` — and Prisma refuses it in the client, before
 * SQL. So the overflow never corrupted a column; it turned a typo in a cost
 * field into **HTTP 500 «حدث خطأ داخلي»**, which tells the operator to call
 * the administrator. The sixteen is the one that was stored.
 *
 * THE ROW HANDED TO PRISMA IS ASSERTED FIRST, THEN THE STATUS. A draft of a
 * sibling test printed only «200 instead of 400» and the stored figure never
 * appeared in the output, so there was no way to see WHAT had been written.
 */

const {
  db, requireContext, assertOrderAccess, can, logAudit, commissionCostForOrders,
} = vi.hoisted(() => ({
  db: {
    order: { findFirst: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn() },
    financialTransaction: { create: vi.fn() },
    orderStatusLog: { create: vi.fn() },
    orderActivity: { create: vi.fn() },
  },
  requireContext: vi.fn(),
  assertOrderAccess: vi.fn(),
  can: vi.fn(),
  logAudit: vi.fn(),
  commissionCostForOrders: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ db }));
vi.mock('@/lib/geo-context', () => ({ requireContext: (...a: unknown[]) => requireContext(...a) }));
vi.mock('@/lib/rbac', () => ({
  ORDER_ACCESS_STATUS: { NOT_FOUND: 404, FORBIDDEN: 403 },
  assertOrderAccess: (...a: unknown[]) => assertOrderAccess(...a),
  assertOrderReadable: vi.fn(),
}));
vi.mock('@/lib/authorization', () => ({ can: (...a: unknown[]) => can(...a) }));
vi.mock('@/lib/audit', () => ({ logAudit: (...a: unknown[]) => logAudit(...a) }));
vi.mock('@/lib/commission', () => ({
  commissionCostForOrders: (...a: unknown[]) => commissionCostForOrders(...a),
}));

import { PATCH } from './finance/route';

const ORDER_ID = '11111111-2222-4333-8444-555555555555';

/** A delivered order with a real total, so a refund has something to exceed. */
const ORDER = {
  id: ORDER_ID,
  companyId: 'c1',
  version: 7,
  currency: 'SYP',
  settlementStatus: 'PENDING',
  totalAmount: 60_000,
  sellingPrice: 20_000,
  quantity: 3,
  shippingCost: 0,
  discount: null,
  shippingRevenue: null,
  productCost: null,
  packagingCost: null,
  advertisingCost: null,
  otherCost: null,
  estimatedCostOfGoods: 0,
  refundAmount: null,
};

const patch = (body: unknown) =>
  PATCH(
    new Request(`http://localhost/api/orders/${ORDER_ID}/finance`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: ORDER_ID }) }
  );

/** The `data` block the order was updated with — or undefined if none was. */
const savedRow = (): Record<string, any> | undefined =>
  db.order.updateMany.mock.calls[0]?.[0]?.data;

/** One money column out of that row, as a plain string a failure can print. */
const stored = (column: string): string | undefined => {
  const value = savedRow()?.[column];
  return value === undefined || value === null ? undefined : String(value);
};

beforeEach(() => {
  vi.clearAllMocks();
  requireContext.mockResolvedValue({
    user: { id: 'u1', name: 'هدى', role: 'FINANCE' },
    companyId: 'c1',
    storeId: 's1',
  });
  assertOrderAccess.mockResolvedValue({ allowed: true, order: { ...ORDER } });
  can.mockReturnValue(true);
  commissionCostForOrders.mockResolvedValue(0);
  db.order.updateMany.mockResolvedValue({ count: 1 });
  db.order.findUnique.mockResolvedValue({ ...ORDER });
});

/* ───────────── what the deleted helper really answered, in figures ───────── */

describe('the reader that stood here, replayed', () => {
  /** `numOrReject`, exactly as it was. */
  const old = (v: any) => {
    if (v === undefined) return undefined;
    const n = Number(v);
    if (isNaN(n) || n < 0) throw new Error('Invalid');
    return n;
  };

  it('turned three base notations into three plausible costs', () => {
    expect(old('0x10')).toBe(16);
    expect(old('0b11')).toBe(3);
    expect(old('0o17')).toBe(15);
    expect(old('0X10')).toBe(16);
  });

  it('and let an overflow through, because isNaN is not isFinite', () => {
    expect(Number('1e400')).toBe(Infinity);
    expect(isNaN(Infinity)).toBe(false);
    expect(Infinity < 0).toBe(false);
    expect(old('1e400')).toBe(Infinity);
  });

  it('and `null`, `[]` and `` were a zero cost rather than a refusal', () => {
    expect(old(null)).toBe(0);
    expect(old([])).toBe(0);
    expect(old('')).toBe(0);
    expect(old('   ')).toBe(0);
  });

  /**
   * WHAT `new Prisma.Decimal(Infinity)` IS — the constructor is measured
   * here, and what Prisma's client does with it was measured against the
   * live database separately (quoted in this file's header). The two
   * together are why the overflow was a 500 and not a corrupt column.
   */
  it('and the Decimal it built was Infinity, not an exception', () => {
    const d = new Prisma.Decimal(Infinity);
    expect(d.toString()).toBe('Infinity');
    expect(d.isFinite()).toBe(false);
    // And the one that is NOT the same thing, because the two look alike:
    // a Decimal parsed from the STRING keeps the exponent and is finite.
    expect(new Prisma.Decimal('1e400').isFinite()).toBe(true);
  });
});

/* ──────────────────────── the door, as it stands now ─────────────────────── */

describe('a cost written in a notation nobody meant', () => {
  it('reaches Prisma as nothing at all, where it used to arrive as 16.00', async () => {
    const res = await patch({ expectedVersion: 7, productCost: '0x10' });

    // THE ROW FIRST. On a regression this prints «expected '16' to be
    // undefined», which names the figure; the status alone would not.
    expect(stored('productCost'), 'تكلفةٌ لم يَكتُبْها أحدٌ وَصَلَت بريزما').toBeUndefined();
    expect(savedRow(), 'الطلبُ عُدِّلَ بتكلفةٍ مقروءةٍ بترميزٍ آخر').toBeUndefined();
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('productCost');
  });

  it('and the same for the other five columns the helper served', async () => {
    for (const [column, notation, wouldHaveBeen] of [
      ['packagingCost', '0b11', '3'],
      ['advertisingCost', '0o17', '15'],
      ['otherCost', '0X10', '16'],
      ['discount', '0x10', '16'],
      ['shippingRevenue', '0b11', '3'],
    ] as const) {
      vi.clearAllMocks();
      assertOrderAccess.mockResolvedValue({ allowed: true, order: { ...ORDER } });
      can.mockReturnValue(true);
      commissionCostForOrders.mockResolvedValue(0);
      requireContext.mockResolvedValue({ user: { id: 'u1', name: 'هدى', role: 'FINANCE' }, companyId: 'c1', storeId: 's1' });
      db.order.updateMany.mockResolvedValue({ count: 1 });

      const res = await patch({ expectedVersion: 7, [column]: notation });
      expect(
        stored(column),
        `${column}: «${notation}» كان يُخزَّنُ ${wouldHaveBeen}`
      ).toBeUndefined();
      expect(res.status, `${column}: «${notation}»`).toBe(400);
    }
  });

  it('and an overflow is a 400 with the field named, not a 500 from Prisma', async () => {
    const res = await patch({ expectedVersion: 7, productCost: '1e400' });
    expect(stored('productCost')).toBeUndefined();
    expect(savedRow(), 'Decimal(Infinity) سُلِّمَ لبريزما').toBeUndefined();
    expect(res.status).toBe(400);
  });

  it('and a figure that really is a cost is still written, unrounded', async () => {
    const res = await patch({ expectedVersion: 7, productCost: '12.5' });

    expect(stored('productCost'), 'تكلفةٌ صحيحةٌ لم تُكتَب').toBe('12.5');
    expect(savedRow()!.productCost).toBeInstanceOf(Prisma.Decimal);
    // And the recompute ran off it: 20000 × 3 − 12.5 × 3 = 59962.5
    expect(String(savedRow()!.grossProfit)).toBe('59962.5');
    expect(res.status).toBe(200);
  });

  it('and a plain zero is a cost, not an absence', async () => {
    const res = await patch({ expectedVersion: 7, packagingCost: 0 });
    expect(stored('packagingCost')).toBe('0');
    expect(res.status).toBe(200);
  });

  /**
   * THE CEILING, which the door did not have. `Decimal(12, 2)` is refused
   * by Postgres at 10^10 — measured as
   * `22003 numeric field overflow: a field with precision 12, scale 2 must
   * round to an absolute value less than 10^10` — so without a bound the
   * door answers 500 for a figure it could name in a 400.
   */
  it('and a figure past the column is refused by the door, not by Postgres', async () => {
    const over = await patch({ expectedVersion: 7, otherCost: 100_000_001 });
    expect(stored('otherCost')).toBeUndefined();
    expect(over.status).toBe(400);

    vi.clearAllMocks();
    requireContext.mockResolvedValue({ user: { id: 'u1', name: 'هدى', role: 'FINANCE' }, companyId: 'c1', storeId: 's1' });
    assertOrderAccess.mockResolvedValue({ allowed: true, order: { ...ORDER } });
    can.mockReturnValue(true);
    commissionCostForOrders.mockResolvedValue(0);
    db.order.updateMany.mockResolvedValue({ count: 1 });
    const at = await patch({ expectedVersion: 7, otherCost: 100_000_000 });
    expect(stored('otherCost')).toBe('100000000');
    expect(at.status).toBe(200);
  });
});

/* ────────────────── the other two readers in the same file ───────────────── */

describe('a refund amount', () => {
  it('is not sixteen because it was written 0x10', async () => {
    const res = await patch({ expectedVersion: 7, refundAmount: '0x10', settlementStatus: 'REFUNDED' });
    const ledger = db.financialTransaction.create.mock.calls[0]?.[0]?.data;
    expect(
      ledger?.amount === undefined ? undefined : String(ledger.amount),
      'ردٌّ بـ16 دُوِّنَ في دفتر المال'
    ).toBeUndefined();
    expect(res.status).toBe(400);
  });

  it('and a real refund still reaches the ledger as itself', async () => {
    const res = await patch({ expectedVersion: 7, refundAmount: '1500.25', settlementStatus: 'REFUNDED' });
    const ledger = db.financialTransaction.create.mock.calls[0]?.[0]?.data;
    expect(String(ledger?.amount), 'ردٌّ صحيحٌ لم يُدوَّن').toBe('1500.25');
    expect(res.status).toBe(200);
  });

  it('and one larger than the order is still refused, as it always was', async () => {
    const res = await patch({ expectedVersion: 7, refundAmount: 60_001 });
    expect(savedRow()).toBeUndefined();
    expect(res.status).toBe(400);
  });
});

describe('a partial settlement amount', () => {
  it('is not sixteen because it was written 0x10', async () => {
    const res = await patch({ expectedVersion: 7, settlementStatus: 'PARTIALLY_SETTLED', amount: '0x10' });
    const ledger = db.financialTransaction.create.mock.calls[0]?.[0]?.data;
    expect(
      ledger?.amount === undefined ? undefined : String(ledger.amount),
      'تسويةٌ جزئيّةٌ بـ16 دُوِّنَت'
    ).toBeUndefined();
    expect(res.status).toBe(400);
  });

  it('and absent is still refused — the shared reader says so by itself', async () => {
    const res = await patch({ expectedVersion: 7, settlementStatus: 'PARTIALLY_SETTLED' });
    expect(db.financialTransaction.create).not.toHaveBeenCalled();
    expect(res.status).toBe(400);
  });

  it('and a real partial settlement is written as itself', async () => {
    const res = await patch({ expectedVersion: 7, settlementStatus: 'PARTIALLY_SETTLED', amount: '2500' });
    const ledger = db.financialTransaction.create.mock.calls[0]?.[0]?.data;
    expect(String(ledger?.amount)).toBe('2500');
    expect(res.status).toBe(200);
  });
});
