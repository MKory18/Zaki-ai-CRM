import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * AN APPROVED CHANGE REQUEST, CARRIED OUT.
 *
 * Once a parcel is sealed — waybill printed, or in a handed-over batch — a
 * direct edit becomes a change request, and somebody who can reach the
 * courier decides. Until now the decision could never be carried out: the
 * edit that applied it hit the same seal and was refused.
 *
 * The approved request is now the one authority that passes the seal, and
 * only as far as it was approved. Every limit on that is a guard here, and
 * every guard has its negative test.
 */

const { db, requireContext, authorize, can, logAudit } = vi.hoisted(() => ({
  db: {
    order: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    orderChannel: { findFirst: vi.fn() },
    shippingBatch: { findFirst: vi.fn() },
    customer: { update: vi.fn() },
    orderStatusLog: { create: vi.fn() },
    orderActivity: { create: vi.fn() },
    orderChangeRequest: { findFirst: vi.fn(), updateMany: vi.fn() },
    $transaction: vi.fn(),
  },
  requireContext: vi.fn(),
  authorize: vi.fn(),
  can: vi.fn(),
  logAudit: vi.fn(),
}));

let ORDER: Record<string, unknown>;

vi.mock('@/lib/db', () => ({ db }));
vi.mock('@/lib/geo-context', () => ({ requireContext: (...a: unknown[]) => requireContext(...a) }));
vi.mock('@/lib/audit', () => ({ logAudit: (...a: unknown[]) => logAudit(...a) }));
vi.mock('@/lib/authorization', () => ({
  authorize: (...a: unknown[]) => authorize(...a),
  can: (...a: unknown[]) => can(...a),
  // The person carrying out an approved request holds company-wide edit —
  // which is exactly the authority that owes a reason on a DIRECT edit. The
  // request's own reason stands in its place here, and the tests below
  // prove the route asks for nothing extra.
  getPermissionScope: () => ({ scope: 'ALL_COMPANY' }),
}));
vi.mock('@/lib/rbac', () => ({
  assertOrderAccess: async () => ({ allowed: true, order: ORDER }),
  orderVisibilityWhere: () => ({}),
}));

import { PATCH } from './[id]/route';

const ORDER_ID = '11111111-2222-4333-8444-555555555555';
const REQUEST_ID = 'aaaaaaaa-1111-4222-8333-444444444444';

