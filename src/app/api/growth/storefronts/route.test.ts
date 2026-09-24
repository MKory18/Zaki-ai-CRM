import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A SHOPFRONT IS A LINK SOMEBODY WILL PUT IN AN ADVERT.
 *
 * Which makes the two guards here worth their tests. One: a shop with
 * nothing on its shelves must refuse to open, because the cost of finding
 * out later is an ad campaign pointing at empty shelves. Two: this is the
 * one screen that spans stores, so what bounds it is ACCESS — and a store
 * this user may not enter must not be switchable from here by id.
 */

const { db, requireContext, requirePermission, listAccessibleStores, logAudit } = vi.hoisted(() => ({
  db: {
    store: { findMany: vi.fn(), update: vi.fn() },
    product: { groupBy: vi.fn(), count: vi.fn() },
    order: { groupBy: vi.fn() },
    landingPage: { groupBy: vi.fn() },
  },
  requireContext: vi.fn(),
  requirePermission: vi.fn(),
  listAccessibleStores: vi.fn(),
  logAudit: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ db }));
vi.mock('@/lib/geo-context', () => ({
  requireContext: (...a: unknown[]) => requireContext(...a),
  listAccessibleStores: (...a: unknown[]) => listAccessibleStores(...a),
}));
vi.mock('@/lib/authorization', () => ({ requirePermission: (...a: unknown[]) => requirePermission(...a) }));
vi.mock('@/lib/audit', () => ({ logAudit: (...a: unknown[]) => logAudit(...a) }));

import { GET, PATCH } from './route';

// Real uuids: the route validates the shape before anything else, and a
// test that trips on the shape never reaches the guard it was written for.
const MINE = '11111111-1111-4111-8111-111111111111';
const THEIRS = '22222222-2222-4222-8222-222222222222';

const patch = (body: unknown) =>
  PATCH(
    new Request('http://localhost/api/growth/storefronts', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  );

beforeEach(() => {
  vi.clearAllMocks();
  requireContext.mockResolvedValue({ user: { id: 'u1' }, companyId: 'c1', countryId: 'sy' });
  requirePermission.mockResolvedValue({ companyId: 'c1' });
  listAccessibleStores.mockResolvedValue([{ id: MINE }]);
  db.store.findMany.mockResolvedValue([]);
  db.product.groupBy.mockResolvedValue([]);
  db.order.groupBy.mockResolvedValue([]);
  db.landingPage.groupBy.mockResolvedValue([]);
  db.product.count.mockResolvedValue(5);
  db.store.update.mockResolvedValue({ id: MINE, name: 'متجري', slug: 'mine' });
});

describe('opening a shopfront', () => {
  it('opens one that has something to sell', async () => {
    db.product.count.mockResolvedValue(3);
    const res = await patch({ storeId: MINE, live: true });
    expect(res.status).toBe(200);
    expect(db.store.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { storefrontEnabled: true } })
    );
  });

  it('refuses to open a shop with empty shelves', async () => {
    // The cost of finding this out later is an advert pointing at nothing.
    db.product.count.mockResolvedValue(0);
    const res = await patch({ storeId: MINE, live: true });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/رفوفاً فارغة/);
    expect(db.store.update).not.toHaveBeenCalled();
  });

  it('closes one without asking what is on the shelves', async () => {
    // Closing is always allowed. A shop you cannot close is worse than one
    // you opened too early.
    db.product.count.mockResolvedValue(0);
    const res = await patch({ storeId: MINE, live: false });
    expect(res.status).toBe(200);
    expect(db.product.count).not.toHaveBeenCalled();
  });
});

describe('a store this user may not enter', () => {
  it('cannot be opened by naming its id', async () => {
    const res = await patch({ storeId: THEIRS, live: true });
    expect(res.status).toBe(404);
    expect(db.store.update).not.toHaveBeenCalled();
  });

  it('cannot be closed by naming its id either', async () => {
    const res = await patch({ storeId: THEIRS, live: false });
    expect(res.status).toBe(404);
    expect(db.store.update).not.toHaveBeenCalled();
  });

  it('answers exactly as it would for a store that does not exist', async () => {
    // Same status, same message: a different answer would confirm that the
    // other shop is real.
    const theirs = await patch({ storeId: THEIRS, live: true });
    const nobody = await patch({ storeId: '00000000-0000-0000-0000-000000000000', live: true });
    expect(theirs.status).toBe(nobody.status);
    expect(await theirs.json()).toEqual(await nobody.json());
  });

  it('refuses an id that is not an id', async () => {
    expect((await patch({ storeId: 'not-a-uuid', live: true })).status).toBe(400);
    expect((await patch({ storeId: MINE, live: 'yes' })).status).toBe(400);
  });
});

describe('the list', () => {
  it('asks only for the stores this user may enter', async () => {
    listAccessibleStores.mockResolvedValue([{ id: MINE }, { id: '33333333-3333-4333-8333-333333333333' }]);
    await GET();
    for (const call of [db.store.findMany, db.product.groupBy, db.order.groupBy, db.landingPage.groupBy]) {
      const where = call.mock.calls.at(-1)?.[0]?.where;
      const ids = where.id?.in ?? where.storeId?.in;
      expect(ids).toEqual([MINE, '33333333-3333-4333-8333-333333333333']);
    }
  });

  it('returns nothing when the country is not this user’s', async () => {
    // listAccessibleStores answers null for a country out of reach. That is
    // the same answer as "no shops here" for a screen that only lists.
    listAccessibleStores.mockResolvedValue(null);
    const res = await GET();
    expect(await res.json()).toEqual({ stores: [] });
    expect(db.store.findMany).not.toHaveBeenCalled();
  });

  it('counts only what came through the shopfront', async () => {
    // A shop selling mostly through landing pages and the phone would
    // otherwise look as though its shopfront were working.
    listAccessibleStores.mockResolvedValue([{ id: MINE }]);
    await GET();
    const orderWhere = db.order.groupBy.mock.calls[0][0].where;
    expect(orderWhere.source).toBe('Store');
  });
});
