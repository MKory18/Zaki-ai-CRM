import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * RECORDING A CALL IS ITS OWN ACT, SO IT IS ITS OWN PERMISSION.
 *
 * This door used to open for `orders.edit` OR `orders.claim`, and the
 * `contact_result` action next door rode on `orders.confirm`. Three
 * permissions, none of them about the telephone — so on «الصلاحيات» the
 * owner had no tick for «تسجيل نتيجة الاتصال» at all. He could not grant
 * it to a role, and he could not take it away without also taking away
 * editing, or claiming, or confirming.
 *
 * Asked at the door: what comes back, and whether a row was written.
 * ═══════════════════════════════════════════════════════════════════════
 */

const { db, requireContext, can, authorize, assertOrderAccess, logAudit } = vi.hoisted(() => ({
  db: {
    orderContactAttempt: { count: vi.fn(), create: vi.fn(), findMany: vi.fn(), findFirst: vi.fn() },
    order: { update: vi.fn(), findUnique: vi.fn() },
    orderActivity: { create: vi.fn() },
    $transaction: vi.fn(),
  },
  requireContext: vi.fn(),
  can: vi.fn(),
  authorize: vi.fn(),
  assertOrderAccess: vi.fn(),
  logAudit: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ db }));
vi.mock('@/lib/geo-context', () => ({ requireContext: (...a: unknown[]) => requireContext(...a) }));
vi.mock('@/lib/authorization', () => ({
  can: (...a: unknown[]) => can(...a),
  authorize: (...a: unknown[]) => authorize(...a),
}));
vi.mock('@/lib/rbac', () => ({
  ORDER_ACCESS_STATUS: { NOT_FOUND: 404, WRONG_COMPANY: 404, NOT_ASSIGNED: 403 },
  assertOrderAccess: (...a: unknown[]) => assertOrderAccess(...a),
  assertOrderReadable: vi.fn(),
}));
vi.mock('@/lib/audit', () => ({ logAudit: (...a: unknown[]) => logAudit(...a) }));
vi.mock('@/lib/reservation', () => ({ releaseOrderLines: vi.fn() }));
// `@/lib/order-state` is NOT mocked: `confirmation-workflow` reads its
// labels at import time, and a stub of it takes the whole route down before
// a single assertion runs. It is only reached on the third no-answer, which
// these fixtures never produce.
vi.mock('@/lib/api-error', () => ({
  apiErrorResponse: (e: unknown) =>
    new Response(JSON.stringify({ error: `UNEXPECTED: ${(e as Error)?.message}` }), { status: 500 }),
}));

import { POST } from './route';

const ORDER = {
  id: 'o1',
  companyId: 'c1',
  orderNumber: 'ORD-1',
  confirmationStatus: 'NEW',
  noAnswerCount: 0,
  customerId: 'cu1',
};

/** Everything this role may do, by permission key. */
const holding = (...keys: string[]) => {
  can.mockImplementation((_u: unknown, k: string) => keys.includes(k));
  authorize.mockImplementation((_u: unknown, k: string) => ({ allowed: keys.includes(k) }));
};

const record = () =>
  POST(
    new Request('http://localhost/api/orders/o1/contact-attempts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contactMethod: 'PHONE', result: 'NO_ANSWER' }),
    }),
    { params: Promise.resolve({ id: 'o1' }) }
  );

beforeEach(() => {
  vi.clearAllMocks();
  requireContext.mockResolvedValue({
    user: { id: 'a1', name: 'الموظّفة', role: 'CONFIRMATION_AGENT' },
    companyId: 'c1',
    storeId: 's1',
  });
  assertOrderAccess.mockResolvedValue({ allowed: true, order: ORDER });
  db.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(db));
  db.orderContactAttempt.count.mockResolvedValue(0);
  db.orderContactAttempt.findFirst.mockResolvedValue(null);
  db.orderContactAttempt.findMany.mockResolvedValue([]);
  db.orderContactAttempt.create.mockResolvedValue({ id: 'at1', attemptNumber: 1, createdAt: new Date() });
  db.order.update.mockResolvedValue({ ...ORDER, noAnswerCount: 1 });
  db.orderActivity.create.mockResolvedValue({});
  logAudit.mockResolvedValue(undefined);
});

describe('recording what happened on a call', () => {
  it('is refused without orders.contact_log, even holding everything it used to take', async () => {
    // The exact three it used to ride on. Each of them alone opened this
    // door yesterday; none of them opens it now.
    holding('orders.edit', 'orders.claim', 'orders.confirm', 'orders.view');

    const res = await record();
    const body = await res.json();

    expect(res.status, JSON.stringify(body)).toBe(403);
    expect(body.code).toBe('CONTACT_LOG_NOT_ALLOWED');
    expect(body.errorAr).toContain('تسجيل نتيجة الاتصال');
    expect(db.orderContactAttempt.create, 'انكتبت محاولة رغم الرفض').not.toHaveBeenCalled();
  });

  it('and works with it, exactly as it did before', async () => {
    holding('orders.contact_log', 'orders.edit', 'orders.view');

    const res = await record();
    expect(res.status).toBe(200);
    expect(db.orderContactAttempt.create).toHaveBeenCalledTimes(1);
  });

  it('and the permission alone is not a way past the other gates', async () => {
    // It ADDS a requirement; it does not replace the edit/claim authority
    // the door already asked for. A role with the phone permission and no
    // business touching the order is still refused.
    holding('orders.contact_log', 'orders.view');

    const res = await record();
    expect(res.status).toBe(403);
    expect(db.orderContactAttempt.create).not.toHaveBeenCalled();
  });
});
