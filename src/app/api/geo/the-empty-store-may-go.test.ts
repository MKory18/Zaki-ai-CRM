import { beforeEach, describe, expect, it, vi } from 'vitest';
import { seedPagesFor } from '@/lib/store-pages';
import { STORE_TABLES } from '@/lib/geo-removal';

/**
 * A STORE WITH NOTHING ENTERED ON IT MAY GO. A CITY NOTHING NAMES MAY GO.
 *
 * The owner, 21/10: «بدي زر لحذف المتجر اذا ما كان مدخل عليه اشي» and «بدي زر
 * لحذف المدن اذا ما كان مربوط فيها ولا طلب». Until now these routes had no
 * DELETE at all — and `geo-routes.test.ts` held that as a promise.
 *
 * What is held here is every way the new one may REFUSE, because a delete that
 * is wrong once cannot be taken back: the permission, the company, the name
 * typed, and — the one that matters — a refusal for EACH of the twenty-five
 * tables that can point at a store, since the database would stop only nine of
 * them and silently clear eight and orphan eight.
 */

const { db, requireCompanyTenant, requirePermission, can, logAudit, standing } = vi.hoisted(() => {
  const db: Record<string, any> = {
    store: { findFirst: vi.fn(), findMany: vi.fn(), delete: vi.fn() },
    region: { findFirst: vi.fn(), findMany: vi.fn(), delete: vi.fn() },
    country: { findFirst: vi.fn() },
    $transaction: vi.fn(),
  };
  return {
    db,
    requireCompanyTenant: vi.fn(),
    requirePermission: vi.fn(),
    can: vi.fn(),
    logAudit: vi.fn(),
    standing: vi.fn(),
  };
});

vi.mock('@/lib/db', () => ({ db }));
vi.mock('@/lib/auth', () => ({ requireCompanyTenant: (...a: unknown[]) => requireCompanyTenant(...a) }));
vi.mock('@/lib/authorization', () => ({
  requirePermission: (...a: unknown[]) => requirePermission(...a),
  can: (...a: unknown[]) => can(...a),
}));
vi.mock('@/lib/audit', () => ({ logAudit: (...a: unknown[]) => logAudit(...a) }));
vi.mock('@/lib/landing-domain', () => ({ validateDomain: vi.fn(), forgetHost: vi.fn(), dashboardHosts: () => [] }));
vi.mock('@/lib/geo-context', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  standingStoreId: (...a: unknown[]) => standing(...a),
}));

import * as storeRoute from '@/app/api/geo/stores/[id]/route';
import * as usageRoute from '@/app/api/geo/stores/usage/route';
import * as regionsRoute from '@/app/api/geo/countries/[id]/regions/route';
import * as regionRoute from '@/app/api/geo/countries/[id]/regions/[regionId]/route';

const COMPANY = 'company-1';
const COUNTRY = '22222222-2222-4222-8222-222222222222';
const STORE = '33333333-3333-4333-8333-333333333333';
const REGION = '55555555-5555-4555-8555-555555555555';
const admin = { id: 'u-admin', role: 'COMPANY_ADMIN', status: 'ACTIVE' };
const forbidden = (p: string) => new Error(`Forbidden: missing required permission ${p}`);

/** What the database holds, per table, per store — set by a claim before it asks. */
let storeRows: Record<string, Record<string, number>>;
let regionRows: { order: Record<string, number>; deliveryFee: Record<string, number> };
let pages: { storeId: string; slug: string; title: string; kind: string; body: string; isPublished: boolean }[];
let theStore: Record<string, unknown> | null;
/** Every `model.method` that went through the TRANSACTION client — which is not `db`. */
let txSeen: string[];

/**
 * The client a transaction hands its callback. Deliberately NOT `db`: it forwards
 * to the same mocks and writes down what went through it, so a question the route
 * puts to `db` instead — outside the transaction, where an order can arrive
 * between the asking and the deleting — shows as a call that never passed here.
 */
const txClient = () =>
  new Proxy(
    {},
    {
      get: (_t, model: string) =>
        new Proxy(
          {},
          {
            get:
              (_t2, method: string) =>
              (...args: unknown[]) => {
                txSeen.push(`${model}.${method}`);
                return db[model][method](...args);
              },
          }
        ),
    }
  );

