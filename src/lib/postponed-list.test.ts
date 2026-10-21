import { describe, expect, it, vi } from 'vitest';
import { POSTPONED_ORDER_BY, NO_AGENT, NO_AGENT_AR, WHENS, whenWhere } from './postponed-filters';
import { WAITING_STATUSES, postponedFacts, postponedScope, readPostponedPage } from './postponed-list';

/**
 * THE QUERIES BEHIND THE POSTPONED LIST — THE SCOPE IS NEVER A FILTER.
 *
 * What a person may see is decided before anything they chose is read, and no
 * choice can widen it: every clause is ANDed onto the scope, and the numbers
 * printed beside the options are asked of the scope alone. A fake client is
 * enough to hold that, because the thing to hold is what was ASKED.
 */

const NOW = new Date('2026-10-21T12:00:00.000Z');
const LEAD = 2;
const SCOPE = postponedScope({ companyId: 'c1', storeId: 's1' });

type Db = Parameters<typeof readPostponedPage>[0];

/** A client that records what it was asked and answers with what the claim gives it. */
function fakeDb(over: { total?: number; rows?: unknown[]; counts?: (where: unknown) => number; held?: unknown[]; users?: unknown[] } = {}) {
  const db = {
    order: {
      count: vi.fn(async ({ where }: { where: unknown }) => (over.counts ? over.counts(where) : (over.total ?? 0))),
      findMany: vi.fn(async (_args: Record<string, unknown>) => over.rows ?? []),
      groupBy: vi.fn(async (_args: Record<string, unknown>) => over.held ?? []),
    },
    user: { findMany: vi.fn(async (_args: Record<string, unknown>) => over.users ?? []) },
  };
  return { db: db as unknown as Db, spy: db };
}

describe('the scope', () => {
  it('— is the company, the store and the two waiting states; for an agent also her own claim, and for a supervisor not', () => {
    expect(postponedScope({ companyId: 'c1', storeId: 's1' })).toEqual({
      companyId: 'c1',
      storeId: 's1',
      confirmationStatus: { in: ['POSTPONED', 'FOLLOW_UP_REQUIRED'] },
    });
    expect(postponedScope({ companyId: 'c1', storeId: 's1', ownOnly: 'u7' })).toMatchObject({ claimedById: 'u7' });
    expect(WAITING_STATUSES).toEqual(['POSTPONED', 'FOLLOW_UP_REQUIRED']);
  });
});

describe('one page', () => {
  const read = (db: Db, over: Partial<Parameters<typeof readPostponedPage>[1]> = {}) =>
    readPostponedPage(db, { scope: SCOPE, clauses: [], page: 1, limit: 25, select: { id: true }, ...over });

  it('— asks for the scope at the TOP of the question and what the reader chose ANDed on, and counts with the same question', async () => {
    const { db, spy } = fakeDb({ total: 60 });
    const chosen = whenWhere('overdue', NOW, LEAD);
    await read(db, { clauses: [chosen] });
    const where = spy.order.findMany.mock.calls[0][0] as { where: Record<string, unknown> };
    expect(where.where).toMatchObject({ companyId: 'c1', storeId: 's1', confirmationStatus: { in: ['POSTPONED', 'FOLLOW_UP_REQUIRED'] } });
    expect(where.where.AND).toEqual([chosen]);
    expect(spy.order.count.mock.calls[0][0]).toEqual({ where: where.where });
  });

  it('and a filter cannot take the scope away — a clause that names another company is still inside this one', async () => {
    const { db, spy } = fakeDb({ total: 1 });
    await read(db, { clauses: [{ companyId: 'someone-else' }] });
    const where = (spy.order.findMany.mock.calls[0][0] as { where: Record<string, unknown> }).where;
    // The scope's own company is a sibling of the AND, so both must hold — and one of them is impossible.
    expect(where.companyId).toBe('c1');
    expect(where.AND).toEqual([{ companyId: 'someone-else' }]);
  });

  it('and it reads 25 from the start of the page it was asked for, in the order that ends in the id', async () => {
    const { db, spy } = fakeDb({ total: 60 });
    const page = await read(db, { page: 3 });
    expect(spy.order.findMany.mock.calls[0][0]).toMatchObject({ skip: 50, take: 25, orderBy: POSTPONED_ORDER_BY });
    expect(page).toMatchObject({ total: 60, page: 3, limit: 25, totalPages: 3 });
  });

  it('and a page past the end is answered with the LAST page, and says so', async () => {
    const { db, spy } = fakeDb({ total: 60 });
    const page = await read(db, { page: 99 });
    expect(page.page).toBe(3);
    expect(spy.order.findMany.mock.calls[0][0]).toMatchObject({ skip: 50 });
  });

  it('and a page before the start is the first', async () => {
    const { db, spy } = fakeDb({ total: 60 });
    expect((await read(db, { page: 0 })).page).toBe(1);
    expect((await read(db, { page: -4 })).page).toBe(1);
    expect(spy.order.findMany.mock.calls.every(([a]) => (a as { skip: number }).skip === 0)).toBe(true);
  });

  it('and an empty list is one empty page, not «صفحة 1 من 0»', async () => {
    const { db } = fakeDb({ total: 0 });
    expect(await read(db)).toMatchObject({ total: 0, page: 1, totalPages: 1, rows: [] });
  });

  it('and the last page may be short: 60 rows at 25 is three pages', async () => {
    const { db } = fakeDb({ total: 61 });
    expect((await read(db)).totalPages).toBe(3);
  });

  it('and the page size is the caller’s', async () => {
    const { db, spy } = fakeDb({ total: 205 });
    const page = await read(db, { page: 2, limit: 100 });
    expect(spy.order.findMany.mock.calls[0][0]).toMatchObject({ skip: 100, take: 100 });
    expect(page.totalPages).toBe(3);
  });
});

