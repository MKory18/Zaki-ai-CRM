import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * ONCE IT IS CONFIRMED, AN EDIT IS A REQUEST — AND THE STATUS HAS ONE DOOR.
 *
 * The owner's rule, in his words: «لما يتأكد الطلب، الموظف ما بيقدر يعدله
 * ولا يغير حالته — التعديل يصير طلب تعديل، والقرار إلي».
 *
 * Both halves were already built and neither was enforced here.
 *
 *   THE EDIT. `OrderChangeRequest`, the routing, «طلبات التعديل» and the
 *   apply path all existed, reached from the agent's queue and from the
 *   «تعديل · إلغاء · تأجيل» card. Meanwhile «تعديل» on the customer card
 *   and the lines card saved straight through this route, in every state,
 *   and only a SEALED order was refused. So a confirmed order whose label
 *   had not been printed was edited in place by anybody holding
 *   `orders.edit`, with nothing raised and nobody deciding.
 *
 *   THE STATUS. `/api/orders/[id]/confirmation` holds the transition
 *   table, the «call first» rule and the terminal lock on CONFIRMED /
 *   REJECTED / CANCELLED. This route also accepted `status` and
 *   `confirmationStatus` and checked only `orders.confirm` — which
 *   `CONFIRMATION_AGENT` and `MODERATOR` both hold. So whoever held a
 *   confirmed order could move it back to NEW or cancel it through here,
 *   with none of the three rules applying.
 *
 * These claims run the door and read the answer.
 * ═══════════════════════════════════════════════════════════════════════
 */

const {
  db, requireContext, can, authorize, getPermissionScope, assertOrderAccess, logAudit, notify,
} = vi.hoisted(() => ({
  db: {
    order: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    orderChangeRequest: { findFirst: vi.fn() },
    shippingBatch: { findFirst: vi.fn() },
    user: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  },
  requireContext: vi.fn(),
  can: vi.fn(),
  authorize: vi.fn(),
  getPermissionScope: vi.fn(),
  assertOrderAccess: vi.fn(),
  logAudit: vi.fn(),
  notify: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ db }));
vi.mock('@/lib/geo-context', () => ({ requireContext: (...a: unknown[]) => requireContext(...a) }));
vi.mock('@/lib/authorization', () => ({
  can: (...a: unknown[]) => can(...a),
  authorize: (...a: unknown[]) => authorize(...a),
  getPermissionScope: (...a: unknown[]) => getPermissionScope(...a),
  requirePermission: vi.fn(),
}));
vi.mock('@/lib/rbac', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  assertOrderAccess: (...a: unknown[]) => assertOrderAccess(...a),
  assertOrderReadable: vi.fn(),
}));
vi.mock('@/lib/pii-alert', () => ({ noteCustomersHandedOut: vi.fn() }));
vi.mock('@/lib/audit', () => ({ logAudit: (...a: unknown[]) => logAudit(...a) }));
vi.mock('@/lib/notify', () => ({ notify: (...a: unknown[]) => notify(...a) }));
vi.mock('@/lib/api-error', () => ({
  apiError: (e: unknown) => ({ body: { error: `UNEXPECTED: ${(e as Error)?.message}` }, status: 500 }),
}));

import { PATCH } from './route';

/** The order under the window. CONFIRMED unless a claim says otherwise. */
const ORDER = {
  id: 'o1',
  companyId: 'c1',
  storeId: 's1',
  version: 7,
  orderNumber: 'ORD-1',
  status: 'CONFIRMED',
  confirmationStatus: 'CONFIRMED',
  shippingStatus: 'NOT_READY',
  shippedAt: null,
  labelPrintedAt: null,
  handedToCourierAt: null,
  claimedById: null,
  lockedById: null,
  lockExpiresAt: null,
  deliveryProviderId: null,
  confirmedAt: new Date('2026-10-15T05:00:00.000Z'),
  quantity: 1,
  sellingPrice: 10,
  discountAmount: 0,
  shippingCost: 0,
  totalAmount: 10,
  customerId: 'cu1',
  noAnswerCount: 0,
  postponeCount: 0,
};

const patch = async (body: Record<string, unknown>) => {
  const res = await PATCH(
    new Request('http://localhost/api/orders/o1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expectedVersion: 7, ...body }),
    }),
    { params: Promise.resolve({ id: 'o1' }) }
  );
  if (!res) throw new Error('PATCH answered nothing');
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
};

beforeEach(() => {
  vi.clearAllMocks();
  requireContext.mockResolvedValue({
    user: { id: 'u1', role: 'CONFIRMATION_AGENT', companyId: 'c1' },
    companyId: 'c1',
    storeId: 's1',
    countryId: 'co1',
    country: { code: 'JO', currencyCode: 'JOD', minorUnit: 3 },
  });
  can.mockReturnValue(false);
  authorize.mockReturnValue({ allowed: true });
  getPermissionScope.mockReturnValue({ scope: 'ASSIGNED' });
  assertOrderAccess.mockResolvedValue({ allowed: true, order: { ...ORDER } });
  db.order.findUnique.mockResolvedValue({ ...ORDER });
  db.order.findFirst.mockResolvedValue({ ...ORDER });
  db.shippingBatch.findFirst.mockResolvedValue(null);
  db.orderChangeRequest.findFirst.mockResolvedValue(null);
});

