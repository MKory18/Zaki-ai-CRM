import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * THE BELL SHOWS YOUR NOTIFICATIONS, IN YOUR STORE, AND NOTHING ELSE.
 *
 * Prisma is replaced by a table in memory that evaluates the route's own
 * where clause, so these tests assert what comes BACK — which rows, which
 * count, which rows change — rather than the shape of a query. The leak
 * this replaces returned more rows than it should and looked like working
 * software; only an answer-level test catches that.
 */

type Row = {
  id: string;
  companyId: string;
  userId: string | null;
  storeId: string | null;
  isRead: boolean;
  createdAt: Date;
};

const { db, table, requireContext, can } = vi.hoisted(() => {
  const table: { rows: Row[] } = { rows: [] };

  // The subset of Prisma's where the route uses: equality, OR, AND.
  const matches = (row: any, where: any): boolean =>
    Object.entries(where ?? {}).every(([k, v]) => {
      if (k === 'OR') return (v as any[]).some((w) => matches(row, w));
      if (k === 'AND') return (v as any[]).every((w) => matches(row, w));
      if (v !== null && typeof v === 'object') throw new Error(`unsupported filter on ${k}`);
      return row[k] === v;
    });

  const db = {
    notification: {
      findMany: vi.fn(async ({ where, take }: any) =>
        table.rows
          .filter((r) => matches(r, where))
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
          .slice(0, take ?? Infinity)
      ),
      count: vi.fn(async ({ where }: any) => table.rows.filter((r) => matches(r, where)).length),
      updateMany: vi.fn(async ({ where, data }: any) => {
        const hit = table.rows.filter((r) => matches(r, where));
        for (const r of hit) Object.assign(r, data);
        return { count: hit.length };
      }),
    },
  };
  return { db, table, requireContext: vi.fn(), can: vi.fn() };
});

vi.mock('@/lib/db', () => ({ db }));
vi.mock('@/lib/geo-context', () => ({ requireContext: (...a: unknown[]) => requireContext(...a) }));
vi.mock('@/lib/authorization', () => ({ can: (...a: unknown[]) => can(...a) }));

import { GET, PATCH } from './route';

const ME = 'u-me';
const OTHER = 'u-other';
const C = 'c1';
const A = 'store-a';
const B = 'store-b';

const row = (id: string, over: Partial<Row>): Row => ({
  id, companyId: C, userId: ME, storeId: A, isRead: false, createdAt: new Date(Date.UTC(2026, 8, 24, 10, 0, Number(id.replace(/\D/g, '')) || 0)),
  ...over,
});

function seed() {
  table.rows = [
    row('n1', {}), // mine, this store, unread
    row('n2', { storeId: B }), // mine, another store
    row('n3', { userId: OTHER }), // someone else's, this store
    row('n4', { storeId: null }), // mine, company-wide (a wallet with no store)
    row('n5', { userId: null, storeId: null }), // legacy broadcast
    row('n6', { isRead: true }), // mine, already read
    row('n7', { companyId: 'c2' }), // another company
  ];
}

const asUser = (supervisor: boolean) => {
  const user = { id: ME, role: supervisor ? 'CONFIRMATION_SUPERVISOR' : 'MODERATOR', status: 'ACTIVE' };
  requireContext.mockResolvedValue({ user, companyId: C, storeId: A });
  can.mockImplementation((_u: unknown, p: string) => supervisor && p === 'confirmation.supervise');
};

