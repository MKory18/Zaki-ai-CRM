import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * An order's region must belong to the store's country: a Syrian
 * governorate on a Jordanian store has no fee row and could never ship.
 */

const { db, requireContext, requirePermission, logAudit, createNotification } = vi.hoisted(() => ({
  db: {
    region: { findFirst: vi.fn() },
    customer: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    product: { findFirst: vi.fn() },
    offer: { findFirst: vi.fn() },
    user: { findFirst: vi.fn() },
    order: { create: vi.fn(), count: vi.fn() },
    $transaction: vi.fn(),
  },
  requireContext: vi.fn(),
  requirePermission: vi.fn(),
  logAudit: vi.fn(),
  createNotification: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ db }));
vi.mock('@/lib/geo-context', () => ({ requireContext: (...a: unknown[]) => requireContext(...a) }));
vi.mock('@/lib/audit', () => ({ logAudit: (...a: unknown[]) => logAudit(...a) }));
vi.mock('@/lib/notification', () => ({ createNotification: (...a: unknown[]) => createNotification(...a) }));
vi.mock('@/lib/authorization', () => ({
  requirePermission: (...a: unknown[]) => requirePermission(...a),
  getPermissionScope: () => ({ scope: 'ALL_COMPANY' }),
  can: () => true,
  authorize: () => ({ allowed: true }),
}));
vi.mock('@/lib/rbac', () => ({ applyQueueFilter: (_u: unknown, w: unknown) => w }));

import { POST } from '@/app/api/orders/route';

const REGION_JO = '99999999-9999-4999-8999-999999999999';
const body = (over: Record<string, unknown> = {}) =>
  new Request('http://localhost/api/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      customerName: 'أحمد المغني',
      customerPhone: '0798092174',
      customerAddress: 'الفردوس',
      customerCity: 'عمّان',
      productId: '11111111-1111-4111-8111-111111111111',
      quantity: 1,
      sellingPrice: 12,
      ...over,
    }),
  });

beforeEach(() => {
  vi.clearAllMocks();
  requireContext.mockResolvedValue({
    user: { id: 'u1', name: 'Admin', role: 'COMPANY_ADMIN', status: 'ACTIVE' },
    companyId: 'c1', storeId: 's1', countryId: 'co-jo',
    country: { id: 'co-jo', currencyCode: 'JOD', minorUnit: 3, orderPrefix: 'ORD', allowNegativeStock: false },
  });
  requirePermission.mockResolvedValue({});
  db.customer.findUnique.mockResolvedValue({ id: 'cust1', firstOrderDate: null });
  db.product.findFirst.mockResolvedValue({ id: 'p1', name: 'مقشر', image: null, basePrice: 12, batches: [] });
});

describe('order region binding', () => {
  it('refuses a region from another country', async () => {
    db.region.findFirst.mockResolvedValue(null); // not a region of co-jo
    const res = await POST(body({ regionId: REGION_JO }));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: expect.stringContaining('المحافظة') });
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('looks the region up inside the store’s country only', async () => {
    db.region.findFirst.mockResolvedValue({ id: REGION_JO });
    db.$transaction.mockResolvedValue({ id: 'o1', orderNumber: 'ORD-2026-0001' });
    await POST(body({ regionId: REGION_JO }));
    expect(db.region.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: REGION_JO, countryId: 'co-jo' } })
    );
  });

  it('still accepts an order without a region (it is blocked later, at shipment)', async () => {
    db.$transaction.mockResolvedValue({ id: 'o1', orderNumber: 'ORD-2026-0001' });
    const res = await POST(body());
    expect(res.status).not.toBe(400);
    expect(db.region.findFirst).not.toHaveBeenCalled();
  });
});
