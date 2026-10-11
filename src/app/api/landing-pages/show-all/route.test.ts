import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * THE PRESS THAT FILLS THE SHOP.
 *
 * One update, same moment as the catalogue switch: every published page
 * of exactly this store flips to shown, the audit row is written, and
 * nothing else moves. Unpublished pages are not touched — the flag is
 * intent, publishing is the act.
 */

const { db, requireContext, requirePermission, listAccessibleStores, logAudit } = vi.hoisted(() => ({
  db: { landingPage: { updateMany: vi.fn() } },
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

import { POST } from './route';

const MINE = '11111111-1111-4111-8111-111111111111';
const THEIRS = '22222222-2222-4222-8222-222222222222';

const post = (body: unknown) =>
  POST(new Request('http://localhost/api/landing-pages/show-all', { method: 'POST', body: JSON.stringify(body) }));

beforeEach(() => {
  vi.clearAllMocks();
  requireContext.mockResolvedValue({ user: { id: 'u1' }, companyId: 'c1', countryId: 'k1', storeId: MINE });
  requirePermission.mockResolvedValue(undefined);
  listAccessibleStores.mockResolvedValue([{ id: MINE }]);
  db.landingPage.updateMany.mockResolvedValue({ count: 3 });
});

describe('showing all published pages', () => {
  it('flips only this store’s published, hidden pages', async () => {
    const res = await post({ storeId: MINE });
    expect(res.status).toBe(200);
    expect(db.landingPage.updateMany).toHaveBeenCalledWith({
      where: { companyId: 'c1', storeId: MINE, isPublished: true, showInStore: false },
      data: { showInStore: true },
    });
    expect(await res.json()).toMatchObject({ success: true, shown: 3 });
  });

  it('writes the audit row', async () => {
    await post({ storeId: MINE });
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'LANDING_PAGES_SHOWN_ALL', entity: 'Store', entityId: MINE })
    );
  });

  it('refuses a store this user may not enter', async () => {
    const res = await post({ storeId: THEIRS });
    expect(res.status).toBe(404);
    expect(db.landingPage.updateMany).not.toHaveBeenCalled();
  });

  it('refuses a body with no store', async () => {
    const res = await post({});
    expect(res.status).toBe(400);
    expect(db.landingPage.updateMany).not.toHaveBeenCalled();
  });
});