const del = (body: unknown, id = STORE) =>
  storeRoute.DELETE(
    new Request('http://localhost/x', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) }),
    { params: Promise.resolve({ id }) }
  );
const delRegion = (id = REGION, country = COUNTRY) =>
  regionRoute.DELETE(new Request('http://localhost/x', { method: 'DELETE' }), { params: Promise.resolve({ id: country, regionId: id }) });

beforeEach(() => {
  vi.clearAllMocks();
  storeRows = {};
  txSeen = [];
  regionRows = { order: {}, deliveryFee: {} };
  pages = seedPagesFor('متجر').map((p) => ({ ...p, storeId: STORE }));
  theStore = {
    id: STORE, companyId: COMPANY, countryId: COUNTRY, name: 'متجر', slug: 'shop', status: 'ACTIVE',
    storefrontEnabled: false, domain: null, landingPageId: null,
  };

  requireCompanyTenant.mockResolvedValue({ user: admin, companyId: COMPANY });
  requirePermission.mockResolvedValue(admin);
  can.mockReturnValue(true);
  standing.mockResolvedValue(null);

  db.store.findFirst.mockImplementation(async ({ where }: { where: Record<string, unknown> }) =>
    theStore && where.id === STORE && where.companyId === COMPANY ? theStore : null
  );
  db.store.findMany.mockImplementation(async () => (theStore ? [theStore] : []));
  db.store.delete.mockResolvedValue({});
  db.country.findFirst.mockResolvedValue({ id: COUNTRY });
  db.region.findMany.mockResolvedValue([{ id: REGION, countryId: COUNTRY, name: 'عمّان' }]);
  db.region.findFirst.mockImplementation(async ({ where }: { where: Record<string, any> }) =>
    where.id === REGION && where.countryId === COUNTRY && where.country?.companyId === COMPANY
      ? { id: REGION, countryId: COUNTRY, name: 'عمّان', sortOrder: 0 }
      : null
  );
  db.region.delete.mockResolvedValue({});
  db.$transaction.mockImplementation(async (fn: any) => fn(txClient()));

  // One delegate per table a store can be pointed at, answering by what it is asked: by store, or by city.
  for (const t of STORE_TABLES) {
    db[t.model] = {
      ...(db[t.model] ?? {}),
      groupBy: vi.fn(async (args: { by: string[]; where: Record<string, { in: string[] }> }) => {
        if (args.by[0] === 'regionId') {
          const rows = (regionRows as Record<string, Record<string, number>>)[t.model] ?? {};
          return args.where.regionId.in.filter((id) => rows[id]).map((id) => ({ regionId: id, _count: { _all: rows[id] } }));
        }
        const rows = storeRows[t.model] ?? {};
        return args.where.storeId.in.filter((id) => rows[id]).map((id) => ({ storeId: id, _count: { _all: rows[id] } }));
      }),
      findMany: vi.fn(async () => (t.model === 'storePage' ? pages : [])),
    };
  }
  db.deliveryFee = {
    groupBy: vi.fn(async (args: { where: { regionId: { in: string[] } } }) =>
      args.where.regionId.in.filter((id) => regionRows.deliveryFee[id]).map((id) => ({ regionId: id, _count: { _all: regionRows.deliveryFee[id] } }))
    ),
  };
});

const refused = async (res: Response, status: number, code?: string) => {
  expect(res.status).toBe(status);
  const body = await res.json();
  if (code) expect(body.code).toBe(code);
  return body;
};
const nothingGone = () => {
  expect(db.store.delete).not.toHaveBeenCalled();
  expect(db.region.delete).not.toHaveBeenCalled();
  expect(logAudit).not.toHaveBeenCalled();
};

// ───────────────────────── the store ─────────────────────────

