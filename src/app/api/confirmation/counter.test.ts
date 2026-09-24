import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The header counter: a number, never a list.
 *
 * The confirmation agent sees how many orders wait in her pool. The
 * moderator sees how many of HIS orders are still unconfirmed — and cannot
 * turn that into a view of anybody else's, or of the pool (whose own route
 * refuses him with 403, tested beside the pull route).
 */

const { db, requireContext, can } = vi.hoisted(() => ({
  db: { order: { count: vi.fn() } },
  requireContext: vi.fn(),
  can: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ db }));
vi.mock('@/lib/geo-context', () => ({ requireContext: (...a: unknown[]) => requireContext(...a) }));
vi.mock('@/lib/authorization', () => ({ can: (...a: unknown[]) => can(...a) }));

import { GET } from '@/app/api/confirmation/counter/route';
import { counterKindFor } from '@/lib/confirmation-queue';

function as(id: string, holds: string[]) {
  requireContext.mockResolvedValue({ user: { id, role: 'X' }, companyId: 'c1', storeId: 's1' });
  can.mockImplementation((_u: unknown, key: string) => holds.includes(key));
}

beforeEach(() => {
  vi.clearAllMocks();
  db.order.count.mockResolvedValue(7);
});

describe('counterKindFor', () => {
  it('gives the pool to whoever may pull, even if they also create', () => {
    expect(counterKindFor({ pull: true, create: true })).toBe('POOL');
  });
  it('gives a moderator his own', () => {
    expect(counterKindFor({ pull: false, create: true })).toBe('MINE');
  });
  it('gives nothing to somebody for whom neither number means anything', () => {
    expect(counterKindFor({ pull: false, create: false })).toBeNull();
  });
});

describe('the confirmation agent', () => {
  it('sees the pool she pulls from', async () => {
    as('agent', ['confirmation.pull']);
    const body = await (await GET()).json();
    expect(body).toEqual({ kind: 'POOL', count: 7 });
    const where = db.order.count.mock.calls[0][0].where;
    expect(where.claimedById).toBeNull();
    expect(where.moderatorId).toBeUndefined();
  });
});

describe('the moderator', () => {
  it('sees a count of HIS orders not yet confirmed', async () => {
    as('mod-1', ['orders.create']);
    const body = await (await GET()).json();
    expect(body).toEqual({ kind: 'MINE', count: 7 });
    const where = db.order.count.mock.calls[0][0].where;
    expect(where.moderatorId).toBe('mod-1');
    expect(where.companyId).toBe('c1');
    expect(where.storeId).toBe('s1');
    expect(where.confirmationStatus.in).toEqual(expect.arrayContaining(['NEW', 'NO_ANSWER', 'POSTPONED']));
    expect(where.confirmationStatus.in).not.toContain('CONFIRMED');
  });

  it('receives a number and nothing that identifies an order', async () => {
    // Negative: the counter must never become the list by another door.
    as('mod-1', ['orders.create']);
    const body = await (await GET()).json();
    expect(Object.keys(body).sort()).toEqual(['count', 'kind']);
    expect(db.order.count).toHaveBeenCalledTimes(1);
  });

  it('is always counted for himself — the route takes no one else\'s id', async () => {
    // GET takes no request at all; there is nothing to point elsewhere.
    as('mod-1', ['orders.create']);
    await GET();
    expect(db.order.count.mock.calls[0][0].where.moderatorId).toBe('mod-1');
    expect(GET.length).toBe(0);
  });

  it('is never shown the pool', async () => {
    as('mod-1', ['orders.create']);
    await GET();
    expect(db.order.count.mock.calls[0][0].where.claimedById).toBeUndefined();
  });
});

describe('everyone else', () => {
  it('gets no counter, and costs no query', async () => {
    as('acct', ['finance.view']);
    const body = await (await GET()).json();
    expect(body).toEqual({ kind: null, count: 0 });
    expect(db.order.count).not.toHaveBeenCalled();
  });
});
