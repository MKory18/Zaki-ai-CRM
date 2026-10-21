import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * THE CUSTOMER LIST CAN BE NARROWED — AND NARROWING NEVER WIDENS.
 *
 * «العملاء بدي الهم فلاتر». Three new parameters on `GET /api/customers`:
 * `segment` (who ordered, repeated, refused…), `city` and `sort`. What these
 * hold is not that they filter — `customer-filters.test.ts` holds that — but
 * what they must NOT do:
 *
 *   · reach a customer the caller's scope hides (OWN stays OWN);
 *   · move the figures above the list (those describe the BOOK);
 *   · hand the limited view (`view_basic`) the history it is deliberately
 *     not shown, one filtered row at a time.
 */

const { db, requireCompanyTenant, requireContext, can, getPermissionScope } = vi.hoisted(() => ({
  db: { customer: { findMany: vi.fn(), count: vi.fn() } },
  requireCompanyTenant: vi.fn(),
  requireContext: vi.fn(),
  can: vi.fn(),
  getPermissionScope: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ db }));
vi.mock('@/lib/auth', () => ({ requireCompanyTenant: (...a: unknown[]) => requireCompanyTenant(...a) }));
vi.mock('@/lib/geo-context', () => ({ requireContext: (...a: unknown[]) => requireContext(...a) }));
vi.mock('@/lib/authorization', () => ({
  can: (...a: unknown[]) => can(...a),
  getPermissionScope: (...a: unknown[]) => getPermissionScope(...a),
  requirePermission: vi.fn(),
}));
vi.mock('@/lib/audit', () => ({ logAudit: vi.fn(), redactCustomerForAudit: (c: unknown) => c }));

import { GET } from './route';

const COMPANY = 'c1';
const STORE = 's1';
const USER = 'u-moderator';

beforeEach(() => {
  vi.clearAllMocks();
  const ctx = {
    user: { id: USER, role: 'MODERATOR', status: 'ACTIVE', permissions: [] },
    companyId: COMPANY,
    storeId: STORE,
    country: { code: 'SY' },
  };
  requireCompanyTenant.mockResolvedValue(ctx);
  requireContext.mockResolvedValue(ctx);
  db.customer.findMany.mockResolvedValue([]);
  db.customer.count.mockResolvedValue(0);
  can.mockReturnValue(true);
  getPermissionScope.mockReturnValue({ scope: 'ALL_COMPANY' });
});

const get = (query = '') => GET(new Request(`http://localhost/api/customers${query}`));
/** `findMany` is called twice: the page, then the book's counters for the strip. */
const pageQuery = () => db.customer.findMany.mock.calls[0][0];
const bookQuery = () => db.customer.findMany.mock.calls[1][0];

const OWN = { some: { companyId: COMPANY, moderatorId: USER } };

describe('a filter narrows the list', () => {
  it('a segment adds its comparison on top of the company and the store', async () => {
    await get('?segment=refused');
    expect(pageQuery().where).toMatchObject({ companyId: COMPANY, storeId: STORE, cancelledOrders: { gt: 0 } });
  });

  it('a city is an exact, case-blind match — and a search can sit beside it', async () => {
    await get(`?city=${encodeURIComponent('عمّان')}&q=0932&segment=repeat`);
    const where = pageQuery().where;
    expect(where.city).toEqual({ equals: 'عمّان', mode: 'insensitive' });
    expect(where.totalOrders).toEqual({ gte: 2 });
    expect(where.OR, 'البحث ضاع').toBeTruthy();
  });

  it('a sort replaces the order, and without one the order is the old one', async () => {
    await get('?sort=value');
    expect(pageQuery().orderBy).toEqual([{ totalPurchaseValue: 'desc' }, { id: 'asc' }]);

    db.customer.findMany.mockClear();
    await get();
    expect(pageQuery().orderBy).toEqual([{ totalOrders: 'desc' }, { updatedAt: 'desc' }, { id: 'asc' }]);
  });

  it('an unknown segment is a 400 with a sentence, and the database is not asked', async () => {
    const res = await get('?segment=whales');
    expect(res.status).toBe(400);
    expect((await res.json()).errorAr).toContain('whales');
    expect(db.customer.findMany).not.toHaveBeenCalled();
  });
});

describe('and never widens', () => {
  it('OWN scope survives every combination — the filter is added to it, not instead of it', async () => {
    getPermissionScope.mockReturnValue({ scope: 'OWN' });
    await get(`?segment=refused&city=${encodeURIComponent('عمّان')}&q=0932&sort=newest`);
    const where = pageQuery().where;
    expect(where.orders, 'خرجتَ من نطاق OWN').toEqual(OWN);
    expect(where.cancelledOrders).toEqual({ gt: 0 });
  });

  it('the figures above the list describe the BOOK: the filter is not in them, the scope is', async () => {
    getPermissionScope.mockReturnValue({ scope: 'OWN' });
    await get(`?segment=refused&city=${encodeURIComponent('عمّان')}&q=0932`);

    const book = bookQuery().where;
    expect(book).toEqual({ companyId: COMPANY, storeId: STORE, orders: OWN });
    expect(book.cancelledOrders, 'الفلتر دخل أرقام الشريط').toBeUndefined();
    expect(book.city).toBeUndefined();
    expect(book.OR).toBeUndefined();
  });

  it('THE LIMITED VIEW: a filter by refusals, a sort by value and a city are all ignored', async () => {
    can.mockImplementation((_u: unknown, key: string) => key === 'customers.view_basic');
    getPermissionScope.mockReturnValue({ scope: 'ALL_COMPANY' });

    const res = await get(`?segment=refused&sort=value&city=${encodeURIComponent('عمّان')}`);

    const q = pageQuery();
    expect(q.where.cancelledOrders, 'المنظور المحدود رأى من رفضوا').toBeUndefined();
    expect(q.where.city).toBeUndefined();
    expect(q.orderBy).toEqual([{ totalOrders: 'desc' }, { updatedAt: 'desc' }, { id: 'asc' }]);
    const body = await res.json();
    expect(body.limited).toBe(true);
    expect(body.facts).toBeNull();
    // Only the page query ran — the limited view has no figures to count.
    expect(db.customer.findMany).toHaveBeenCalledTimes(1);
  });

  it('even a nonsense value is not an error for the limited view — it is simply not read', async () => {
    can.mockImplementation((_u: unknown, key: string) => key === 'customers.view_basic');
    const res = await get('?segment=whales&sort=luck');
    expect(res.status).toBe(200);
  });
});