const get = async (qs = '') => {
  const res = await GET(new Request(`http://localhost/api/notifications${qs}`));
  return { status: res.status, body: await res.json() };
};
const patch = async (body: unknown) => {
  const res = await PATCH(
    new Request('http://localhost/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  );
  return { status: res.status, body: await res.json() };
};
const readIds = () => table.rows.filter((r) => r.isRead).map((r) => r.id).sort();

beforeEach(() => {
  vi.clearAllMocks();
  seed();
  asUser(false);
});

describe('GET — what a person sees', () => {
  it('only their own rows, in the selected store or about no store', async () => {
    const { status, body } = await get();
    expect(status).toBe(200);
    expect(body.notifications.map((n: Row) => n.id).sort()).toEqual(['n1', 'n4', 'n6']);
  });

  it('never another user\'s row', async () => {
    const { body } = await get();
    expect(body.notifications.every((n: Row) => n.userId === ME)).toBe(true);
  });

  it('never their own row of another store', async () => {
    const { body } = await get();
    expect(body.notifications.map((n: Row) => n.id)).not.toContain('n2');
  });

  it('never a legacy shared row, for anyone who is not a supervisor', async () => {
    const { body } = await get();
    expect(body.notifications.map((n: Row) => n.id)).not.toContain('n5');
    expect((await get('?countOnly=1')).body.unreadCount).toBe(2);
  });

  it('a confirmation supervisor still sees the legacy shared rows', async () => {
    asUser(true);
    const { body } = await get();
    expect(body.notifications.map((n: Row) => n.id).sort()).toEqual(['n1', 'n4', 'n5', 'n6']);
    expect(body.unreadCount).toBe(3);
  });

  it('the list\'s unread count and the poll\'s count agree, beyond the 50 listed', async () => {
    table.rows = Array.from({ length: 60 }, (_, i) => row(`m${i}`, {}));
    const list = await get();
    const poll = await get('?countOnly=1');
    expect(list.body.notifications).toHaveLength(50);
    expect(list.body.unreadCount).toBe(60);
    expect(poll.body.unreadCount).toBe(60);
  });

  it('needs a selected store (400), rather than widening to the company', async () => {
    // What requireContext throws with no store selected (see geo-context).
    const noStore = Object.assign(new Error('A store must be selected'), { name: 'ContextError', code: 'STORE_REQUIRED' });
    requireContext.mockRejectedValue(noStore);
    expect((await get()).status).toBe(400);
    expect(db.notification.findMany).not.toHaveBeenCalled();
  });
});

describe('PATCH — what a person may mark read', () => {
  it('marks their own row', async () => {
    expect((await patch({ notificationId: 'n1' })).status).toBe(200);
    expect(readIds()).toEqual(['n1', 'n6']);
  });

  it('cannot mark another user\'s row (404, untouched)', async () => {
    expect((await patch({ notificationId: 'n3' })).status).toBe(404);
    expect(readIds()).toEqual(['n6']);
  });

  it('cannot mark another company\'s row', async () => {
    expect((await patch({ notificationId: 'n7' })).status).toBe(404);
    expect(readIds()).toEqual(['n6']);
  });

  it('a non-supervisor cannot mark a legacy shared row read for everybody', async () => {
    expect((await patch({ notificationId: 'n5' })).status).toBe(404);
    expect(readIds()).toEqual(['n6']);
  });

  it('a supervisor may mark a legacy shared row', async () => {
    asUser(true);
    expect((await patch({ notificationId: 'n5' })).status).toBe(200);
    expect(readIds()).toEqual(['n5', 'n6']);
  });

  it('mark-all touches only their own rows in this store', async () => {
    expect((await patch({ markAllRead: true })).status).toBe(200);
    // n2 (mine, other store), n3 (someone else's), n5 (legacy), n7 (other
    // company) all stay unread.
    expect(readIds()).toEqual(['n1', 'n4', 'n6']);
  });

  it('a supervisor\'s mark-all also covers the legacy rows, and still nobody else\'s', async () => {
    asUser(true);
    await patch({ markAllRead: true });
    expect(readIds()).toEqual(['n1', 'n4', 'n5', 'n6']);
  });

  it('refuses a body that is neither of the two shapes (400)', async () => {
    for (const bad of [{}, { markAllRead: false }, { notificationId: 5 }, { notificationId: '' }, { notificationId: 'n1', userId: OTHER }]) {
      const res = await patch(bad);
      expect(res.status, JSON.stringify(bad)).toBe(400);
    }
    expect(db.notification.updateMany).not.toHaveBeenCalled();
  });
});