describe('deleting a store', () => {
  it('— an empty one goes, once, with its name typed; and the deletion is written down with what it was', async () => {
    const res = await del({ confirm: 'متجر' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    expect(db.store.delete).toHaveBeenCalledTimes(1);
    expect(db.store.delete).toHaveBeenCalledWith({ where: { id: STORE } });
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: COMPANY, userId: admin.id, action: 'STORE_DELETED', entity: 'Store', entityId: STORE, previousData: theStore, newData: null })
    );
  });

  it('and the name may carry spaces round it — but it is the name', async () => {
    expect((await del({ confirm: '  متجر ' })).status).toBe(200);
  });

  it('and it is decided INSIDE the transaction, at the strictest isolation — an order arriving a moment later must make it fail', async () => {
    await del({ confirm: 'متجر' });
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(db.$transaction.mock.calls[0][1]).toEqual({ isolationLevel: 'Serializable', timeout: 20_000 });
    // The questions come after the transaction opened, and the delete after the questions.
    const opened = db.$transaction.mock.invocationCallOrder[0];
    expect(db.order.groupBy.mock.invocationCallOrder[0]).toBeGreaterThan(opened);
    expect(db.store.delete.mock.invocationCallOrder[0]).toBeGreaterThan(db.order.groupBy.mock.invocationCallOrder[0]);
    // …and they were put to the TRANSACTION, every one — none to the client outside it.
    expect(txSeen).toContain('store.delete');
    expect(txSeen).toContain('storePage.findMany');
    for (const t of STORE_TABLES.filter((x) => x.how === 'blocks')) {
      expect(txSeen.filter((x) => x === `${t.model}.groupBy`), t.model).toHaveLength(1);
      expect(db[t.model].groupBy, t.model).toHaveBeenCalledTimes(1);
    }
  });

  it('and what is counted is the asker’s company’s rows — the company rides in every question', async () => {
    await del({ confirm: 'متجر' });
    expect(db.order.groupBy).toHaveBeenCalledWith(expect.objectContaining({ where: { companyId: COMPANY, storeId: { in: [STORE] } } }));
    expect(db.storePage.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { companyId: COMPANY, storeId: { in: [STORE] } } }));
    // …the one table with no company column is asked by the store.
    expect(db.userStoreAccess.groupBy).toHaveBeenCalledWith(expect.objectContaining({ where: { storeId: { in: [STORE] } } }));
  });

  it('and somebody without geo.manage is turned away before anything is read', async () => {
    requirePermission.mockRejectedValue(forbidden('geo.manage'));
    await refused(await del({ confirm: 'متجر' }), 403);
    expect(requirePermission).toHaveBeenCalledWith('geo.manage');
    expect(db.store.findFirst).not.toHaveBeenCalled();
    nothingGone();
  });

  it('and another company’s store does not exist for them — the company is in the question', async () => {
    requireCompanyTenant.mockResolvedValue({ user: admin, companyId: 'company-2' });
    await refused(await del({ confirm: 'متجر' }), 404);
    expect(db.store.findFirst).toHaveBeenCalledWith({ where: { id: STORE, companyId: 'company-2' } });
    nothingGone();
  });

  it.each([
    ['no body at all', undefined],
    ['an empty name', { confirm: '' }],
    ['a body that is not the name’s shape', { name: 'متجر' }],
    ['the name and something else riding along', { confirm: 'متجر', force: true }],
  ])('— %s is turned away', async (_what, body) => {
    await refused(await del(body), 400, 'CONFIRM_REQUIRED');
    nothingGone();
  });

  it('and the wrong name is turned away, and says so', async () => {
    const body = await refused(await del({ confirm: 'متجر آخر' }), 400, 'CONFIRM_MISMATCH');
    expect(body.error).toContain('الاسم غير مطابق');
    nothingGone();
  });

  it('and a store that is not there is 404', async () => {
    theStore = null;
    await refused(await del({ confirm: 'متجر' }), 404);
    nothingGone();
  });
});

