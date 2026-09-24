import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * WHO HEARS ABOUT WHAT.
 *
 * The permission engine, the store-entry rule and the route guard run for
 * real here; only Prisma is replaced, by a small in-memory company. That is
 * the point of the test: the audience must be what the engine says — a
 * DENY override removes a supervisor, an ALLOW override adds a warehouse
 * clerk, a store narrowing keeps a supervisor of store B out of store A —
 * and not what a role-name list would guess.
 */

const { db, state } = vi.hoisted(() => {
  const state = {
    users: [] as any[],
    roleRows: {} as Record<string, { permission: string; scope: string; scopeIds: null }[]>,
    overrides: [] as any[],
    stores: [] as any[],
    countryAccess: [] as { userId: string; countryId: string }[],
    storeAccess: [] as { userId: string; storeId: string }[],
    written: [] as any[],
  };
  const db = {
    user: {
      findMany: vi.fn(async ({ where }: any) =>
        state.users.filter(
          (u) =>
            u.companyId === where.companyId &&
            (!where.status || u.status === where.status) &&
            (!where.id?.in || where.id.in.includes(u.id))
        )
      ),
    },
    userPermission: {
      findMany: vi.fn(async ({ where }: any) => state.overrides.filter((o) => where.userId.in.includes(o.userId))),
    },
    rolePermission: {
      findMany: vi.fn(async ({ where }: any) => state.roleRows[where.roleId ?? where.role.name] ?? []),
    },
    store: {
      findFirst: vi.fn(async ({ where }: any) => {
        const s = state.stores.find((x) => x.id === where.id && x.companyId === where.companyId);
        return s ? { id: s.id, countryId: s.countryId, country: { isActive: true, companyId: s.companyId } } : null;
      }),
    },
    userCountryAccess: {
      findMany: vi.fn(async ({ where }: any) =>
        state.countryAccess.filter((a) => where.userId.in.includes(a.userId) && a.countryId === where.countryId)
      ),
    },
    userStoreAccess: {
      findMany: vi.fn(async ({ where }: any) =>
        state.storeAccess.filter(
          (a) =>
            where.userId.in.includes(a.userId) &&
            state.stores.find((s) => s.id === a.storeId)?.countryId === where.store.countryId
        )
      ),
    },
    notification: {
      createMany: vi.fn(async ({ data }: any) => {
        state.written.push(...data);
        return { count: data.length };
      }),
    },
  };
  return { db, state };
});

vi.mock('@/lib/db', () => ({ db }));
vi.mock('@/lib/auth', () => ({ requireAuth: vi.fn(), requireCompanyTenant: vi.fn() }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }));

import { resolveAudience } from './notification-audience';
import { createNotification } from './notification';

const C = 'c1';
const A = 'store-a';
const B = 'store-b';
const SY_STORE = 'store-sy';

const grants = (...keys: string[]) => keys.map((permission) => ({ permission, scope: 'ALL_COMPANY', scopeIds: null }));
const user = (id: string, role: string, over: Record<string, unknown> = {}) => ({
  id, name: id, email: `${id}@x.test`, role, roleId: null, status: 'ACTIVE', companyId: C, ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  state.roleRows = {
    CONFIRMATION_SUPERVISOR: grants('confirmation.supervise', 'confirmation.work', 'orders.view'),
    MANAGER: grants('confirmation.supervise', 'geo.manage', 'orders.view', 'ops.track'),
    CONFIRMATION_AGENT: grants('confirmation.work', 'confirmation.pull', 'orders.view'),
    MODERATOR: grants('orders.view', 'orders.create'),
    WAREHOUSE: grants('ops.returns', 'inventory.view'),
  };
  state.users = [
    user('sup', 'CONFIRMATION_SUPERVISOR'),
    user('supB', 'CONFIRMATION_SUPERVISOR'),
    user('mgr', 'MANAGER'),
    user('agent', 'CONFIRMATION_AGENT'),
    user('mod', 'MODERATOR'),
    user('denied', 'CONFIRMATION_SUPERVISOR'),
    user('allowed', 'WAREHOUSE'),
    user('wh', 'WAREHOUSE'),
    user('abroad', 'CONFIRMATION_SUPERVISOR'),
    user('gone', 'CONFIRMATION_SUPERVISOR', { status: 'SUSPENDED' }),
    user('elsewhere', 'CONFIRMATION_SUPERVISOR', { companyId: 'c2' }),
  ];
  state.overrides = [
    { userId: 'denied', permission: 'confirmation.supervise', effect: 'DENY', scope: null, scopeIds: null },
    { userId: 'allowed', permission: 'confirmation.supervise', effect: 'ALLOW', scope: null, scopeIds: null },
  ];
  state.stores = [
    { id: A, companyId: C, countryId: 'jo' },
    { id: B, companyId: C, countryId: 'jo' },
    { id: SY_STORE, companyId: C, countryId: 'sy' },
  ];
  state.countryAccess = ['sup', 'supB', 'agent', 'mod', 'denied', 'allowed', 'wh', 'gone', 'elsewhere']
    .map((userId) => ({ userId, countryId: 'jo' }))
    .concat([{ userId: 'abroad', countryId: 'sy' }]);
  state.storeAccess = [
    { userId: 'sup', storeId: A },
    { userId: 'supB', storeId: B },
    { userId: 'mod', storeId: A },
  ];
  state.written = [];
});

