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
  db: { customer: { findMany: vi.fn() } },
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
  };
  requireCompanyTenant.mockResolvedValue(ctx);
  requireContext.mockResolvedValue(ctx);
  db.customer.findMany.mockResolvedValue([]);
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
