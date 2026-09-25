import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * /api/geo/*, /api/context and /api/users/:id/geo-access — permission,
 * tenant and "store inside a country" guards. Prisma/auth/audit mocked;
 * handlers and the geo-context rules run for real.
 */

const { db, requireCompanyTenant, requirePermission, can, logAudit } = vi.hoisted(() => ({
  db: {
    country: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), count: vi.fn() },
    region: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn() },
    store: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), count: vi.fn() },
    storePage: { createMany: vi.fn() },
    user: { findFirst: vi.fn() },
    userCountryAccess: { findMany: vi.fn(), deleteMany: vi.fn(), createMany: vi.fn() },
    userStoreAccess: { findMany: vi.fn(), deleteMany: vi.fn(), createMany: vi.fn(), count: vi.fn() },
    $transaction: vi.fn(),
  },
  requireCompanyTenant: vi.fn(),
  requirePermission: vi.fn(),
  can: vi.fn(),
  logAudit: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ db }));
vi.mock('@/lib/auth', () => ({ requireCompanyTenant: (...a: unknown[]) => requireCompanyTenant(...a) }));
vi.mock('@/lib/authorization', () => ({
  requirePermission: (...a: unknown[]) => requirePermission(...a),
  can: (...a: unknown[]) => can(...a),
}));
vi.mock('@/lib/audit', () => ({ logAudit: (...a: unknown[]) => logAudit(...a) }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }));

import * as countriesRoute from '@/app/api/geo/countries/route';
import * as countryRoute from '@/app/api/geo/countries/[id]/route';
import * as storesRoute from '@/app/api/geo/stores/route';
import * as storeRoute from '@/app/api/geo/stores/[id]/route';
import * as contextRoute from '@/app/api/context/route';
import * as geoAccessRoute from '@/app/api/users/[id]/geo-access/route';
import { readSelection, CONTEXT_COOKIE } from '@/lib/geo-context';

const admin = { id: 'u-admin', role: 'COMPANY_ADMIN', status: 'ACTIVE' };
const COMPANY = 'company-1';
const JO = '11111111-1111-4111-8111-111111111111';
const SY = '22222222-2222-4222-8222-222222222222';
const STORE_JO = '33333333-3333-4333-8333-333333333333';
const STORE_SY = '44444444-4444-4444-8444-444444444444';

const forbidden = (p: string) => new Error(`Forbidden: missing required permission ${p}`);
const req = (body: unknown, method = 'POST') =>
  new Request('http://localhost/api/x', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const params = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.clearAllMocks();
  requireCompanyTenant.mockResolvedValue({ user: admin, companyId: COMPANY });
  requirePermission.mockResolvedValue(admin);
  // The interactive form: the handler is handed a client and its work runs
  // against the same mocks, so what it wrote is visible to the assertions.
  db.$transaction.mockImplementation(async (fn: any) => (typeof fn === 'function' ? fn(db) : fn));
  can.mockReturnValue(false);
  db.userStoreAccess.findMany.mockResolvedValue([]); // no narrowing: every store of the country
});

describe('no hard delete for countries and stores', () => {
  it('country and store routes expose no DELETE handler', () => {
    for (const mod of [countriesRoute, countryRoute, storesRoute, storeRoute]) {
      expect((mod as Record<string, unknown>).DELETE).toBeUndefined();
    }
  });

  it('a store cannot be moved to another country (countryId is rejected on PATCH)', async () => {
    const res = await storeRoute.PATCH(req({ countryId: SY }, 'PATCH'), params(STORE_JO));
    expect(res.status).toBe(400);
    expect(db.store.update).not.toHaveBeenCalled();
  });
});