const patch = (body: unknown) =>
  PATCH(
    new Request(`http://localhost/api/orders/${ORDER_ID}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: ORDER_ID }) }
  );

const approved = (over: Record<string, unknown> = {}) => ({
  id: REQUEST_ID,
  orderId: ORDER_ID,
  status: 'APPROVED',
  appliedAt: null,
  reason: 'الزبون انتقل لشقة جديدة',
  decisionNote: 'تواصلت مع المندوب — موافق',
  changes: { customerAddress: { from: 'شارع قديم', to: 'شارع جديد' } },
  ...over,
});

/** The owner: a supervisor for change requests, WITHOUT the orders.edit scope on this order. */
function asOwnerWithoutEditScope() {
  requireContext.mockResolvedValue({
    user: { id: 'owner', name: 'المالك', role: 'COMPANY_ADMIN' },
    companyId: 'c1', storeId: 's1',
    country: { minorUnit: 2, currencyCode: 'JOD' },
  });
  authorize.mockReturnValue({ allowed: false, reason: 'OUT_OF_SCOPE' });
  can.mockImplementation(() => true);
}

beforeEach(() => {
  vi.clearAllMocks();
  ORDER = {
    id: ORDER_ID, companyId: 'c1', storeId: 's1', customerId: 'cu1', version: 3,
    confirmationStatus: 'CONFIRMED', shippingStatus: 'SHIPPED', shippedAt: new Date(),
    claimedById: null, lockedById: null, lockExpiresAt: null, shippingCost: 3,
  };
  asOwnerWithoutEditScope();
  db.order.findUnique.mockResolvedValue(ORDER);
  db.shippingBatch.findFirst.mockResolvedValue({ status: 'SHIPPED', batchNumber: 'BATCH-7' });
  db.$transaction.mockImplementation(async (fn: never) =>
    typeof fn === 'function' ? (fn as (tx: unknown) => unknown)(db) : fn
  );
  db.order.updateMany.mockResolvedValue({ count: 1 });
  db.order.update.mockResolvedValue(ORDER);
  db.customer.update.mockResolvedValue({});
  db.orderChangeRequest.findFirst.mockResolvedValue(approved());
  db.orderChangeRequest.updateMany.mockResolvedValue({ count: 1 });
});

describe('carrying out an approved request', () => {
  it('passes the seal that refuses the same edit made directly', async () => {
    // The control: the same address change, without a request, on the same
    // shipped order, is refused by the seal.
    authorize.mockReturnValue({ allowed: true });
    const direct = await patch({ expectedVersion: 3, customerAddress: 'شارع جديد' });
    expect(direct.status).toBe(409);
    expect((await direct.json()).code).toBe('ORDER_SEALED');

    asOwnerWithoutEditScope();
    const viaRequest = await patch({ expectedVersion: 3, changeRequestId: REQUEST_ID });
    expect(viaRequest.status).toBe(200);
  });

  it('writes the APPROVED value, taken from the request on the server', async () => {
    await patch({ expectedVersion: 3, changeRequestId: REQUEST_ID });
    const written = JSON.stringify(db.customer.update.mock.calls);
    expect(written).toContain('شارع جديد');
  });

  it('stands in for the orders.edit scope — for this order only', async () => {
    // The owner holds no edit scope on this order; the approved request is
    // the authority. authorize() is not what let it through.
    const res = await patch({ expectedVersion: 3, changeRequestId: REQUEST_ID });
    expect(res.status).toBe(200);
  });

  it('marks the request applied, once, by whom', async () => {
    await patch({ expectedVersion: 3, changeRequestId: REQUEST_ID });
    expect(db.orderChangeRequest.updateMany).toHaveBeenCalledWith({
      where: { id: REQUEST_ID, appliedAt: null },
      data: { appliedAt: expect.any(Date), appliedById: 'owner' },
    });
  });

  it('writes to the audit WHY the seal was passed: the reason and the decision', async () => {
    await patch({ expectedVersion: 3, changeRequestId: REQUEST_ID });
    const entry = logAudit.mock.calls.map((c) => c[0]).find((e) => e.entity === 'Order');
    expect(entry.action).toBe('ORDER_UPDATED_BY_CHANGE_REQUEST');
    expect(entry.userId).toBe('owner');
    expect(entry.newData.changeRequest).toEqual({
      id: REQUEST_ID,
      reason: 'الزبون انتقل لشقة جديدة',
      decision: 'تواصلت مع المندوب — موافق',
    });
  });
});

describe('the limits of that authority', () => {
  it('refuses any other field riding along with the request', async () => {
    // Negative: "an approved change of address" must not become a way to
    // change the phone of a parcel that has already left.
    const res = await patch({ expectedVersion: 3, changeRequestId: REQUEST_ID, customerPhone: '0799999999' });
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('STRAY_FIELDS');
    expect(db.customer.update).not.toHaveBeenCalled();
  });

  it('refuses a request that is still pending', async () => {
    db.orderChangeRequest.findFirst.mockResolvedValue(approved({ status: 'PENDING' }));
    const res = await patch({ expectedVersion: 3, changeRequestId: REQUEST_ID });
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('NOT_APPROVED');
  });

  it('refuses a rejected request', async () => {
    db.orderChangeRequest.findFirst.mockResolvedValue(approved({ status: 'REJECTED' }));
    const res = await patch({ expectedVersion: 3, changeRequestId: REQUEST_ID });
    expect((await res.json()).code).toBe('NOT_APPROVED');
  });

  it('refuses one that was already applied', async () => {
    db.orderChangeRequest.findFirst.mockResolvedValue(approved({ appliedAt: new Date() }));
    const res = await patch({ expectedVersion: 3, changeRequestId: REQUEST_ID });
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('ALREADY_APPLIED');
  });

  it('refuses a request belonging to another order', async () => {
    db.orderChangeRequest.findFirst.mockResolvedValue(approved({ orderId: 'some-other-order' }));
    const res = await patch({ expectedVersion: 3, changeRequestId: REQUEST_ID });
    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe('WRONG_ORDER');
  });

  it('refuses before confirmation — the order is still edited directly then', async () => {
    ORDER = { ...ORDER, confirmationStatus: 'IN_PROGRESS', shippingStatus: 'NOT_READY', shippedAt: null };
    const res = await patch({ expectedVersion: 3, changeRequestId: REQUEST_ID });
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('NOT_CONFIRMED');
  });

  it('refuses somebody who could not have decided it', async () => {
    requireContext.mockResolvedValue({
      user: { id: 'agent', name: 'سارة', role: 'CONFIRMATION_AGENT' },
      companyId: 'c1', storeId: 's1',
      country: { minorUnit: 2, currencyCode: 'JOD' },
    });
    can.mockImplementation(() => false);
    const res = await patch({ expectedVersion: 3, changeRequestId: REQUEST_ID });
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe('NOT_THE_DECIDER');
    expect(db.customer.update).not.toHaveBeenCalled();
  });

  it('refuses a request it cannot carry out whole, and names the field', async () => {
    // The order edit has no city and no offer. Applying half a request is
    // worse than refusing it and saying why.
    db.orderChangeRequest.findFirst.mockResolvedValue(
      approved({ changes: { customerAddress: { to: 'شارع' }, customerCity: { to: 'الزرقاء' } } })
    );
    const res = await patch({ expectedVersion: 3, changeRequestId: REQUEST_ID });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.code).toBe('NOT_APPLICABLE');
    expect(body.error).toContain('المدينة');
    expect(db.customer.update).not.toHaveBeenCalled();
  });

  it('looks the request up inside the company only', async () => {
    await patch({ expectedVersion: 3, changeRequestId: REQUEST_ID });
    expect(db.orderChangeRequest.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: REQUEST_ID, companyId: 'c1' } })
    );
  });

  it('leaves the ordinary edit exactly as it was when there is no request', async () => {
    authorize.mockReturnValue({ allowed: false, reason: 'OUT_OF_SCOPE' });
    const res = await patch({ expectedVersion: 3, customerNotes: 'x' });
    expect(res.status).toBe(404);
    expect(db.orderChangeRequest.findFirst).not.toHaveBeenCalled();
  });
});
