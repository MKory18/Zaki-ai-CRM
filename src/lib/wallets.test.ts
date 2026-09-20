import { beforeEach, describe, expect, it, vi } from 'vitest';

/** Wallets: balance, reversal-only corrections, and the closing blocker. */

const { db } = vi.hoisted(() => ({
  db: {
    wallet: { findUnique: vi.fn(), findFirst: vi.fn() },
    walletMovement: { aggregate: vi.fn(), count: vi.fn(), create: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn() },
    dailyClosing: { findFirst: vi.fn() },
  },
}));
vi.mock('./db', () => ({ db }));

import { blockingClosing, recordMovement, reverseMovement, walletBalance } from './wallets';

beforeEach(() => {
  vi.clearAllMocks();
  db.walletMovement.create.mockImplementation(async ({ data }: any) => ({ id: 'm-new', ...data }));
});

describe('walletBalance', () => {
  it('is opening plus every IN minus every OUT', async () => {
    db.wallet.findUnique.mockResolvedValue({ id: 'w1', currencyCode: 'JOD', openingBalance: 100 });
    db.walletMovement.aggregate
      .mockResolvedValueOnce({ _sum: { amount: 250 } }) // IN
      .mockResolvedValueOnce({ _sum: { amount: 80 } }); // OUT
    db.walletMovement.count.mockResolvedValue(4);

    const balance = await walletBalance(db as never, 'w1', 3);
    expect(balance).toMatchObject({ opening: 100, in: 250, out: 80, balance: 270, movements: 4 });
  });
});

describe('recordMovement', () => {
  it('takes the wallet currency, never a caller-supplied one', async () => {
    db.wallet.findFirst.mockResolvedValue({ id: 'w1', currencyCode: 'JOD' });
    const movement = await recordMovement(db as never, {
      companyId: 'c1', walletId: 'w1', direction: 'IN', amount: 50,
      party: 'شركة الشحن', category: 'COURIER_SETTLEMENT', note: 'تحصيل', createdById: 'u1',
    });
    expect(movement).toMatchObject({ currencyCode: 'JOD', direction: 'IN', amount: 50 });
  });

  it('refuses a zero or negative amount', async () => {
    db.wallet.findFirst.mockResolvedValue({ id: 'w1', currencyCode: 'JOD' });
    await expect(
      recordMovement(db as never, {
        companyId: 'c1', walletId: 'w1', direction: 'OUT', amount: 0,
        party: 'x', category: 'EXPENSE', note: 'y', createdById: 'u1',
      })
    ).rejects.toThrow();
  });
});

describe('reverseMovement — the only correction there is', () => {
  const original = {
    id: 'm1', companyId: 'c1', walletId: 'w1', direction: 'IN', amount: 50,
    currencyCode: 'JOD', party: 'شركة الشحن', category: 'COURIER_SETTLEMENT',
    note: 'تحصيل', referenceType: null, referenceId: null, reversalOfId: null,
  };

  it('writes an opposite entry linked to the original, with a reason', async () => {
    db.walletMovement.findFirst.mockResolvedValue(original);
    db.walletMovement.findUnique.mockResolvedValue(null);

    const reversal = await reverseMovement(db as never, {
      companyId: 'c1', movementId: 'm1', reason: 'مبلغ مسجَّل مرتين', createdById: 'u2',
    });
    expect(reversal).toMatchObject({
      direction: 'OUT', amount: 50, reversalOfId: 'm1', reversalReason: 'مبلغ مسجَّل مرتين',
    });
  });

  it('refuses to reverse the same movement twice', async () => {
    db.walletMovement.findFirst.mockResolvedValue(original);
    db.walletMovement.findUnique.mockResolvedValue({ id: 'm2' });
    await expect(
      reverseMovement(db as never, { companyId: 'c1', movementId: 'm1', reason: 'مرة ثانية', createdById: 'u2' })
    ).rejects.toThrow(/already reversed/i);
  });

  it('refuses to reverse a reversing entry', async () => {
    db.walletMovement.findFirst.mockResolvedValue({ ...original, reversalOfId: 'm0' });
    await expect(
      reverseMovement(db as never, { companyId: 'c1', movementId: 'm1', reason: 'x', createdById: 'u2' })
    ).rejects.toThrow();
  });
});

describe('blockingClosing', () => {
  it('looks for an earlier open day with an unexplained difference', async () => {
    db.dailyClosing.findFirst.mockResolvedValue({ id: 'cl1', date: new Date('2026-09-19'), difference: -5 });
    const blocker = await blockingClosing(db as never, 'w1', new Date('2026-09-20'));
    expect(blocker).toMatchObject({ id: 'cl1' });

    const where = db.dailyClosing.findFirst.mock.calls[0][0].where;
    expect(where.status).toBe('OPEN');
    expect(where.NOT).toEqual({ difference: 0 });
    expect(where.OR).toEqual([{ explanation: null }, { explanation: '' }]);
  });
});
