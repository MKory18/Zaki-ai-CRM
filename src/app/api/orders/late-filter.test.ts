import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * "Late" is measured from the day the order SHIPPED.
 *
 * Measured from creation, an order that waited a week to be confirmed and
 * shipped yesterday showed as eight days late — the courier blamed for the
 * confirmation queue, and a follow-up agent chasing a parcel that had been
 * on the road for one day.
 */

const { db, requireContext } = vi.hoisted(() => ({
  db: {
    order: { findMany: vi.fn(), count: vi.fn() },
  },
  requireContext: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ db }));
vi.mock('@/lib/geo-context', () => ({ requireContext: (...a: unknown[]) => requireContext(...a) }));
vi.mock('@/lib/authorization', () => ({
  requirePermission: vi.fn(),
  getPermissionScope: () => 'ALL_COMPANY',
  can: () => true,
}));
// (user, where, queue) → where: the queue filter narrows visibility, and is
// not what is under test here.
vi.mock('@/lib/rbac', () => ({ applyQueueFilter: (_u: unknown, w: unknown) => w }));
vi.mock('@/lib/audit', () => ({ logAudit: vi.fn() }));
vi.mock('@/lib/notification', () => ({ createNotification: vi.fn() }));

import { GET } from '@/app/api/orders/route';

const ctx = {
  user: { id: 'u1', role: 'COMPANY_ADMIN', status: 'ACTIVE' },
  companyId: 'c1', storeId: 's1', countryId: 'co1',
  country: { id: 'co1', code: 'JO', currencyCode: 'JOD', minorUnit: 3 },
};

beforeEach(() => {
  vi.clearAllMocks();
  requireContext.mockResolvedValue(ctx);
  db.order.findMany.mockResolvedValue([]);
  db.order.count.mockResolvedValue(0);
});

/** Every condition in the where clause, however deeply nested. */
function conditions(where: any): any[] {
  const out: any[] = [];
  const walk = (w: any) => {
    if (!w || typeof w !== 'object') return;
    out.push(w);
    for (const key of ['AND', 'OR']) if (Array.isArray(w[key])) w[key].forEach(walk);
  };
  walk(where);
  return out;
}

describe('the late filter', () => {
  it('cuts off on shippedAt', async () => {
    await GET(new Request('http://localhost/api/orders?lateDays=10'));
    const where = db.order.findMany.mock.calls[0][0].where;
    const all = conditions(where);

    const onShipped = all.find((c) => c.shippedAt?.lte instanceof Date);
    expect(onShipped).toBeTruthy();

    // Ten days, give or take the milliseconds the test took to run.
    const ageDays = (Date.now() - onShipped.shippedAt.lte.getTime()) / 86_400_000;
    expect(ageDays).toBeGreaterThan(9.99);
    expect(ageDays).toBeLessThan(10.01);
  });

  it('never cuts off on createdAt', async () => {
    // The negative test for the defect itself: a creation-date cutoff
    // anywhere in the late filter is the bug coming back.
    await GET(new Request('http://localhost/api/orders?lateDays=10'));
    const all = conditions(db.order.findMany.mock.calls[0][0].where);
    expect(all.some((c) => c.createdAt?.lte instanceof Date)).toBe(false);
  });

  it('leaves finished orders out — delivered last year is not late', async () => {
    await GET(new Request('http://localhost/api/orders?lateDays=10'));
    const all = conditions(db.order.findMany.mock.calls[0][0].where);
    const closed = all.find((c) => c.shippingStatus?.notIn);
    expect(closed.shippingStatus.notIn).toEqual(
      expect.arrayContaining(['DELIVERED', 'RETURNED', 'CANCELLED'])
    );
  });

  it('refuses a nonsense number of days', async () => {
    for (const bad of ['0', '-3', '400', 'abc']) {
      const res = await GET(new Request(`http://localhost/api/orders?lateDays=${bad}`));
      expect(res.status).toBe(400);
    }
  });
});