describe('a store with something entered on it is refused — one claim for every table that can point at it', () => {
  it.each(STORE_TABLES.filter((t) => t.how === 'blocks'))('— %# · «$label»', async (t) => {
    storeRows = { [t.model]: { [STORE]: 2 } };
    const body = await refused(await del({ confirm: 'متجر' }), 409, 'STORE_IN_USE');
    expect(body.blockers).toEqual([{ key: t.model, text: `${t.label} (2)`, count: 2 }]);
    expect(body.error).toBe(`لا يُحذف المتجر: ${t.label} (2)`);
    nothingGone();
  });

  it('— and a skeleton page edited, or published, or added, is something entered too', async () => {
    for (const mutate of [
      (p: (typeof pages)[number], i: number) => (i === 0 ? { ...p, body: `${p.body}\nسطر` } : p),
      (p: (typeof pages)[number], i: number) => (i === 1 ? { ...p, isPublished: true } : p),
    ]) {
      pages = seedPagesFor('متجر').map((p) => ({ ...p, storeId: STORE })).map(mutate);
      await refused(await del({ confirm: 'متجر' }), 409, 'STORE_IN_USE');
    }
    nothingGone();
  });

  it('— and three untouched skeleton pages, and the system’s notifications about it, are not', async () => {
    storeRows = { notification: { [STORE]: 12 } };
    expect((await del({ confirm: 'متجر' })).status).toBe(200);
    expect(db.notification.groupBy).not.toHaveBeenCalled();
  });

  it('— open to customers, its own domain, a landing page as its front: each is a refusal', async () => {
    const base = theStore!;
    for (const [over, key] of [
      [{ storefrontEnabled: true }, 'live'],
      [{ domain: 'shop.example.com' }, 'domain'],
      [{ landingPageId: 'lp-1' }, 'front'],
    ] as const) {
      // Each from the plain store, so one reason is the only reason.
      theStore = { ...base, ...over };
      const body = await refused(await del({ confirm: 'متجر' }), 409, 'STORE_IN_USE');
      expect(body.blockers.map((b: { key: string }) => b.key)).toEqual([key]);
    }
    nothingGone();
  });

  it('— the store the person is standing in is refused; another’s is not', async () => {
    standing.mockResolvedValue(STORE);
    const body = await refused(await del({ confirm: 'متجر' }), 409, 'STORE_IN_USE');
    expect(body.blockers.map((b: { key: string }) => b.key)).toEqual(['selected']);
    nothingGone();

    standing.mockResolvedValue('44444444-4444-4444-8444-444444444444');
    expect((await del({ confirm: 'متجر' })).status).toBe(200);
  });

  it('— every reason at once, not only the first', async () => {
    storeRows = { order: { [STORE]: 1 }, wallet: { [STORE]: 1 } };
    theStore = { ...theStore!, storefrontEnabled: true };
    const body = await refused(await del({ confirm: 'متجر' }), 409, 'STORE_IN_USE');
    expect(body.blockers.map((b: { key: string }) => b.key)).toEqual(['live', 'order', 'wallet']);
  });
});

// ───────────────────────── what the screen asks beforehand ─────────────────────────

describe('GET /api/geo/stores/usage — the answer the button is drawn from', () => {
  it('— needs geo.manage, not only geo.view: the reasons are counts of orders and wallets', async () => {
    requirePermission.mockRejectedValue(forbidden('geo.manage'));
    await refused(await usageRoute.GET(), 403);
    expect(requirePermission).toHaveBeenCalledWith('geo.manage');
    expect(db.store.findMany).not.toHaveBeenCalled();
  });

  it('and asks about THIS company’s stores only', async () => {
    await usageRoute.GET();
    expect(db.store.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { companyId: COMPANY } }));
  });

  it('and says, per store, nothing for one that may go and the reasons for one that may not', async () => {
    expect(await (await usageRoute.GET()).json()).toEqual({ stores: { [STORE]: { blockers: [] } } });

    storeRows = { order: { [STORE]: 3 } };
    standing.mockResolvedValue(STORE);
    const body = await (await usageRoute.GET()).json();
    expect(body.stores[STORE].blockers.map((b: { key: string }) => b.key)).toEqual(['selected', 'order']);
  });

  it('and the button is only ever as live as the route: the same function answers both', async () => {
    for (const rows of [{}, { customer: { [STORE]: 1 } }, { storeMenu: { [STORE]: 1 } }]) {
      storeRows = rows as typeof storeRows;
      const advice = (await (await usageRoute.GET()).json()).stores[STORE].blockers.length === 0;
      const verdict = (await del({ confirm: 'متجر' })).status === 200;
      expect(verdict, JSON.stringify(rows)).toBe(advice);
      db.store.delete.mockClear();
    }
  });
});

// ───────────────────────── the city ─────────────────────────

