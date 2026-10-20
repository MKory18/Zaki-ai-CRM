import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A customer has no owner column: whose customer this is lives in the orders.
 *
 * So OWN scope on customers.view has to be derived — the customers with at
 * least one order this person is the moderator of. A moderator restricted to
 * his own orders who could still page through the whole company's customer
 * list would have the restriction in name only: the phone numbers are the
 * asset being protected.
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
const USER = 'u-moderator';
const STORE = 's1';

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
});

const req = (url = 'http://localhost/api/customers') => new Request(url);
const whereOfLastQuery = () => db.customer.findMany.mock.calls[0][0].where;

describe('customers are scoped the same way orders are', () => {
  it('narrows OWN to the customers behind his own orders', async () => {
    can.mockReturnValue(true);
    getPermissionScope.mockReturnValue({ scope: 'OWN' });

    await GET(req());

    expect(whereOfLastQuery()).toMatchObject({
      companyId: COMPANY,
      orders: { some: { companyId: COMPANY, moderatorId: USER } },
    });
  });

  it('leaves the list company-wide for ALL_COMPANY', async () => {
    can.mockReturnValue(true);
    getPermissionScope.mockReturnValue({ scope: 'ALL_COMPANY' });

    await GET(req());

    expect(whereOfLastQuery().orders).toBeUndefined();
  });

  it('keeps the OWN filter when the moderator searches', async () => {
    // A search must not be a way around the scope.
    can.mockReturnValue(true);
    getPermissionScope.mockReturnValue({ scope: 'OWN' });

    await GET(req('http://localhost/api/customers?q=0932'));

    const where = whereOfLastQuery();
    expect(where.orders).toEqual({ some: { companyId: COMPANY, moderatorId: USER } });
    expect(where.OR).toBeTruthy();
  });

  it('refuses outright without either view permission', async () => {
    can.mockReturnValue(false);
    const res = await GET(req());
    expect(res.status).toBe(403);
    expect(db.customer.findMany).not.toHaveBeenCalled();
  });

  it('scopes the basic projection too, not only the full one', async () => {
    // A CONFIRMATION_AGENT holding only customers.view_basic must be
    // narrowed by the scope on that key, not left unfiltered.
    can.mockImplementation((_u: unknown, key: string) => key === 'customers.view_basic');
    getPermissionScope.mockImplementation((_u: unknown, key: string) =>
      key === 'customers.view_basic' ? { scope: 'OWN' } : null
    );

    await GET(req());

    expect(getPermissionScope).toHaveBeenCalledWith(expect.anything(), 'customers.view_basic');
    expect(whereOfLastQuery().orders).toEqual({ some: { companyId: COMPANY, moderatorId: USER } });
  });
});

describe('customers arrive twenty-five to a page', () => {
  // The book is thousands of names. One request never carried all of it
  // (the old `take: 100` was not even) — now the reader chooses the page,
  // and the count lives with the page, not with a guessed slice.
  it('slices with skip/take and reports the real total', async () => {
    can.mockReturnValue(true);
    getPermissionScope.mockReturnValue({ scope: 'ALL_COMPANY' });
    db.customer.count.mockResolvedValue(17248);

    const res = await GET(req('http://localhost/api/customers?page=3'));

    // calls[0] is the page query; the one after it selects only the
    // facts above the list.
    expect(db.customer.findMany.mock.calls[0][0]).toEqual(
      expect.objectContaining({ skip: 50, take: 25 })
    );
    const body = await res.json();
    expect(body.pagination).toEqual({ total: 17248, page: 3, limit: 25, totalPages: 690 });
  });

  it('caps a hand-crafted limit so one URL cannot swallow the book', async () => {
    can.mockReturnValue(true);
    getPermissionScope.mockReturnValue({ scope: 'ALL_COMPANY' });

    await GET(req('http://localhost/api/customers?limit=9999&page=0'));

    const q = db.customer.findMany.mock.calls[0][0];
    expect(q.take).toBe(100);
    expect(q.skip).toBe(0);
  });

  it('answers a page past the end with the last page, not with an empty shelf', async () => {
    can.mockReturnValue(true);
    getPermissionScope.mockReturnValue({ scope: 'ALL_COMPANY' });
    db.customer.count.mockResolvedValue(17248); // 690 pages of 25

    const res = await GET(req('http://localhost/api/customers?page=999'));
    const q = db.customer.findMany.mock.calls[0][0];
    expect(q.skip).toBe(690 * 25 - 25); // the last page's rows
    const body = await res.json();
    expect(body.pagination.page).toBe(690);
  });
});