const ids = (users: { id: string }[]) => users.map((u) => u.id).sort();

describe('resolveAudience — permission and store reach', () => {
  it('is the holders of the permission who can enter the store', async () => {
    const users = await resolveAudience({ companyId: C, storeId: A, audience: { permission: 'confirmation.supervise' } });
    // sup: narrowed to A. mgr: geo.manage reaches every store. allowed: an
    // ALLOW override on a warehouse role, no narrowing in Jordan.
    expect(ids(users)).toEqual(['allowed', 'mgr', 'sup']);
  });

  it('leaves out a supervisor narrowed to another store', async () => {
    const users = await resolveAudience({ companyId: C, storeId: A, audience: { permission: 'confirmation.supervise' } });
    expect(ids(users)).not.toContain('supB');
    const inB = await resolveAudience({ companyId: C, storeId: B, audience: { permission: 'confirmation.supervise' } });
    expect(ids(inB)).toEqual(['allowed', 'mgr', 'supB']);
  });

  it('leaves out a supervisor whose permission is DENIED for them', async () => {
    const users = await resolveAudience({ companyId: C, storeId: A, audience: { permission: 'confirmation.supervise' } });
    expect(ids(users)).not.toContain('denied');
  });

  it('leaves out a supervisor with no access to the store\'s country', async () => {
    const users = await resolveAudience({ companyId: C, storeId: A, audience: { permission: 'confirmation.supervise' } });
    expect(ids(users)).not.toContain('abroad');
  });

  it('never includes an inactive user, even one named explicitly', async () => {
    const users = await resolveAudience({ companyId: C, storeId: A, audience: { permission: 'confirmation.supervise', userIds: ['gone'] } });
    expect(ids(users)).not.toContain('gone');
    expect(db.user.findMany.mock.calls[0][0].where).toMatchObject({ companyId: C, status: 'ACTIVE' });
  });

  it('never includes another company\'s user, even one named explicitly', async () => {
    const users = await resolveAudience({ companyId: C, storeId: A, audience: { userIds: ['elsewhere'] } });
    expect(users).toEqual([]);
  });

  it('leaves out the actor, even when named and holding the permission', async () => {
    const users = await resolveAudience({
      companyId: C, storeId: A, actorId: 'sup',
      audience: { permission: 'confirmation.supervise', userIds: ['sup'] },
    });
    expect(ids(users)).toEqual(['allowed', 'mgr']);
  });

  it('lists a person once however many ways they qualify', async () => {
    const users = await resolveAudience({
      companyId: C, storeId: A,
      audience: { permission: 'confirmation.supervise', userIds: ['sup', 'sup', 'mgr', null, undefined] },
    });
    expect(ids(users)).toEqual(['allowed', 'mgr', 'sup']);
  });

  it('includes a named person without the permission, if they can enter the store', async () => {
    expect(ids(await resolveAudience({ companyId: C, storeId: A, audience: { userIds: ['mod'] } }))).toEqual(['mod']);
    // …and not when they cannot: mod is narrowed to store A.
    expect(await resolveAudience({ companyId: C, storeId: B, audience: { userIds: ['mod'] } })).toEqual([]);
  });

  it('with no store (company-wide news) applies no store filter', async () => {
    const users = await resolveAudience({ companyId: C, storeId: null, audience: { permission: 'confirmation.supervise' } });
    expect(ids(users)).toEqual(['abroad', 'allowed', 'mgr', 'sup', 'supB']);
    expect(db.store.findFirst).not.toHaveBeenCalled();
  });

  it('a store of another company reaches nobody', async () => {
    const users = await resolveAudience({ companyId: C, storeId: 'foreign-store', audience: { permission: 'confirmation.supervise' } });
    expect(users).toEqual([]);
  });

  it('an empty audience asks the database nothing', async () => {
    expect(await resolveAudience({ companyId: C, storeId: A, audience: {} })).toEqual([]);
    expect(await resolveAudience({ companyId: C, storeId: A, audience: { userIds: [null] } })).toEqual([]);
    expect(db.user.findMany).not.toHaveBeenCalled();
  });

  it('costs a bounded number of queries: one per distinct role, not two per user', async () => {
    await resolveAudience({ companyId: C, storeId: A, audience: { permission: 'confirmation.supervise' } });
    expect(db.user.findMany).toHaveBeenCalledTimes(1);
    expect(db.userPermission.findMany).toHaveBeenCalledTimes(1);
    // Nine active candidates in c1, five distinct roles among them.
    expect(db.rolePermission.findMany).toHaveBeenCalledTimes(5);
    expect(db.userCountryAccess.findMany).toHaveBeenCalledTimes(1);
    expect(db.userStoreAccess.findMany).toHaveBeenCalledTimes(1);
  });
});

