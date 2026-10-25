import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Adding a conversion named `Purchase` on «تأكّد الطلب» is what the owner asked for. The door must say what
 * happens (the page stops sending Purchase to that pixel) rather than warn that Meta will count it twice —
 * and must still warn for every other place a `Purchase` would really double.
 */
const { db, requireCompanyTenant, requirePermission, logAudit } = vi.hoisted(() => ({
  db: {
    trackingPixel: { findFirst: vi.fn() },
    customConversion: { findFirst: vi.fn(), create: vi.fn() },
  },
  requireCompanyTenant: vi.fn(),
  requirePermission: vi.fn(),
  logAudit: vi.fn(),
}));
vi.mock('@/lib/db', () => ({ db }));
vi.mock('@/lib/auth', () => ({ requireCompanyTenant: (...a: unknown[]) => requireCompanyTenant(...a) }));
vi.mock('@/lib/authorization', () => ({ requirePermission: (...a: unknown[]) => requirePermission(...a), can: () => true }));
vi.mock('@/lib/audit', () => ({ logAudit: (...a: unknown[]) => logAudit(...a) }));
vi.mock('@/lib/api-error', () => ({ apiErrorResponse: (e: unknown) => new Response(String(e), { status: 500 }) }));

import { POST } from './route';

const PIXEL = '11111111-1111-4111-8111-111111111111';
const post = (eventName: string, trigger: string) =>
  POST(
    new Request('http://x/api/settings/conversions', {
      method: 'POST',
      body: JSON.stringify({ pixelId: PIXEL, name: 'شراء', eventName, trigger, enabled: true }),
    })
  );

beforeEach(() => {
  vi.clearAllMocks();
  requireCompanyTenant.mockResolvedValue({ user: { id: 'u1', name: 'احمد' }, companyId: 'co' });
  db.trackingPixel.findFirst.mockResolvedValue({ id: PIXEL, platform: 'META', name: 'm', capiToken: 'enc' });
  db.customConversion.findFirst.mockResolvedValue(null);
  db.customConversion.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'c1', ...data }));
});

describe('a Purchase on the confirmation', () => {
  it('is saved with a NOTE that the page stops sending Purchase to this pixel — and no collision warning', async () => {
    const body = await (await post('Purchase', 'order.confirmed')).json();
    expect(body.success).toBe(true);
    expect(body.warning).toBeNull();
    expect(body.note).toContain('عند تأكيد الطلب');
  });

  it('NEGATIVE: Purchase on the form’s submit or on delivery is still warned about, with no note', async () => {
    for (const trigger of ['order.created', 'order.delivered']) {
      const body = await (await post('Purchase', trigger)).json();
      expect(body.warning, trigger).toContain('تضاعف');
      expect(body.note, trigger).toBeNull();
    }
  });

  it('NEGATIVE: a custom name on the confirmation carries neither a note nor a warning', async () => {
    const body = await (await post('OrderConfirmed', 'order.confirmed')).json();
    expect(body.note).toBeNull();
    expect(body.warning).toBeNull();
  });
});
