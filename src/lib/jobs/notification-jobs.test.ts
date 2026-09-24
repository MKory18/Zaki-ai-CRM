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

const { db, createNotification, resolveAudience } = vi.hoisted(() => ({
  resolveAudience: vi.fn(),
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
vi.mock('@/lib/notification-audience', () => ({ resolveAudience: (...a: unknown[]) => resolveAudience(...a) }));
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
  // Named people come back as themselves; a permission as the store's supervisor.
  resolveAudience.mockImplementation(async ({ audience }: any) =>
    audience.permission
      ? [{ id: 'sup-1' }]
      : (audience.userIds ?? []).filter(Boolean).map((id: string) => ({ id }))
  );
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
      type: 'POSTPONED_DUE',
      link: '/confirmation/postponed',
    });
    expect(createNotification.mock.calls[0][0].recipients.map((u: any) => u.id).sort()).toEqual(['agent-1', 'sup-1']);
    expect(result.processed).toBe(1);
  });

  it('resolves each store\'s audience ONCE, not once per order', async () => {
    db.order.findMany.mockImplementation(async ({ where }: any) =>
      where.storeId === 'A'
        ? Array.from({ length: 30 }, (_, i) => ({
            id: `o${i}`, orderNumber: `ORD-${i}`, postponedUntil: new Date('2026-09-25T00:00:00Z'), claimedById: `agent-${i % 3}`,
          }))
        : []
    );
    await surfacePostponed.run({ now } as any);
    expect(createNotification).toHaveBeenCalledTimes(30);
    // One lookup of the holders and one of the supervisors for store A.
    expect(resolveAudience).toHaveBeenCalledTimes(2);
  });

  it('does not repeat an order already announced for the same date', async () => {
    db.notification.findFirst.mockResolvedValue({ id: 'n-old' });
    await surfacePostponed.run({ now } as any);
    expect(createNotification).not.toHaveBeenCalled();
  });

  it('keys "already announced" on the order AND the date, in this store, and only on a PERSONAL row', async () => {
    await surfacePostponed.run({ now } as any);
    const where = db.notification.findFirst.mock.calls[0][0].where;
    expect(where.message).toContain('ORD-1');
    expect(where.message).toContain('2026-09-25');
    expect(where.storeId).toBe('A');
    // A pre-stage-17 shared row is history the holding agent cannot see;
    // counting it would mean she is never told.
    expect(where.userId).toEqual({ not: null });
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
  const wallets = [
    { id: 'w1', name: 'نقد', companyId: 'c1', storeId: 'A' },
    { id: 'w2', name: 'نقد: فرع', companyId: 'c1', storeId: 'A' },
    { id: 'w3', name: 'حساب الشركة', companyId: 'c1', storeId: null },
  ];
  beforeEach(() => {
    // Honours the job's own filter, so what it asks for is what it gets.
    db.wallet.findMany.mockImplementation(async ({ where }: any) =>
      wallets.filter((w) => (where?.storeId?.not === null ? w.storeId !== null : true))
    );
    db.dailyClosing.findUnique.mockResolvedValue(null);
  });

  it('tells finance.cashbox holders about every unclosed wallet that belongs to a store', async () => {
    await closingReminder.run({ now } as any);
    expect(createNotification.mock.calls.map((c) => c[0].storeId)).toEqual(['A', 'A']);
    for (const [arg] of createNotification.mock.calls) {
      expect(arg).toMatchObject({ audience: { permission: 'finance.cashbox' }, type: 'CLOSING_DUE' });
    }
  });

  it('does not remind about a wallet with no store — nobody could act on it, and it reached every country', async () => {
    await closingReminder.run({ now } as any);
    expect(db.wallet.findMany.mock.calls[0][0].where).toMatchObject({ storeId: { not: null } });
    expect(createNotification.mock.calls.some((c) => c[0].message.includes('حساب الشركة'))).toBe(false);
  });

  it('asks "already reminded?" by the wallet\'s id, per day', async () => {
    await closingReminder.run({ now } as any);
    const where = db.notification.findFirst.mock.calls[1][0].where;
    expect(where).toMatchObject({ companyId: 'c1', storeId: 'A', type: 'CLOSING_DUE', link: '/finance/closing?wallet=w2' });
    expect(where.createdAt.gte.toISOString()).toBe('2026-09-24T00:00:00.000Z');
  });

  it('a wallet already reminded does not silence one whose name begins the same way', async () => {
    // Keyed on the name, «نقد» matched the message of «نقد: فرع».
    db.notification.findFirst.mockImplementation(async ({ where }: any) =>
      where.link === '/finance/closing?wallet=w2' ? { id: 'n' } : null
    );
    await closingReminder.run({ now } as any);
    expect(createNotification).toHaveBeenCalledTimes(1);
    expect(createNotification.mock.calls[0][0].link).toBe('/finance/closing?wallet=w1');
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
