import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * THE BELL SHOWS YOUR NOTIFICATIONS, IN YOUR STORE, AND NOTHING ELSE.
 *
 * Prisma is replaced by a table in memory that evaluates the route's own
 * where clause, so these tests assert what comes BACK — which rows, which
 * count, which rows change — rather than the shape of a query. The leak
 * this replaces returned more rows than it should and looked like working
 * software; only an answer-level test catches that.
 *
 * Rows from before stage 17 (no recipient, no store) are history: read-only,
 * never counted, and shown only to someone who sees every store and holds
 * the permission that kind of news belongs to.
 */

type Row = {
  id: string;
  companyId: string;
  userId: string | null;
  storeId: string | null;
  type: string;
  isRead: boolean;
  createdAt: Date;
};

const { db, table, requireContext, can, seesAll } = vi.hoisted(() => {
  const table: { rows: Row[] } = { rows: [] };

  // The subset of Prisma's where the route uses: equality, OR, AND, { in }.
  const matches = (row: any, where: any): boolean =>
    Object.entries(where ?? {}).every(([k, v]) => {
      if (k === 'OR') return (v as any[]).some((w) => matches(row, w));
      if (k === 'AND') return (v as any[]).every((w) => matches(row, w));
      if (v !== null && typeof v === 'object') {
        if (Array.isArray((v as any).in)) return (v as any).in.includes(row[k]);
        throw new Error(`unsupported filter on ${k}`);
      }
      return row[k] === v;
    });

  const db = {
    notification: {
      findMany: vi.fn(async ({ where, take }: any) =>
        table.rows
          .filter((r) => matches(r, where))
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
          .slice(0, take ?? Infinity)
          .map((r) => ({ ...r }))
      ),
      count: vi.fn(async ({ where }: any) => table.rows.filter((r) => matches(r, where)).length),
      updateMany: vi.fn(async ({ where, data }: any) => {
        const hit = table.rows.filter((r) => matches(r, where));
        for (const r of hit) Object.assign(r, data);
        return { count: hit.length };
      }),
    },
  };
  return { db, table, requireContext: vi.fn(), can: vi.fn(), seesAll: vi.fn() };
});

vi.mock('@/lib/db', () => ({ db }));
vi.mock('@/lib/geo-context', () => {
  class ContextError extends Error {
    constructor(readonly code: string, message: string) {
      super(message);
    }
  }
  return {
    ContextError,
    requireContext: (...a: unknown[]) => requireContext(...a),
    seesAllCountries: (...a: unknown[]) => seesAll(...a),
  };
});
vi.mock('@/lib/authorization', () => ({ can: (...a: unknown[]) => can(...a) }));

import { GET, PATCH } from './route';
import { ContextError } from '@/lib/geo-context';

const ME = 'u-me';
const OTHER = 'u-other';
const C = 'c1';
const A = 'store-a';
const B = 'store-b';

const row = (id: string, over: Partial<Row>): Row => ({
  id, companyId: C, userId: ME, storeId: A, type: 'ORDER_NEW', isRead: false,
  createdAt: new Date(Date.UTC(2026, 8, 24, 10, 0, Number(id.replace(/\D/g, '')) || 0)),
  ...over,
});

function seed() {
  table.rows = [
    row('n1', {}), // mine, this store, unread
    row('n2', { storeId: B }), // mine, another store
    row('n3', { userId: OTHER }), // someone else's, this store
    row('n4', { storeId: null }), // mine, about no store
    row('n5', { userId: null, storeId: null, type: 'ORDER_NEW' }), // legacy broadcast — confirmation news
    row('n6', { isRead: true }), // mine, already read
    row('n7', { companyId: 'c2' }), // another company
    row('n8', { userId: null, storeId: null, type: 'CLOSING_DUE' }), // legacy broadcast — finance news
  ];
}

/** holds: the permissions this person has; everywhere: sees every store. */
function as(holds: string[], everywhere = false) {
  requireContext.mockResolvedValue({ companyId: C, storeId: A, user: { id: ME, role: 'X' } });
  can.mockImplementation((_u: unknown, key: string) => holds.includes(key));
  seesAll.mockReturnValue(everywhere);
}

const get = async (q = '') => (await GET(new Request(`http://localhost/api/notifications${q}`))).json();
const patch = (body: unknown) =>
  PATCH(new Request('http://localhost/api/notifications', { method: 'PATCH', body: JSON.stringify(body) }));
const ids = (list: { id: string }[]) => list.map((n) => n.id).sort();

