import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * A GUARD WITH A SIBLING DOOR AROUND IT IS NOT A GUARD.
 *
 * `orders.contact_log` was put on the contact-attempts route and on the
 * `contact_result` action — the two the task names. This route writes a
 * `CallLog` carrying the same `CONTACT_RESULTS` values and moves
 * `confirmationStatus` from them.
 *
 * So the owner unticks «تسجيل نتيجة الاتصال» for a role, reads that it can
 * no longer record call results, and the role records them here. The
 * permission would be a promise the system does not keep.
 *
 * Found by the independent review, not by the task's own list — which is
 * the kind of thing a list of two doors cannot find.
 * ═══════════════════════════════════════════════════════════════════════
 */

const { db, requireContext, can, authorize, assertOrderAccess, logAudit } = vi.hoisted(() => ({
  db: {
    callLog: { create: vi.fn(), findMany: vi.fn() },
    order: { update: vi.fn(), findUnique: vi.fn() },
    orderStatusLog: { create: vi.fn() },
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
}));
vi.mock('@/lib/audit', () => ({ logAudit: (...a: unknown[]) => logAudit(...a) }));
vi.mock('@/lib/api-error', () => ({
  apiError: (e: unknown) => ({ body: { error: `UNEXPECTED: ${(e as Error)?.message}` }, status: 500 }),
}));

import { POST } from './route';

const ORDER = {
  id: 'o1',
  companyId: 'c1',
  orderNumber: 'ORD-3',
  confirmationStatus: 'IN_PROGRESS',
  status: 'CLAIMED',
};

const recordCall = () =>
  POST(
    new Request('http://localhost/api/orders/o1/call-logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ result: 'NO_ANSWER' }),
    }),
    { params: Promise.resolve({ id: 'o1' }) }
  );

/** Everything this role may do, by permission key. */
const holding = (...keys: string[]) => {
  can.mockImplementation((_u: unknown, k: string) => keys.includes(k));
  authorize.mockImplementation((_u: unknown, k: string) =>
    keys.includes(k) ? { allowed: true } : { allowed: false, reason: 'NO_SCOPE' }
  );
};

beforeEach(() => {
  vi.clearAllMocks();
  requireContext.mockResolvedValue({
    user: { id: 'a1', name: 'سارة', role: 'CONFIRMATION_AGENT' },
    companyId: 'c1',
    storeId: 's1',
  });
  assertOrderAccess.mockResolvedValue({ allowed: true, order: ORDER });
  db.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(db));
  db.callLog.create.mockResolvedValue({ id: 'cl1', callDate: new Date() });
  db.order.update.mockResolvedValue(ORDER);
  db.orderStatusLog.create.mockResolvedValue({});
  db.orderActivity.create.mockResolvedValue({});
  logAudit.mockResolvedValue(undefined);
});

describe('recording a call from the order window', () => {
  it('is refused without orders.contact_log, even holding orders.edit', async () => {
    // `orders.edit` is what this door used to ask for, and it alone opened
    // it. The whole point is that it no longer does.
    holding('orders.edit', 'orders.view', 'orders.confirm');

    const res = await recordCall();
    const body = await res.json();

    expect(res.status, JSON.stringify(body)).toBe(403);
    expect(body.code).toBe('CONTACT_LOG_NOT_ALLOWED');
    expect(db.callLog.create, 'انكتب سجلّ مكالمة رغم الرفض').not.toHaveBeenCalled();
  });

  it('and works with it, as it did before', async () => {
    holding('orders.edit', 'orders.view', 'orders.contact_log');
    // A call that leaves the order where it is: the only kind this door writes now.
    assertOrderAccess.mockResolvedValue({ allowed: true, order: { ...ORDER, status: 'NO_ANSWER' } });

    const res = await recordCall();
    expect(res.status, await res.clone().text()).toBeLessThan(400);
    expect(db.callLog.create).toHaveBeenCalledTimes(1);
  });

  it('and the permission alone does not replace the edit authority', async () => {
    // It ADDS a requirement. A role with the phone permission and no
    // business editing the order is still refused.
    holding('orders.contact_log', 'orders.view');

    const res = await recordCall();
    expect(res.status).toBe(403);
    expect(db.callLog.create).not.toHaveBeenCalled();
  });
});

/**
 * AND IT NO LONGER MOVES THE ORDER.
 *
 * «مؤكد» from here wrote CONFIRMED with no stock reserved, «مرفوض» released
 * nothing, and neither asked for the editing lock — the confirmation door's
 * rules, skipped by a door nothing on screen calls any more. A result that
 * would move the order is refused with the way to the right door, and
 * nothing at all is written — even for someone who may confirm.
 */
describe('a result that would move the order', () => {
  const call = (result: string, extra: Record<string, unknown> = {}) =>
    POST(
      new Request('http://localhost/api/orders/o1/call-logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ result, ...extra }),
      }),
      { params: Promise.resolve({ id: 'o1' }) }
    );

  it.each([
    ['CONFIRMED', {}],
    ['REJECTED', { rejectionReason: 'PRICE_TOO_HIGH' }],
    ['NO_ANSWER', {}],
  ])('«%s» is sent to the confirmation door, and nothing is written', async (result, extra) => {
    holding('orders.edit', 'orders.view', 'orders.contact_log', 'orders.confirm');
    const res = await call(result, extra);
    const body = await res.json();
    expect(res.status, JSON.stringify(body)).toBe(409);
    expect(body.code).toBe('USE_CONFIRMATION_DOOR');
    expect(db.callLog.create).not.toHaveBeenCalled();
    expect(db.order.update).not.toHaveBeenCalled();
    expect(db.orderStatusLog.create).not.toHaveBeenCalled();
  });
});