describe('POST /api/geo/countries', () => {
  const body = { code: 'sy', name: 'سوريا', currencyCode: 'syp', minorUnit: 2 };

  it('requires geo.manage (403)', async () => {
    requirePermission.mockRejectedValue(forbidden('geo.manage'));
    const res = await countriesRoute.POST(req(body));
    expect(res.status).toBe(403);
    expect(db.country.create).not.toHaveBeenCalled();
  });

  it('refuses a duplicate country code (409)', async () => {
    db.country.findFirst.mockResolvedValue({ id: SY });
    const res = await countriesRoute.POST(req(body));
    expect(res.status).toBe(409);
  });

  it('refuses a country without a currency (400) — nothing is created', async () => {
    // Acceptance: a country cannot exist without the currency every amount
    // in it is counted in. Missing, empty and malformed are all refused.
    const { currencyCode: _omit, ...noCurrency } = body;
    expect((await countriesRoute.POST(req(noCurrency))).status).toBe(400);
    expect((await countriesRoute.POST(req({ ...body, currencyCode: '' }))).status).toBe(400);
    expect((await countriesRoute.POST(req({ ...body, currencyCode: 'دينار' }))).status).toBe(400);
    expect(db.country.create).not.toHaveBeenCalled();
  });

  it('refuses a country without its decimal places (400) — there is no silent default', async () => {
    const { minorUnit: _omit, ...noMinor } = body;
    expect((await countriesRoute.POST(req(noMinor))).status).toBe(400);
    expect((await countriesRoute.POST(req({ ...body, minorUnit: 5 }))).status).toBe(400);
    expect((await countriesRoute.POST(req({ ...body, minorUnit: 1.5 }))).status).toBe(400);
    expect(db.country.create).not.toHaveBeenCalled();
  });

  it('rejects an invalid timezone and weekend day (400)', async () => {
    expect((await countriesRoute.POST(req({ ...body, timezone: 'Mars/Base' }))).status).toBe(400);
    expect((await countriesRoute.POST(req({ ...body, weekendDays: [7] }))).status).toBe(400);
  });

  it('creates with normalised codes, the session company, and an audit entry', async () => {
    db.country.findFirst.mockResolvedValue(null);
    db.country.create.mockImplementation(async ({ data }: any) => ({ id: SY, ...data }));
    const res = await countriesRoute.POST(req({ ...body, companyId: 'attacker-company' }));
    expect(res.status).toBe(201);
    const data = db.country.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ companyId: COMPANY, code: 'SY', currencyCode: 'SYP' });
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'COUNTRY_CREATED' }));
  });
});

describe('POST /api/geo/stores — a store cannot exist outside a country', () => {
  const body = { countryId: JO, name: 'Main JO', slug: 'main-jo' };

  it('rejects a store without countryId (400)', async () => {
    const res = await storesRoute.POST(req({ name: 'x', slug: 'x-1' }));
    expect(res.status).toBe(400);
    expect(db.store.create).not.toHaveBeenCalled();
  });

  it("rejects another company's country (404)", async () => {
    db.country.findFirst.mockResolvedValue(null);
    const res = await storesRoute.POST(req(body));
    expect(res.status).toBe(404);
    expect(db.country.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: JO, companyId: COMPANY } }));
    expect(db.store.create).not.toHaveBeenCalled();
  });

  it('requires geo.manage (403)', async () => {
    requirePermission.mockRejectedValue(forbidden('geo.manage'));
    expect((await storesRoute.POST(req(body))).status).toBe(403);
  });

  it('refuses a slug already used in the company (409)', async () => {
    db.country.findFirst.mockResolvedValue({ id: JO });
    db.store.findFirst.mockResolvedValue({ id: STORE_SY });
    expect((await storesRoute.POST(req(body))).status).toBe(409);
  });

  it('creates the store under the country', async () => {
    db.country.findFirst.mockResolvedValue({ id: JO });
    db.store.findFirst.mockResolvedValue(null);
    db.store.create.mockImplementation(async ({ data }: any) => ({ id: STORE_JO, ...data }));
    const res = await storesRoute.POST(req(body));
    expect(res.status).toBe(201);
    expect(db.store.create.mock.calls[0][0].data).toMatchObject({ companyId: COMPANY, countryId: JO, status: 'ACTIVE' });
  });

  it('gives the new store its three legal pages, as drafts, in the same transaction', async () => {
    // A seller who finds out on the morning of a campaign that the shop has
    // no privacy policy has lost the morning: an ad review asks for it. They
    // are DRAFTS — publishing a policy nobody has read puts words in the
    // seller's mouth — and they are created with the store or not at all.
    db.country.findFirst.mockResolvedValue({ id: JO });
    db.store.findFirst.mockResolvedValue(null);
    db.store.create.mockImplementation(async ({ data }: any) => ({ id: STORE_JO, ...data }));
    await storesRoute.POST(req(body));

    const seeded = db.storePage.createMany.mock.calls[0][0].data;
    expect(seeded.map((p: any) => p.kind).sort()).toEqual(['PRIVACY', 'REFUND', 'TERMS']);
    for (const page of seeded) {
      expect(page.isPublished, page.kind).toBe(false);
      expect(page.storeId).toBe(STORE_JO);
      expect(page.companyId).toBe(COMPANY);
      // The skeleton carries the shop's own name, not a placeholder.
      expect(page.body).toContain(body.name);
      expect(page.body).not.toContain('{{store}}');
    }
  });
});

