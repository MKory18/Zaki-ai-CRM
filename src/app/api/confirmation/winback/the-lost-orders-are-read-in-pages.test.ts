import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * THE LOST ORDERS, READ IN PAGES — UNDER THE OWNER'S RULE.
 *
 * «استرجاع الملغى — اعملو صفحات + فلاتر + بحث، والأهم شو القاعدة تبعو». The route
 * used to read the last five hundred lost orders, judge each in memory and cut at
 * five hundred before asking. What is held here is the door: what it asks for,
 * under whose rule, what it refuses, and what it sends back — and above all that
 * no choice in the address can widen what the person is allowed to see.
 */

const { db, requireContext, requirePermission, can, noteCustomersHandedOut } = vi.hoisted(() => ({
  db: {
    order: { findMany: vi.fn(), count: vi.fn(), groupBy: vi.fn() },
    orderStatusLog: { findMany: vi.fn() },
    company: { findUnique: vi.fn() },
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
vi.mock('@/lib/order-ref', () => ({ orderRefFields: vi.fn() }));
vi.mock('@/lib/pii-alert', () => ({ noteCustomersHandedOut: (...a: unknown[]) => noteCustomersHandedOut(...a) }));

import { GET } from './route';

const DAY = 86_400_000;
const user = { id: 'u-sup', name: 'مشرفة', role: 'CONFIRMATION_SUPERVISOR', status: 'ACTIVE' };
const get = (query = '') => GET(new Request(`http://localhost/api/confirmation/winback${query ? `?${query}` : ''}`));
const asked = () => db.order.findMany.mock.calls.at(-1)![0] as { where: Record<string, any>; skip: number; take: number; orderBy: unknown[] };

const order = (over: Record<string, unknown> = {}) => ({
  id: 'o1',
  orderNumber: 'ORD-1',
  confirmationStatus: 'REJECTED',
  rejectionReason: 'PRICE_TOO_HIGH',
  rejectionNote: null,
  shippedAt: null,
  sellingPrice: 100,
  discountAmount: 0,
  quantity: 1,
  currency: 'JOD',
  productNameSnapshot: 'قطرة',
  createdAt: new Date(Date.now() - 50 * DAY),
  customer: { fullName: 'عميل', phone: '0790000000' },
  replacedBy: null,
  replaces: null,
  ...over,
});

/** Stores a rule in the company's settings document, as the editor would have. */
const storeRule = (winback: unknown) => db.company.findUnique.mockResolvedValue({ settings: JSON.stringify({ winback, ai: { x: 1 } }) });

beforeEach(() => {
  vi.clearAllMocks();
  requireContext.mockResolvedValue({ user, companyId: 'c1', storeId: 's1' });
  requirePermission.mockResolvedValue(user);
  can.mockReturnValue(false);
  db.order.findMany.mockResolvedValue([]);
  db.order.count.mockResolvedValue(0);
  db.order.groupBy.mockResolvedValue([]);
  db.orderStatusLog.findMany.mockResolvedValue([]);
  db.company.findUnique.mockResolvedValue({ settings: null });
});

describe('what it asks for', () => {
  it('— with nothing chosen: this company, this store, the lost words, the look-back, 25 from the start', async () => {
    const res = await get();
    expect(res.status).toBe(200);
    const w = asked().where;
    expect(w).toMatchObject({ companyId: 'c1', storeId: 's1', confirmationStatus: { in: ['REJECTED', 'CANCELLED'] } });
    expect(w.createdAt.gte.getTime()).toBeGreaterThan(Date.now() - 121 * DAY);
    expect(w.createdAt.gte.getTime()).toBeLessThan(Date.now() - 119 * DAY);
    expect(asked()).toMatchObject({ skip: 0, take: 25 });
    expect(asked().orderBy).toEqual([{ createdAt: 'asc' }, { id: 'asc' }]);
    // One view, the work: the view's clause alone is ANDed on.
    expect(w.AND).toHaveLength(1);
  });

  it('and only a supervisor reads it — the permission is asked by name, and a refusal is a 403 with nothing read', async () => {
    requirePermission.mockRejectedValue(new Error('Forbidden: missing required permission confirmation.supervise'));
    expect((await get()).status).toBe(403);
    expect(requirePermission).toHaveBeenCalledWith('confirmation.supervise');
    expect(db.order.findMany).not.toHaveBeenCalled();
    expect(db.order.count).not.toHaveBeenCalled();
  });

  it('and every word chosen is one more thing that must hold, ANDed onto the scope — never in place of it', async () => {
    await get('view=skipped&reason=OTHER&product=%D9%82%D8%B7%D8%B1%D8%A9&period=30');
    expect(asked().where.AND).toHaveLength(4);
    expect(asked().where).toMatchObject({ companyId: 'c1', storeId: 's1' });
  });

  it('and the search asks every way an order is known — and the product', async () => {
    await get(`q=${encodeURIComponent('0790 123')}`);
    const or = (asked().where.AND[1] as { OR: Record<string, unknown>[] }).OR;
    expect(or.map((c) => Object.keys(c)[0])).toEqual(['orderNumber', 'merchantRef', 'trackingNumber', 'customer', 'customer', 'customer', 'productNameSnapshot']);
  });
});

describe('what it refuses', () => {
  it.each([
    ['view=everything', 'العرض غير معروف: everything'],
    ['reason=BOREDOM', 'سبب الإلغاء غير معروف: BOREDOM'],
    ['period=365', 'المدّة غير معروف: 365'],
  ])('— %s: 400, in Arabic, and nothing was read', async (query, arabic) => {
    const res = await get(query);
    expect(res.status).toBe(400);
    expect((await res.json()).errorAr).toBe(arabic);
    expect(db.order.findMany).not.toHaveBeenCalled();
  });
});

describe('the rule it reads', () => {
  it('— with nothing stored, the defaults — and the response says so, with whether this person may change it', async () => {
    const body = await (await get()).json();
    expect(body.rule).toEqual({
      reasons: ['PRICE_TOO_HIGH', 'FOUND_CHEAPER_ELSEWHERE', 'CUSTOMER_CHANGED_MIND', 'NO_ANSWER_3_ATTEMPTS'],
      coolingDays: 14,
      lookbackDays: 120,
      maxDiscountShare: 0.25,
    });
    expect(body.canEditRule).toBe(false);
  });

  it('and «can edit» is the settings permission, asked of the person — not the supervisor’s', async () => {
    can.mockImplementation((_u: unknown, perm: string) => perm === 'settings.manage');
    expect((await (await get()).json()).canEditRule).toBe(true);
    expect(can).toHaveBeenCalledWith(user, 'settings.manage');
  });

  it('and a stored rule is what is applied: a 30-day look-back moves the line the list reads from', async () => {
    storeRule({ lookbackDays: 45, coolingDays: 7, reasons: ['OTHER'], maxDiscountShare: 0.1 });
    const body = await (await get()).json();
    expect(body.rule).toMatchObject({ lookbackDays: 45, coolingDays: 7, reasons: ['OTHER'], maxDiscountShare: 0.1 });
    const since = asked().where.createdAt.gte.getTime();
    expect(since).toBeGreaterThan(Date.now() - 46 * DAY);
    expect(since).toBeLessThan(Date.now() - 44 * DAY);
  });

  it('and the cooling the QUERY draws is the rule’s own — thirty days moves the line the «ready» view is cut at', async () => {
    /** Every cutoff the question draws on a log row's date, found wherever it sits in the question. */
    const cutoffs = (node: unknown): Date[] => {
      if (node instanceof Date || node === null || typeof node !== 'object') return [];
      return Object.entries(node as Record<string, unknown>).flatMap(([key, value]) => (key === 'gt' && value instanceof Date ? [value] : cutoffs(value)));
    };
    storeRule({ coolingDays: 30 });
    await get();
    const cut = cutoffs(asked().where.AND[0]);
    expect(cut).toHaveLength(1);
    expect(cut[0].getTime()).toBeGreaterThan(Date.now() - 31 * DAY);
    expect(cut[0].getTime()).toBeLessThan(Date.now() - 29 * DAY);
  });

  it('and a broken settings document is the default, not a 500', async () => {
    db.company.findUnique.mockResolvedValue({ settings: '{not json' });
    const res = await get();
    expect(res.status).toBe(200);
    expect((await res.json()).rule.coolingDays).toBe(14);
  });

  it('and the rows’ verdicts are taken under that rule: cooling for thirty days says thirty', async () => {
    storeRule({ coolingDays: 30 });
    db.order.findMany.mockResolvedValue([order()]);
    db.order.count.mockResolvedValue(1);
    db.orderStatusLog.findMany.mockResolvedValue([{ orderId: 'o1', createdAt: new Date(Date.now() - 20 * DAY) }]);
    const body = await (await get('view=cooling')).json();
    expect(body.rows[0].verdict).toMatchObject({ eligible: false, code: 'COOLING' });
    expect(body.rows[0].verdict.reason).toContain('30');
  });

  it('and an order the rule calls for carries the rule’s own ceiling', async () => {
    storeRule({ maxDiscountShare: 0.1 });
    db.order.findMany.mockResolvedValue([order({ sellingPrice: 200 })]);
    db.order.count.mockResolvedValue(1);
    db.orderStatusLog.findMany.mockResolvedValue([{ orderId: 'o1', createdAt: new Date(Date.now() - 40 * DAY) }]);
    const body = await (await get()).json();
    expect(body.rows[0].verdict).toMatchObject({ eligible: true, maxDiscount: 20 });
  });
});

describe('the page', () => {
  it('— page and size come from the address, the size capped at a hundred; words are the default', async () => {
    db.order.count.mockResolvedValue(500);
    await get('page=3&limit=10');
    expect(asked()).toMatchObject({ skip: 20, take: 10 });
    await get('page=2&limit=1000');
    expect(asked()).toMatchObject({ skip: 100, take: 100 });
    await get('page=abc&limit=xyz');
    expect(asked()).toMatchObject({ skip: 0, take: 25 });
  });

  it('and a page past the end is answered with the last, and the body says which', async () => {
    // The page's own count is asked first; the numbers beside the options are asked after it.
    db.order.count.mockResolvedValueOnce(60).mockResolvedValue(7);
    const body = await (await get('page=99999')).json();
    expect(body.pagination).toEqual({ total: 60, page: 3, limit: 25, totalPages: 3 });
    expect(asked().skip).toBe(50);
  });

  it('and the numbers beside the options come back with it, over the same scope', async () => {
    const body = await (await get()).json();
    expect(Object.keys(body.facts)).toEqual(['views', 'reasons', 'products', 'periods']);
    expect(Object.keys(body.facts.views)).toEqual(['ready', 'cooling', 'skipped']);
    for (const [arg] of db.order.count.mock.calls) expect((arg as { where: Record<string, unknown> }).where).toMatchObject({ companyId: 'c1', storeId: 's1' });
  });

  it('and it says what was applied, so the screen can show what the list is', async () => {
    const body = await (await get('view=cooling&q=سارة')).json();
    expect(body.applied).toEqual({ view: 'cooling', reason: null, product: null, period: null, q: 'سارة' });
  });
});

describe('the closing date and the tally', () => {
  it('— the closing dates are looked up for the PAGE’s orders only, by either lost word', async () => {
    db.order.findMany.mockResolvedValue([order({ id: 'a' }), order({ id: 'b' })]);
    db.order.count.mockResolvedValue(300);
    await get();
    expect(db.orderStatusLog.findMany).toHaveBeenCalledTimes(1);
    expect(db.orderStatusLog.findMany.mock.calls[0][0].where).toEqual({
      orderId: { in: ['a', 'b'] },
      statusType: 'CONFIRMATION',
      newValue: { in: ['REJECTED', 'CANCELLED'] },
    });
  });

  it('and an empty page looks nothing up', async () => {
    await get();
    expect(db.orderStatusLog.findMany).not.toHaveBeenCalled();
  });

  it('and the LAST loss is the closing date — an order rejected, re-opened and rejected again cools from the second time', async () => {
    db.order.findMany.mockResolvedValue([order()]);
    db.order.count.mockResolvedValue(1);
    // Newest first, as the route asks for them.
    db.orderStatusLog.findMany.mockResolvedValue([
      { orderId: 'o1', createdAt: new Date(Date.now() - 3 * DAY) },
      { orderId: 'o1', createdAt: new Date(Date.now() - 90 * DAY) },
    ]);
    const body = await (await get('view=cooling')).json();
    expect(body.rows[0].verdict).toMatchObject({ eligible: false, code: 'COOLING' });
  });

  it('and the tally of customers handed out is the PAGE that was sent — not the whole list', async () => {
    db.order.findMany.mockResolvedValue([order({ id: 'a' }), order({ id: 'b' })]);
    db.order.count.mockResolvedValue(300);
    await get();
    expect(noteCustomersHandedOut).toHaveBeenCalledTimes(1);
    const call = noteCustomersHandedOut.mock.calls[0][0];
    expect(call.rows).toHaveLength(2);
    expect(call).toMatchObject({ companyId: 'c1', storeId: 's1', where: 'استعادة العملاء' });
  });
});
