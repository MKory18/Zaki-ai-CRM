import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * THE POSTPONED LIST, READ IN PAGES — WITH WHAT THE READER CHOSE.
 *
 * «الطلبات المؤجلة — اعملو صفحات + فلاتر + بحث». The route used to answer the
 * first three hundred rows, whole. What is held here is the door: what it asks
 * for, who it asks it for, what it refuses, and what it sends back — above all
 * that no choice in the address can widen what the person is allowed to see.
 */

const { db, requireContext, requirePermission, can, noteCustomersHandedOut } = vi.hoisted(() => ({
  db: {
    order: { findMany: vi.fn(), count: vi.fn(), groupBy: vi.fn() },
    user: { findMany: vi.fn() },
  },
  requireContext: vi.fn(),
  requirePermission: vi.fn(),
  can: vi.fn(),
  noteCustomersHandedOut: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ db }));
vi.mock('@/lib/geo-context', () => ({ requireContext: (...a: unknown[]) => requireContext(...a) }));
vi.mock('@/lib/authorization', () => ({
  requirePermission: (...a: unknown[]) => requirePermission(...a),
  can: (...a: unknown[]) => can(...a),
}));
vi.mock('@/lib/audit', () => ({ logAudit: vi.fn() }));
vi.mock('@/lib/pii-alert', () => ({ noteCustomersHandedOut: (...a: unknown[]) => noteCustomersHandedOut(...a) }));

import { GET } from './postponed/route';
import { POSTPONE_LEAD_DAYS } from '@/lib/confirmation-queue';

const DAY = 86_400_000;
const USER = { id: 'u1', name: 'سارة', role: 'CONFIRMATION_AGENT', status: 'ACTIVE' };
const OTHER = '3d0e4a28-5c2f-4a4b-9a45-0f9f4b6c1d21';

const get = (query = '') => GET(new Request(`http://localhost/api/confirmation/postponed${query ? `?${query}` : ''}`));
const asked = () => db.order.findMany.mock.calls.at(-1)![0] as { where: Record<string, any>; skip: number; take: number; orderBy: unknown[] };

const order = (over: Record<string, unknown> = {}) => ({
  id: 'o1', orderNumber: 'ORD-1', merchantRef: null, totalAmount: 10, currency: 'USD',
  postponedUntil: null, postponePreferredTime: null, postponeCount: 1,
  nextFollowUpAt: null, followUpReason: null, claimedById: 'u1',
  customer: { id: 'c1', fullName: 'عميل', phone: '0790000000', city: 'عمّان' }, claimer: { id: 'u1', name: 'سارة' },
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  requireContext.mockResolvedValue({ user: USER, companyId: 'c1', storeId: 's1' });
  requirePermission.mockResolvedValue({});
  can.mockReturnValue(true); // a supervisor, unless a claim says otherwise
  db.order.findMany.mockResolvedValue([]);
  db.order.count.mockResolvedValue(0);
  db.order.groupBy.mockResolvedValue([]);
  db.user.findMany.mockResolvedValue([]);
});