describe('deleting a city', () => {
  it('— one nothing names goes, and it is written down', async () => {
    const res = await delRegion();
    expect(res.status).toBe(200);
    expect(db.region.delete).toHaveBeenCalledWith({ where: { id: REGION } });
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: COMPANY, action: 'REGION_DELETED', entity: 'Region', entityId: REGION, newData: null })
    );
  });

  it('and an order that names it keeps it — with the count, and the database is not left to be the one that says no', async () => {
    regionRows.order = { [REGION]: 4 };
    const body = await refused(await delRegion(), 409, 'REGION_IN_USE');
    expect(body.blockers).toEqual([{ key: 'orders', text: 'الطلبات (4)', count: 4 }]);
    expect(body.error).toBe('لا يُحذف المحافظة: الطلبات (4)');
    nothingGone();
  });

  it('and a courier’s fee for it keeps it — the database would have cleared that price along with the city', async () => {
    regionRows.deliveryFee = { [REGION]: 2 };
    const body = await refused(await delRegion(), 409, 'REGION_IN_USE');
    expect(body.blockers).toEqual([{ key: 'fees', text: 'أجور التوصيل (2)', count: 2 }]);
    nothingGone();
  });

  it('and both are listed', async () => {
    regionRows = { order: { [REGION]: 1 }, deliveryFee: { [REGION]: 1 } };
    const body = await refused(await delRegion(), 409, 'REGION_IN_USE');
    expect(body.blockers.map((b: { key: string }) => b.key)).toEqual(['orders', 'fees']);
  });

  it('and it is decided inside the transaction, at the strictest isolation', async () => {
    await delRegion();
    expect(db.$transaction.mock.calls[0][1]).toEqual({ isolationLevel: 'Serializable', timeout: 20_000 });
    const opened = db.$transaction.mock.invocationCallOrder[0];
    expect(db.deliveryFee.groupBy.mock.invocationCallOrder[0]).toBeGreaterThan(opened);
    expect(db.region.delete.mock.invocationCallOrder[0]).toBeGreaterThan(db.deliveryFee.groupBy.mock.invocationCallOrder[0]);
    // Put to the transaction, not to the client outside it.
    expect(txSeen).toEqual(expect.arrayContaining(['order.groupBy', 'deliveryFee.groupBy', 'region.delete']));
    expect(db.order.groupBy).toHaveBeenCalledTimes(1);
    expect(txSeen.filter((x) => x === 'order.groupBy')).toHaveLength(1);
    expect(txSeen.filter((x) => x === 'deliveryFee.groupBy')).toHaveLength(1);
  });

  it('and somebody without geo.manage is turned away before anything is read', async () => {
    requirePermission.mockRejectedValue(forbidden('geo.manage'));
    await refused(await delRegion(), 403);
    expect(db.region.findFirst).not.toHaveBeenCalled();
    nothingGone();
  });

  it('and the city must be of THIS country, and the country of THIS company — a city under another country is not found', async () => {
    await refused(await delRegion(REGION, '99999999-9999-4999-8999-999999999999'), 404);
    expect(db.region.findFirst).toHaveBeenCalledWith({ where: { id: REGION, countryId: '99999999-9999-4999-8999-999999999999', country: { companyId: COMPANY } } });
    nothingGone();

    requireCompanyTenant.mockResolvedValue({ user: admin, companyId: 'company-2' });
    await refused(await delRegion(), 404);
    nothingGone();
  });
});

describe('GET /api/geo/countries/:id/regions — the list the crosses are drawn from', () => {
  const list = () => regionsRoute.GET(new Request('http://localhost/x'), { params: Promise.resolve({ id: COUNTRY }) });

  it('— tells a manager which cities may go: an empty list is one that may', async () => {
    regionRows.order = { [REGION]: 3 };
    const body = await (await list()).json();
    expect(body.usage[REGION]).toEqual([{ key: 'orders', text: 'الطلبات (3)', count: 3 }]);

    regionRows = { order: {}, deliveryFee: {} };
    expect((await (await list()).json()).usage[REGION]).toEqual([]);
  });

  it('and says nothing of orders and fees to somebody who may only look — the counts are not theirs', async () => {
    can.mockReturnValue(false);
    regionRows.order = { [REGION]: 3 };
    const body = await (await list()).json();
    expect(body.usage).toBeNull();
    expect(body.regions).toHaveLength(1);
    expect(db.order.groupBy).not.toHaveBeenCalled();
    expect(db.deliveryFee.groupBy).not.toHaveBeenCalled();
  });

  it('and asks about the permission by its name', async () => {
    await list();
    expect(can).toHaveBeenCalledWith(admin, 'geo.manage');
  });
});
