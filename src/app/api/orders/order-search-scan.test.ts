import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * FINDING THE PARCEL IN YOUR HAND.
 *
 * The waybill carries two references: our QR, which holds the merchant
 * reference, and the courier's barcode beside it. The returns screen and the
 * tracking screen have matched both since they were written. The ORDERS
 * search — the one screen everybody uses — matched neither, so a scanned
 * label produced an empty list and the conclusion "the scanner is broken".
 *
 * The second half of this file is the part that matters more. A scan is a
 * SEARCH. It goes down the same path a typed search does, which means it
 * passes through the same role filter, and a camera grants nobody sight of
 * an order they could not already open by typing its number.
 */

const { db, requireContext, getPermissionScope, applyQueueFilter } = vi.hoisted(() => ({
  db: { order: { count: vi.fn(), findMany: vi.fn() } },
  requireContext: vi.fn(),
  getPermissionScope: vi.fn(),
  applyQueueFilter: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ db }));
vi.mock('@/lib/geo-context', () => ({ requireContext: (...a: unknown[]) => requireContext(...a) }));
vi.mock('@/lib/authorization', () => ({
  getPermissionScope: (...a: unknown[]) => getPermissionScope(...a),
  requirePermission: vi.fn(),
  can: vi.fn(() => true),
}));
vi.mock('@/lib/rbac', () => ({ applyQueueFilter: (...a: unknown[]) => applyQueueFilter(...a) }));
vi.mock('@/lib/audit', () => ({ logAudit: vi.fn() }));
vi.mock('@/lib/notify', () => ({ notify: vi.fn() }));

import { GET } from './route';

const CTX = {
  user: { id: 'u1', role: 'MODERATOR', status: 'ACTIVE', permissions: [] },
  companyId: 'c1',
  storeId: 's1',
  countryId: 'jo',
  country: { id: 'jo', minorUnit: 3 },
};

beforeEach(() => {
  vi.clearAllMocks();
  requireContext.mockResolvedValue(CTX);
  getPermissionScope.mockReturnValue({ scope: 'ALL' });
  // The real one narrows by role; here it is watched, and its answer is
  // what the query must actually use.
  applyQueueFilter.mockImplementation((_u: unknown, where: unknown) => where);
  db.order.count.mockResolvedValue(0);
  db.order.findMany.mockResolvedValue([]);
});

const search = (q: string) => GET(new Request(`http://localhost/api/orders?q=${encodeURIComponent(q)}`));
const orFields = () =>
  (db.order.findMany.mock.calls[0][0].where.OR as Record<string, unknown>[]).map((c) => Object.keys(c)[0]);

describe('a scanned label finds its order', () => {
  it('searches the merchant reference our own QR carries', async () => {
    await search('SY-2026-0148');
    expect(orFields()).toContain('merchantRef');
  });

  it("searches the courier's barcode printed beside it", async () => {
    await search('LT123456789');
    expect(orFields()).toContain('trackingNumber');
  });

  it('without losing what people already typed into it', async () => {
    await search('0790000000');
    const or = db.order.findMany.mock.calls[0][0].where.OR as Record<string, any>[];
    expect(or.some((c) => c.orderNumber)).toBe(true);
    expect(or.some((c) => c.customer?.fullName)).toBe(true);
    expect(or.some((c) => c.customer?.phone)).toBe(true);
  });

  it('and an empty search adds no OR at all — not a clause matching everything', async () => {
    await GET(new Request('http://localhost/api/orders'));
    expect(db.order.findMany.mock.calls[0][0].where.OR).toBeUndefined();
  });
});

/**
 * THE GUARDS. Each of these is the negative of a rule the feature rests on.
 */
describe('a scan is a search, and a search is not a skeleton key', () => {
  it('still goes through the role filter — the camera adds no reach', async () => {
    // If a future "fast path for scans" skips this, the moderator restricted
    // to his own orders reads the whole company's by pointing a phone at a
    // label lying on somebody else's desk.
    await search('SY-2026-0148');
    expect(applyQueueFilter).toHaveBeenCalledTimes(1);
    const passed = applyQueueFilter.mock.calls[0][1] as Record<string, unknown>;
    expect(passed.OR).toBeDefined();
  });

  it('and the query uses the filter’s answer, not the unfiltered where', async () => {
    const narrowed = { companyId: 'c1', storeId: 's1', moderatorId: 'u1', OR: [{ orderNumber: { contains: 'X' } }] };
    applyQueueFilter.mockReturnValue(narrowed);
    await search('SY-2026-0148');
    expect(db.order.findMany.mock.calls[0][0].where).toBe(narrowed);
    expect(db.order.count.mock.calls[0][0].where).toBe(narrowed);
  });

  it('refuses the whole request without orders.view — before any query runs', async () => {
    getPermissionScope.mockReturnValue(null);
    const res = await search('SY-2026-0148');
    expect(res.status).toBe(403);
    expect(db.order.findMany).not.toHaveBeenCalled();
  });

  it('stays inside the company and the store', async () => {
    await search('SY-2026-0148');
    const where = db.order.findMany.mock.calls[0][0].where as Record<string, unknown>;
    expect(where.companyId).toBe('c1');
    expect(where.storeId).toBe('s1');
  });
});