beforeEach(() => {
  vi.clearAllMocks();
  seed();
  as([]);
});

describe('GET — what a person sees', () => {
  it('only their own rows, in the selected store or about no store', async () => {
    const body = await get();
    expect(ids(body.notifications)).toEqual(['n1', 'n4', 'n6']);
    expect(body.unreadCount).toBe(2);
  });

  it('never another user’s row, another store’s row, or another company’s', async () => {
    const seen = ids((await get()).notifications);
    expect(seen).not.toContain('n3');
    expect(seen).not.toContain('n2');
    expect(seen).not.toContain('n7');
  });

  it('never a legacy row for a supervisor limited to some stores — it could be about any of them', async () => {
    as(['confirmation.supervise', 'finance.cashbox'], false);
    const seen = ids((await get()).notifications);
    expect(seen).not.toContain('n5');
    expect(seen).not.toContain('n8');
  });

  it('shows legacy rows to someone who sees every store, only of the kinds their permissions cover', async () => {
    as(['confirmation.supervise'], true);
    const seen = ids((await get()).notifications);
    expect(seen).toContain('n5'); // confirmation news
    expect(seen).not.toContain('n8'); // finance news — needs finance.cashbox
  });

  it('shows history as read, and never counts it', async () => {
    as(['confirmation.supervise', 'finance.cashbox'], true);
    const body = await get();
    const legacy = body.notifications.filter((n: Row) => n.userId === null);
    expect(legacy.length).toBe(2);
    expect(legacy.every((n: Row) => n.isRead)).toBe(true);
    expect(body.unreadCount).toBe(2); // n1, n4 — own rows only
  });

  it('the poll’s count and the list’s count agree, beyond the 50 listed', async () => {
    table.rows = Array.from({ length: 70 }, (_, i) => row(`m${i}`, {}));
    const list = await get();
    const poll = await get('?countOnly=1');
    expect(list.notifications.length).toBe(50);
    expect(list.unreadCount).toBe(70);
    expect(poll.unreadCount).toBe(70);
  });

  it('answers an empty bell, not an error, when no store is selected — a poll must never redirect the tab', async () => {
    requireContext.mockRejectedValue(new ContextError('STORE_REQUIRED', 'A store must be selected'));
    const poll = await GET(new Request('http://localhost/api/notifications?countOnly=1'));
    expect(poll.status).toBe(200);
    expect(await poll.json()).toEqual({ unreadCount: 0 });
    const list = await GET(new Request('http://localhost/api/notifications'));
    expect(await list.json()).toEqual({ notifications: [], unreadCount: 0 });
  });

  it('still fails for anything that is not a missing store', async () => {
    requireContext.mockRejectedValue(new Error('Unauthorized'));
    const res = await GET(new Request('http://localhost/api/notifications'));
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});

describe('PATCH — what a person may mark', () => {
  it('marks one of their own rows', async () => {
    const res = await patch({ notificationId: 'n1' });
    expect(res.status).toBe(200);
    expect(table.rows.find((r) => r.id === 'n1')!.isRead).toBe(true);
  });

  it('cannot mark another user’s row — it reads as not found', async () => {
    const res = await patch({ notificationId: 'n3' });
    expect(res.status).toBe(404);
    expect(table.rows.find((r) => r.id === 'n3')!.isRead).toBe(false);
  });

  it('cannot mark a legacy row, not even as a supervisor who sees every store — its one flag was everybody’s', async () => {
    as(['confirmation.supervise', 'finance.cashbox'], true);
    const res = await patch({ notificationId: 'n5' });
    expect(res.status).toBe(404);
    expect(table.rows.find((r) => r.id === 'n5')!.isRead).toBe(false);
  });

  it('mark-all touches only their own rows in this store, and never history or anybody else', async () => {
    as(['confirmation.supervise', 'finance.cashbox'], true);
    await patch({ markAllRead: true });
    const read = (id: string) => table.rows.find((r) => r.id === id)!.isRead;
    expect(read('n1')).toBe(true);
    expect(read('n4')).toBe(true);
    expect(read('n2')).toBe(false); // mine, but another store
    expect(read('n3')).toBe(false); // someone else's
    expect(read('n5')).toBe(false); // history
    expect(read('n8')).toBe(false); // history
    expect(read('n7')).toBe(false); // another company
  });

  it('refuses a body that names nothing', async () => {
    expect((await patch({})).status).toBe(400);
    expect((await patch({ notificationId: '' })).status).toBe(400);
    expect((await patch({ markAllRead: false })).status).toBe(400);
  });
});