describe('createNotification — one row per recipient', () => {
  const base = { companyId: C, title: 'طلب جديد', message: 'تم إنشاء طلب جديد', type: 'ORDER_NEW' as const };

  it('writes one row per recipient, each carrying the store, in one query', async () => {
    const n = await createNotification({ ...base, storeId: A, audience: { permission: 'confirmation.supervise' } });
    expect(n).toBe(3);
    expect(db.notification.createMany).toHaveBeenCalledTimes(1);
    expect(state.written.map((r) => r.userId).sort()).toEqual(['allowed', 'mgr', 'sup']);
    for (const row of state.written) {
      expect(row).toMatchObject({ companyId: C, storeId: A, title: 'طلب جديد', type: 'ORDER_NEW' });
    }
  });

  it('never writes a shared (userId null) row', async () => {
    await createNotification({ ...base, storeId: A, audience: { permission: 'confirmation.supervise', userIds: [null] } });
    expect(state.written.every((r) => typeof r.userId === 'string')).toBe(true);
  });

  it('deduplicates recipients and leaves out the actor', async () => {
    await createNotification({
      ...base, storeId: A, actorId: 'mgr',
      audience: { permission: 'confirmation.supervise', userIds: ['sup', 'sup', 'mgr'] },
    });
    expect(state.written.map((r) => r.userId).sort()).toEqual(['allowed', 'sup']);
  });

  it('gives each recipient the first link they may open, and none rather than a 403', async () => {
    await createNotification({
      ...base, storeId: A,
      audience: { userIds: ['agent', 'mod', 'wh'] },
      link: ['/confirmation/queue', '/orders'],
    });
    const linkOf = Object.fromEntries(state.written.map((r) => [r.userId, r.link]));
    expect(linkOf).toEqual({
      agent: '/confirmation/queue', // confirmation.pull opens the queue
      mod: '/orders', // a moderator cannot open the queue, can open his orders
      wh: null, // neither: no link at all
    });
  });

  it('a link outside the route registry is never handed out', async () => {
    await createNotification({ ...base, storeId: A, audience: { userIds: ['sup'] }, link: '/orders?highlight=o1' });
    expect(state.written[0].link).toBe('/orders?highlight=o1'); // the path is a real, open screen
    state.written = [];
    await createNotification({ ...base, storeId: A, audience: { userIds: ['sup'] }, link: '/nowhere' });
    expect(state.written[0].link).toBeNull();
  });

  it('writes nothing when nobody qualifies', async () => {
    const n = await createNotification({ ...base, storeId: A, audience: { permission: 'finance.cashbox' } });
    expect(n).toBe(0);
    expect(db.notification.createMany).not.toHaveBeenCalled();
  });

  it('never throws: a failing lookup answers 0 and writes nothing', async () => {
    db.user.findMany.mockRejectedValueOnce(new Error('db down'));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(createNotification({ ...base, storeId: A, audience: { permission: 'confirmation.supervise' } })).resolves.toBe(0);
    expect(db.notification.createMany).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('never throws: a failing write answers 0', async () => {
    db.notification.createMany.mockRejectedValueOnce(new Error('db down'));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(createNotification({ ...base, storeId: A, audience: { userIds: ['sup'] } })).resolves.toBe(0);
    spy.mockRestore();
  });
});
