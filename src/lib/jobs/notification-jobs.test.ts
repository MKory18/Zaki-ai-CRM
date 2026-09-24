import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * THE THREE JOBS THAT ANNOUNCE THINGS.
 *
 * They used to write straight to the table, one shared row per company,
 * and check "already sent?" per company — so after the first store (or the
 * first wallet) nobody else heard anything that day. Now they go through
 * createNotification with an audience, and the "already sent?" check is
 * per order-and-date, per store-and-day, per wallet-and-day.
 */

const { db, createNotification } = vi.hoisted(() => ({
  db: {
    store: { findMany: vi.fn() },
    order: { findMany: vi.fn() },
    notification: { findFirst: vi.fn(), create: vi.fn() },
    wallet: { findMany: vi.fn() },
    dailyClosing: { findUnique: vi.fn() },
  },
  createNotification: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ db }));
vi.mock('@/lib/notification', () => ({ createNotification: (...a: unknown[]) => createNotification(...a) }));
vi.mock('@/lib/wallets', () => ({ blockingClosing: vi.fn(async () => null) }));

import { closingReminder, staleReturns, surfacePostponed } from './definitions';

const now = new Date('2026-09-24T06:00:00.000Z');
const store = (id: string) => ({
  id, companyId: 'c1', countryId: 'jo',
  country: { id: 'jo', name: 'الأردن', code: 'JO', minorUnit: 3 },
});

beforeEach(() => {
  vi.clearAllMocks();
  db.store.findMany.mockResolvedValue([store('A'), store('B')]);
  db.notification.findFirst.mockResolvedValue(null);
  createNotification.mockResolvedValue(2);
});

describe('surface-postponed', () => {
  beforeEach(() => {
    db.order.findMany.mockImplementation(async ({ where }: any) =>
      where.storeId === 'A'
        ? [{ id: 'o1', orderNumber: 'ORD-1', postponedUntil: new Date('2026-09-25T00:00:00Z'), claimedById: 'agent-1' }]
        : []
    );
  });

  it('tells the holding agent and this store\'s supervisors, and links to the postponed screen', async () => {
    const result = await surfacePostponed.run({ now } as any);
    expect(createNotification).toHaveBeenCalledTimes(1);
    expect(createNotification.mock.calls[0][0]).toMatchObject({
      companyId: 'c1',
      storeId: 'A',
      audience: { permission: 'confirmation.supervise', userIds: ['agent-1'] },
      type: 'POSTPONED_DUE',
      link: '/confirmation/postponed',
    });
    expect(result.processed).toBe(1);
  });

  it('does not repeat an order already announced for the same date', async () => {
    db.notification.findFirst.mockResolvedValue({ id: 'n-old' });
    await surfacePostponed.run({ now } as any);
    expect(createNotification).not.toHaveBeenCalled();
  });

  it('keys "already announced" on the order AND the date, in this store or a legacy row', async () => {
    await surfacePostponed.run({ now } as any);
    const where = db.notification.findFirst.mock.calls[0][0].where;
    expect(where.message).toContain('ORD-1');
    expect(where.message).toContain('2026-09-25');
    expect(where.OR).toEqual([{ storeId: 'A' }, { storeId: null }]);
  });

  it('does not count an order as announced when nobody could be told', async () => {
    createNotification.mockResolvedValue(0);
    const result = await surfacePostponed.run({ now } as any);
    expect(result.processed).toBe(0);
  });
});

describe('stale-returns', () => {
  beforeEach(() => {
    db.order.findMany.mockResolvedValue([{ id: 'o9', orderNumber: 'ORD-9' }]);
  });

  it('tells ops.returns holders of EACH store, once per store', async () => {
    await staleReturns.run({ now } as any);
    expect(createNotification.mock.calls.map((c) => c[0].storeId)).toEqual(['A', 'B']);
    for (const [arg] of createNotification.mock.calls) {
      expect(arg).toMatchObject({ audience: { permission: 'ops.returns' }, type: 'RETURNS_NOT_RECEIVED', link: '/ops/returns' });
    }
  });

  it('a store already told today does not silence the next store', async () => {
    db.notification.findFirst.mockImplementation(async ({ where }: any) => (where.storeId === 'A' ? { id: 'n' } : null));
    await staleReturns.run({ now } as any);
    expect(createNotification.mock.calls.map((c) => c[0].storeId)).toEqual(['B']);
  });

  it('asks "already told?" per store and per day', async () => {
    await staleReturns.run({ now } as any);
    const where = db.notification.findFirst.mock.calls[0][0].where;
    expect(where).toMatchObject({ companyId: 'c1', storeId: 'A', type: 'RETURNS_NOT_RECEIVED' });
    expect(where.createdAt.gte.toISOString()).toBe('2026-09-24T00:00:00.000Z');
  });
});

describe('closing-reminder', () => {
  beforeEach(() => {
    db.wallet.findMany.mockResolvedValue([
      { id: 'w1', name: 'صندوق عمّان', companyId: 'c1', storeId: 'A' },
      { id: 'w2', name: 'صندوق إربد', companyId: 'c1', storeId: 'B' },
      { id: 'w3', name: 'حساب الشركة', companyId: 'c1', storeId: null },
    ]);
    db.dailyClosing.findUnique.mockResolvedValue(null);
  });

  it('tells finance.cashbox holders about EVERY unclosed wallet, each in its own store', async () => {
    await closingReminder.run({ now } as any);
    expect(createNotification.mock.calls.map((c) => c[0].storeId)).toEqual(['A', 'B', null]);
    for (const [arg] of createNotification.mock.calls) {
      expect(arg).toMatchObject({ audience: { permission: 'finance.cashbox' }, type: 'CLOSING_DUE', link: '/finance/closing' });
    }
  });

  it('asks "already reminded?" per wallet and per day', async () => {
    await closingReminder.run({ now } as any);
    const where = db.notification.findFirst.mock.calls[1][0].where;
    expect(where).toMatchObject({ companyId: 'c1', storeId: 'B', type: 'CLOSING_DUE', message: { startsWith: 'صندوق إربد:' } });
  });

  it('a wallet already reminded today does not silence the others', async () => {
    db.notification.findFirst.mockImplementation(async ({ where }: any) =>
      where.message.startsWith === 'صندوق عمّان:' ? { id: 'n' } : null
    );
    await closingReminder.run({ now } as any);
    expect(createNotification.mock.calls.map((c) => c[0].storeId)).toEqual(['B', null]);
  });

  it('an approved closing is not reminded', async () => {
    db.dailyClosing.findUnique.mockResolvedValue({ id: 'dc', status: 'APPROVED' });
    await closingReminder.run({ now } as any);
    expect(createNotification).not.toHaveBeenCalled();
  });
});

describe('no job writes a shared row any more', () => {
  it('never calls notification.create directly', async () => {
    db.order.findMany.mockResolvedValue([{ id: 'o1', orderNumber: 'ORD-1', postponedUntil: now, claimedById: null }]);
    db.wallet.findMany.mockResolvedValue([{ id: 'w1', name: 'صندوق', companyId: 'c1', storeId: 'A' }]);
    db.dailyClosing.findUnique.mockResolvedValue(null);
    await surfacePostponed.run({ now } as any);
    await staleReturns.run({ now } as any);
    await closingReminder.run({ now } as any);
    expect(db.notification.create).not.toHaveBeenCalled();
  });
});
