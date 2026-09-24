import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A number the store's country cannot dial is not a phone number.
 *
 * The rule existed and was enforced on the public landing page only, so the
 * CRM itself accepted any seven characters. That is where most "رقم خاطئ"
 * issues came from: nothing refused the number until an agent tried to call
 * it, and the correction screen could then write a second wrong one in its
 * place. Create and edit both check it now, against the country of the store
 * the order belongs to — never a hard-coded country.
 */

const { db, requireContext, assertOrderAccess, authorize, logAudit, activeBlock } = vi.hoisted(() => ({
  db: {
    order: { findFirst: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn(), update: vi.fn() },
    customer: { findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    orderNote: { create: vi.fn() },
    orderActivity: { create: vi.fn() },
    orderStatusLog: { create: vi.fn() },
    // A phone is one of the fields the courier acts on, so the edit path now
    // asks whether the order's batch has been handed over.
    shippingBatch: { findFirst: vi.fn() },
    $transaction: vi.fn(),
  },
  requireContext: vi.fn(),
  assertOrderAccess: vi.fn(),
  authorize: vi.fn(),
  logAudit: vi.fn(),
  activeBlock: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ db }));
vi.mock('@/lib/geo-context', () => ({ requireContext: (...a: unknown[]) => requireContext(...a) }));
vi.mock('@/lib/rbac', () => ({
  assertOrderAccess: (...a: unknown[]) => assertOrderAccess(...a),
  applyQueueFilter: (_u: unknown, w: unknown) => w,
}));
vi.mock('@/lib/audit', () => ({ logAudit: (...a: unknown[]) => logAudit(...a) }));
vi.mock('@/lib/blacklist', () => ({ activeBlock: (...a: unknown[]) => activeBlock(...a) }));
vi.mock('@/lib/notification', () => ({ createNotification: vi.fn() }));
vi.mock('@/lib/authorization', () => ({
  can: () => true,
  authorize: (...a: unknown[]) => authorize(...a),
  requirePermission: vi.fn(),
  getPermissionScope: () => ({ scope: 'ALL_COMPANY' }),
}));

import { PATCH } from './[id]/route';

const ORDER_ID = '44444444-4444-4444-8444-444444444444';
const params = { params: Promise.resolve({ id: ORDER_ID }) };

const syria = {
  id: 'co-sy', code: 'SY', name: 'سوريا', currencyCode: 'USD', minorUnit: 2,
  timezone: 'Asia/Damascus', orderPrefix: 'SY', allowNegativeStock: false,
};

const existing = {
  id: ORDER_ID, companyId: 'c1', storeId: 's1', countryId: 'co-sy', version: 3,
  customerId: 'cu1', confirmationStatus: 'NEW', shippingStatus: 'NOT_READY',
  status: 'NEW', settlementStatus: null, sellingPrice: 10, quantity: 1,
  discountAmount: 0, shippingCost: 0, confirmedAt: null, lockedById: null, lockExpiresAt: null,
};

// The actor here is mocked with company-wide edit scope, which owes a reason
// on any substantive edit (src/lib/order-edit-reason.ts). That rule is not
// what these tests are about, so the helper supplies one and the phone rule
// is what is left being measured.
const patch = (body: Record<string, unknown>) =>
  PATCH(
    new Request('http://localhost/x', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'تصحيح رقم بعد مكالمة', ...body }),
    }),
    params
  );

beforeEach(() => {
  vi.clearAllMocks();
  requireContext.mockResolvedValue({
    user: { id: 'u1', name: 'مودريتور', role: 'MODERATOR', status: 'ACTIVE' },
    companyId: 'c1', storeId: 's1', countryId: 'co-sy', country: syria,
  });
  assertOrderAccess.mockResolvedValue({ allowed: true, order: existing });
  authorize.mockReturnValue({ allowed: true });
  db.customer.findFirst.mockResolvedValue(null);
  // These orders are still being worked; nothing has gone to a courier.
  db.shippingBatch.findFirst.mockResolvedValue(null);
  db.$transaction.mockImplementation(async (fn: any) => fn(db));
  db.order.updateMany.mockResolvedValue({ count: 1 });
  db.order.findFirst.mockResolvedValue(existing);
  db.order.findUnique.mockResolvedValue({ ...existing, version: 4 });
});

describe('correcting a phone number cannot write another wrong one', () => {
  it('refuses a Jordanian number on a Syrian store', async () => {
    const res = await patch({ expectedVersion: 3, customerPhone: '0790123456' });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.code).toBe('INVALID_PHONE');
    expect(body.error).toContain('سوري');
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('refuses a number that is simply too short', async () => {
    const res = await patch({ expectedVersion: 3, customerPhone: '09321' });
    expect(res.status).toBe(400);
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('accepts a real Syrian mobile', async () => {
    const res = await patch({ expectedVersion: 3, customerPhone: '0944555666' });
    expect(res.status).toBe(200);
    expect(db.$transaction).toHaveBeenCalled();
  });

  it('writes WHY it was corrected into the audit, not just who and what', async () => {
    // The actor edits on company-wide authority, so the route demanded a
    // reason (src/lib/order-edit-reason.ts). It has to survive as far as the
    // audit entry, or the demand bought nothing.
    await patch({ expectedVersion: 3, customerPhone: '0944555666', reason: 'الزبون أعطى رقماً جديداً' });
    expect(JSON.stringify(logAudit.mock.calls)).toContain('الزبون أعطى رقماً جديداً');
  });

  it('accepts the same number written internationally', async () => {
    const res = await patch({ expectedVersion: 3, customerPhone: '+963944555666' });
    expect(res.status).toBe(200);
  });

  it('judges by the store country, not a hard-coded one', async () => {
    // The same Jordanian number is correct on the Jordanian store.
    requireContext.mockResolvedValue({
      user: { id: 'u1', name: 'مودريتور', role: 'MODERATOR', status: 'ACTIVE' },
      companyId: 'c1', storeId: 's1', countryId: 'co-jo',
      country: { ...syria, id: 'co-jo', code: 'JO', name: 'الأردن', currencyCode: 'JOD', minorUnit: 3 },
    });
    assertOrderAccess.mockResolvedValue({ allowed: true, order: { ...existing, countryId: 'co-jo' } });

    const res = await patch({ expectedVersion: 3, customerPhone: '0790123456' });
    expect(res.status).toBe(200);
  });

  it('leaves an edit that does not touch the phone alone', async () => {
    const res = await patch({ expectedVersion: 3, customerName: 'محمد الحسن' });
    expect(res.status).toBe(200);
  });

  it('still refuses a stale version — the guard is not a way around it', async () => {
    const res = await patch({ expectedVersion: 1, customerPhone: '0944555666' });
    const body = await res.json();
    expect(res.status).toBe(409);
    expect(body.code).toBe('VERSION_CONFLICT');
  });
});