describe('what it asks for', () => {
  it('— with nothing chosen: this company, this store, the two waiting states, 25 from the start, ending in the id', async () => {
    const res = await get();
    expect(res.status).toBe(200);
    expect(asked().where).toMatchObject({ companyId: 'c1', storeId: 's1', confirmationStatus: { in: ['POSTPONED', 'FOLLOW_UP_REQUIRED'] } });
    expect(asked().where.claimedById).toBeUndefined();
    expect(asked().where.AND).toEqual([]);
    expect(asked()).toMatchObject({ skip: 0, take: 25 });
    expect(asked().orderBy.at(-1)).toEqual({ id: 'asc' });
  });

  it('and an agent’s list is HER OWN, whatever the address says — a value naming somebody else is not obeyed', async () => {
    can.mockReturnValue(false);
    await get(`agent=${OTHER}`);
    expect(asked().where.claimedById).toBe('u1');
    expect(asked().where.AND).toEqual([]); // no clause for the agent that was asked for
    // …and the numbers beside her options are of her own too.
    for (const [arg] of db.order.count.mock.calls) expect(arg.where.claimedById).toBe('u1');
  });

  it('and a supervisor may ask for one agent, or for nobody', async () => {
    await get(`agent=${OTHER}`);
    expect(asked().where.AND).toEqual([{ claimedById: OTHER }]);
    await get('agent=none');
    expect(asked().where.AND).toEqual([{ claimedById: null }]);
  });

  it('and every word chosen is one more thing that must hold — ANDed onto the scope, never in place of it', async () => {
    await get(`when=overdue&kind=followup&times=many&agent=${OTHER}`);
    expect(asked().where.AND).toHaveLength(4);
    expect(asked().where).toMatchObject({ companyId: 'c1', storeId: 's1' });
  });

  it('and the search asks every way an order is known — number, reference, waybill, name, phone', async () => {
    await get(`q=${encodeURIComponent('0790 123')}`);
    const or = (asked().where.AND[0] as { OR: Record<string, unknown>[] }).OR;
    expect(or.map((c) => Object.keys(c)[0])).toEqual(['orderNumber', 'merchantRef', 'trackingNumber', 'customer', 'customer', 'customer']);
  });

  it('and the permission is the confirmation desk’s, or the supervisor’s — as it always was', async () => {
    requirePermission.mockRejectedValueOnce(new Error('no work')).mockResolvedValueOnce({});
    expect((await get()).status).toBe(200);
    expect(requirePermission.mock.calls.map((c) => c[0])).toEqual(['confirmation.work', 'confirmation.supervise']);

    requirePermission.mockReset();
    requirePermission.mockRejectedValue(new Error('Forbidden: missing required permission confirmation.supervise'));
    expect((await get()).status).toBe(403);
  });
});

describe('what it refuses', () => {
  it.each([
    ['when=yesterday', 'الموعد غير معروف: yesterday'],
    ['kind=urgent', 'النوع غير معروف: urgent'],
    ['times=thrice', 'عدد التأجيلات غير معروف: thrice'],
    ['agent=nobody-at-all', 'الموظف غير معروف: nobody-at-all'],
  ])('— %s: 400, in Arabic, and nothing was read', async (query, arabic) => {
    const res = await get(query);
    expect(res.status).toBe(400);
    expect((await res.json()).errorAr).toBe(arabic);
    expect(db.order.findMany).not.toHaveBeenCalled();
    expect(db.order.count).not.toHaveBeenCalled();
  });
});

describe('the page', () => {
  it('— page and size come from the address, and the size is capped at a hundred', async () => {
    db.order.count.mockResolvedValue(500);
    await get('page=3&limit=10');
    expect(asked()).toMatchObject({ skip: 20, take: 10 });
    await get('page=2&limit=1000');
    expect(asked()).toMatchObject({ skip: 100, take: 100 });
  });

  it('and words are the default, numbers out of range are clamped — a page is not worth a 400', async () => {
    db.order.count.mockResolvedValue(500);
    await get('page=abc&limit=xyz');
    expect(asked()).toMatchObject({ skip: 0, take: 25 });
    await get('page=-3&limit=-5');
    expect(asked()).toMatchObject({ skip: 0, take: 1 });
  });

  it('and a page past the end is answered with the last, and the body says which', async () => {
    db.order.count.mockImplementation(async ({ where }: { where: Record<string, unknown> }) => (where.AND && (where.AND as unknown[]).length === 0 ? 60 : 7));
    const body = await (await get('page=99999')).json();
    expect(body.pagination).toEqual({ total: 60, page: 3, limit: 25, totalPages: 3 });
    expect(asked().skip).toBe(50);
  });

  it('and «count» is the number of orders that match what was chosen — it was the length of a three-hundred-row page', async () => {
    db.order.count.mockResolvedValue(412);
    const body = await (await get()).json();
    expect(body.count).toBe(412);
    expect(body.pagination.total).toBe(412);
    expect(body.leadDays).toBe(POSTPONE_LEAD_DAYS);
  });

  it('and it says what was applied, so the screen can show what the list is', async () => {
    const body = await (await get('when=soon&q=سارة')).json();
    expect(body.applied).toEqual({ when: 'soon', kind: null, times: null, agent: null, q: 'سارة' });
  });
});