describe('the numbers beside the options', () => {
  const facts = (db: Db, supervisor = true) => postponedFacts(db, { scope: SCOPE, supervisor, now: NOW, leadDays: LEAD });

  it('— are asked of the scope ALONE: no filter the reader chose is in any of them', async () => {
    const { db, spy } = fakeDb({ total: 7 });
    await facts(db);
    for (const [arg] of spy.order.count.mock.calls) {
      expect((arg as { where: Record<string, unknown> }).where).toMatchObject({ companyId: 'c1', storeId: 's1' });
    }
    // Total, five moments, two kinds, two counts: ten.
    expect(spy.order.count).toHaveBeenCalledTimes(10);
  });

  it('and each moment is counted by the SAME definition the list filters by', async () => {
    const { db, spy } = fakeDb({ total: 0 });
    await facts(db);
    const asked = spy.order.count.mock.calls.map(([a]) => JSON.stringify((a as { where: { AND: unknown[] } }).where.AND[0]));
    for (const w of WHENS) expect(asked).toContain(JSON.stringify(whenWhere(w, NOW, LEAD)));
  });

  it('and they come back keyed by the word, the total included', async () => {
    let n = 0;
    const { db } = fakeDb({ counts: () => ++n });
    const f = await facts(db, false);
    expect(Object.keys(f.whens)).toEqual([...WHENS]);
    expect(Object.keys(f.kinds)).toEqual(['postponed', 'followup']);
    expect(Object.keys(f.times)).toEqual(['once', 'many']);
    expect(f.total).toBeGreaterThan(0);
  });

  it('and an agent is told nothing of whose hands — no grouping query is even made, no names looked up', async () => {
    const { db, spy } = fakeDb({ held: [{ claimedById: 'u9', _count: { _all: 4 } }] });
    const f = await facts(db, false);
    expect(f.agents).toBeNull();
    expect(spy.order.groupBy).not.toHaveBeenCalled();
    expect(spy.user.findMany).not.toHaveBeenCalled();
  });

  it('and a supervisor is, biggest first, with the names; the ones handed back to the pool are «nobody»', async () => {
    const { db, spy } = fakeDb({
      held: [
        { claimedById: 'u1', _count: { _all: 2 } },
        { claimedById: null, _count: { _all: 5 } },
        { claimedById: 'u2', _count: { _all: 9 } },
      ],
      users: [{ id: 'u1', name: 'سارة' }, { id: 'u2', name: 'خالد' }],
    });
    const f = await facts(db);
    expect(f.agents).toEqual([
      { id: 'u2', name: 'خالد', count: 9 },
      { id: NO_AGENT, name: NO_AGENT_AR, count: 5 },
      { id: 'u1', name: 'سارة', count: 2 },
    ]);
    // Grouped over the scope, and only the people who hold something are looked up.
    expect(spy.order.groupBy.mock.calls[0][0]).toMatchObject({ by: ['claimedById'], where: SCOPE });
    expect(spy.user.findMany.mock.calls[0][0]).toMatchObject({ where: { id: { in: ['u1', 'u2'] } } });
  });

  it('and nobody holding anything looks up nobody', async () => {
    const { db, spy } = fakeDb({ held: [{ claimedById: null, _count: { _all: 3 } }] });
    const f = await facts(db);
    expect(f.agents).toEqual([{ id: NO_AGENT, name: NO_AGENT_AR, count: 3 }]);
    expect(spy.user.findMany).not.toHaveBeenCalled();
  });

  it('and equal counts keep a stable order — two agents with four each never swap between loads', async () => {
    const u1 = { claimedById: 'u1', _count: { _all: 4 } };
    const u2 = { claimedById: 'u2', _count: { _all: 4 } };
    // Whichever order the database happens to return them in, the names decide.
    for (const held of [[u2, u1], [u1, u2]]) {
      const { db } = fakeDb({ held, users: [{ id: 'u1', name: 'ب' }, { id: 'u2', name: 'أ' }] });
      expect((await facts(db)).agents!.map((a) => a.name)).toEqual(['أ', 'ب']);
    }
  });
});