describe('POST /api/context', () => {
  it('refuses a country the user cannot enter (403) and sets no cookie', async () => {
    db.country.findFirst.mockResolvedValue(null);
    const res = await contextRoute.POST(req({ countryId: SY, storeId: STORE_SY }));
    expect(res.status).toBe(403);
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('refuses a store from another country (403)', async () => {
    db.country.findFirst.mockResolvedValue({ id: JO });
    db.store.findMany.mockResolvedValue([{ id: STORE_JO }]);
    expect((await contextRoute.POST(req({ countryId: JO, storeId: STORE_SY }))).status).toBe(403);
  });

  it('switching country without a store stores storeId = null', async () => {
    db.country.findFirst.mockResolvedValue({ id: SY });
    db.store.findMany.mockResolvedValue([{ id: STORE_SY }]);
    const res = await contextRoute.POST(req({ countryId: SY }));
    expect(res.status).toBe(200);
    const token = /salesflow_ctx=([^;]+)/.exec(res.headers.get('set-cookie') ?? '')?.[1];
    expect(CONTEXT_COOKIE).toBe('salesflow_ctx');
    await expect(readSelection(admin.id, token)).resolves.toEqual({ countryId: SY, storeId: null });
  });
});

describe('PUT /api/users/:id/geo-access', () => {
  beforeEach(() => {
    db.user.findFirst.mockResolvedValue({ id: 'u-agent' });
    db.userCountryAccess.findMany.mockResolvedValue([]);
    db.userStoreAccess.findMany.mockResolvedValue([]);
  });

  it('requires geo.manage (403)', async () => {
    requirePermission.mockRejectedValue(forbidden('geo.manage'));
    expect((await geoAccessRoute.PUT(req({ countryIds: [JO] }, 'PUT'), params('u-agent'))).status).toBe(403);
  });

  it('refuses a user from another company (404)', async () => {
    db.user.findFirst.mockResolvedValue(null);
    expect((await geoAccessRoute.PUT(req({ countryIds: [JO] }, 'PUT'), params('u-other'))).status).toBe(404);
  });

  it('refuses a store outside the assigned countries (400) and writes nothing', async () => {
    db.country.count.mockResolvedValue(1);
    db.store.count.mockResolvedValue(0);
    const res = await geoAccessRoute.PUT(req({ countryIds: [JO], storeIds: [STORE_SY] }, 'PUT'), params('u-agent'));
    expect(res.status).toBe(400);
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('replaces the assignments and audits the change', async () => {
    db.country.count.mockResolvedValue(1);
    db.store.count.mockResolvedValue(1);
    const res = await geoAccessRoute.PUT(req({ countryIds: [JO], storeIds: [STORE_JO] }, 'PUT'), params('u-agent'));
    expect(res.status).toBe(200);
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'USER_GEO_ACCESS_UPDATED' }));
  });
});