describe('the figures beside the options', () => {
  it('— are of the scope alone: the search and the dropdowns do not shrink them', async () => {
    await get(`when=overdue&q=سارة&kind=followup`);
    for (const [arg] of db.order.count.mock.calls.slice(1)) {
      // The facts' counts add ONE moment/kind/count each; none carries the search.
      const and = (arg as { where: { AND: unknown[] } }).where.AND;
      expect(and).toHaveLength(1);
      expect(JSON.stringify(and)).not.toContain('orderNumber');
    }
  });

  it('and an agent gets no list of agents, a supervisor does', async () => {
    can.mockReturnValue(false);
    expect((await (await get()).json()).facts.agents).toBeNull();
    can.mockReturnValue(true);
    db.order.groupBy.mockResolvedValue([{ claimedById: 'u1', _count: { _all: 2 } }]);
    db.user.findMany.mockResolvedValue([{ id: 'u1', name: 'سارة' }]);
    expect((await (await get()).json()).facts.agents).toEqual([{ id: 'u1', name: 'سارة', count: 2 }]);
  });
});

describe('what each row carries', () => {
  const rowAt = async (over: Record<string, unknown>) => {
    db.order.findMany.mockResolvedValue([order(over)]);
    db.order.count.mockResolvedValue(1);
    return (await (await get()).json()).orders[0];
  };

  it('— the date is postponedUntil, or nextFollowUpAt when there is none; the days are ceil, as the column prints them', async () => {
    const soon = new Date(Date.now() + 36 * 3_600_000).toISOString();
    expect(await rowAt({ postponedUntil: new Date(soon), nextFollowUpAt: null })).toMatchObject({ dueAt: soon, daysRemaining: 2 });
    expect(await rowAt({ postponedUntil: null, nextFollowUpAt: new Date(soon) })).toMatchObject({ dueAt: soon, daysRemaining: 2 });
    expect(await rowAt({ postponedUntil: null, nextFollowUpAt: null })).toMatchObject({ dueAt: null, daysRemaining: null, actionable: false });
  });

  it('and «actionable» is the lead window — late ones included, and one day too many is out', async () => {
    const inside = await rowAt({ postponedUntil: new Date(Date.now() + POSTPONE_LEAD_DAYS * DAY - 60_000) });
    const outside = await rowAt({ postponedUntil: new Date(Date.now() + POSTPONE_LEAD_DAYS * DAY + 3_600_000) });
    const late = await rowAt({ postponedUntil: new Date(Date.now() - 5 * DAY) });
    expect([inside.actionable, outside.actionable, late.actionable]).toEqual([true, false, true]);
    expect(late.daysRemaining).toBe(-5);
  });

  it('and the tally of customers handed out is the PAGE that was sent — not the whole list, and not the facts', async () => {
    db.order.findMany.mockResolvedValue([order({ id: 'a' }), order({ id: 'b' })]);
    db.order.count.mockResolvedValue(300);
    await get();
    expect(noteCustomersHandedOut).toHaveBeenCalledTimes(1);
    const call = noteCustomersHandedOut.mock.calls[0][0];
    expect(call.rows).toHaveLength(2);
    expect(call).toMatchObject({ companyId: 'c1', storeId: 's1', where: 'الطلبات المؤجّلة' });
  });
});