describe('a confirmed order', () => {
  it('refuses a direct edit of a customer field, and names the door', async () => {
    const res = await patch({ customerName: 'أبو محمد' });

    expect(res.status, JSON.stringify(res.body)).toBe(409);
    expect(res.body.code).toBe('CHANGE_REQUEST_REQUIRED');
    expect(String(res.body.errorAr)).toContain('طلب تعديل');
    expect(db.order.update, 'انعدّل الطلب المؤكَّد مباشرةً').not.toHaveBeenCalled();
  });

  it('and refuses a direct edit of a line, the same way', async () => {
    const res = await patch({ quantity: 5 });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('CHANGE_REQUEST_REQUIRED');
    expect(res.body.fields).toContain('quantity');
  });

  it('and says which fields were refused, in Arabic', async () => {
    // So the screen can name them rather than saying «تعذر الحفظ».
    const res = await patch({ customerAddress: 'شارع آخر', regionId: '22222222-2222-4222-8222-222222222222' });

    expect(res.status, JSON.stringify(res.body)).toBe(409);
    expect(res.body.fields).toEqual(expect.arrayContaining(['customerAddress', 'regionId']));
    expect(res.body.fieldsAr).toEqual(expect.arrayContaining(['العنوان', 'المحافظة']));
  });
});

describe('an order that is not confirmed yet', () => {
  it('is still edited directly — nothing changed before the line', async () => {
    // The agent still has it and the customer is still on the phone.
    const open = { ...ORDER, status: 'NEW', confirmationStatus: 'NEW' };
    assertOrderAccess.mockResolvedValue({ allowed: true, order: open });
    db.order.findUnique.mockResolvedValue(open);
    db.order.findFirst.mockResolvedValue(open);

    const res = await patch({ customerName: 'أبو محمد' });

    expect(res.status, JSON.stringify(res.body)).not.toBe(409);
    expect(res.body.code).not.toBe('CHANGE_REQUEST_REQUIRED');
  });
});

describe('the confirmation status', () => {
  it('cannot be changed through this route at all', async () => {
    const res = await patch({ confirmationStatus: 'NEW' });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('USE_CONFIRMATION_DOOR');
    expect(db.order.update).not.toHaveBeenCalled();
  });

  it('nor through the combined status field, which is the same decision', async () => {
    const res = await patch({ status: 'CANCELLED' });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('USE_CONFIRMATION_DOOR');
  });

  it('and holding orders.confirm is no longer enough — that was the hole', async () => {
    // `CONFIRMATION_AGENT` and `MODERATOR` both hold it, so «whoever holds
    // a confirmed order can cancel it» was true for most of the staff.
    can.mockImplementation((_u: unknown, key: string) => key === 'orders.confirm');
    const res = await patch({ confirmationStatus: 'CANCELLED' });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('USE_CONFIRMATION_DOOR');
  });

  it('and with the override permission it still needs a reason in writing', async () => {
    can.mockImplementation((_u: unknown, key: string) => key === 'orders.unlock');
    const res = await patch({ confirmationStatus: 'NEW' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('REASON_REQUIRED');
    expect(db.order.update).not.toHaveBeenCalled();
  });

  it('and a reason too short to mean anything is not a reason', async () => {
    can.mockImplementation((_u: unknown, key: string) => key === 'orders.unlock');
    const res = await patch({ confirmationStatus: 'NEW', reason: 'لا' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('REASON_REQUIRED');
  });

  it('and with both, the override is let through to the rest of the route', async () => {
    can.mockImplementation((_u: unknown, key: string) => key === 'orders.unlock');
    const res = await patch({
      confirmationStatus: 'NEW',
      reason: 'الزبون اتصل ورجع عن الإلغاء، وبموافقة المالك',
    });

    // Not refused by either of the two new gates. What happens after them
    // is the rest of this route's business, held by its own tests.
    expect(res.body.code).not.toBe('USE_CONFIRMATION_DOOR');
    expect(res.body.code).not.toBe('REASON_REQUIRED');
  });
});

describe('and an approved request coming back to be applied', () => {
  it('is not refused by the new gate — it IS the pipeline', async () => {
    /*
     * The apply step carries `changeRequestId`, which is how the decided
     * request reaches the order. Refusing that would close the only door
     * this change leaves open.
     */
    db.orderChangeRequest.findFirst.mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
      orderId: 'o1',
      status: 'APPROVED',
      appliedAt: null,
      changes: { customerName: { to: 'أبو محمد' } },
      reason: 'الزبون غيّر الاسم',
      decisionNote: null,
      requestedById: 'u2',
    });

    const res = await patch({ changeRequestId: '11111111-1111-4111-8111-111111111111' });

    expect(res.body.code, JSON.stringify(res.body)).not.toBe('CHANGE_REQUEST_REQUIRED');
  });
});
