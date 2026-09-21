import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * What a confirmation agent may change on the order she is working on.
 *
 * She is on the phone with the customer, so she must be able to fix what
 * they just told her: a wrong name, a wrong street, a second unit. Sending
 * her to a supervisor for a spelling mistake is how an order gets confirmed
 * with a wrong address.
 *
 * But two fields are not hers. The CHANNEL is the order's attribution —
 * which campaign or page the sale is credited to, and what every source
 * report reads. SHIPPING is what the parcel costs to send. Both are refused
 * at the server, not merely hidden: a hidden control is a control that
 * anybody with a terminal still has.
 */

const { db, requireContext, authorize, can, logAudit } = vi.hoisted(() => ({
  db: {
    order: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    orderChannel: { findFirst: vi.fn() },
    shippingBatch: { findFirst: vi.fn() },
    customer: { update: vi.fn() },
    orderStatusLog: { create: vi.fn() },
    orderActivity: { create: vi.fn() },
    $transaction: vi.fn(),
  },
  requireContext: vi.fn(),
  authorize: vi.fn(),
  can: vi.fn(),
  logAudit: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ db }));
vi.mock('@/lib/geo-context', () => ({ requireContext: (...a: unknown[]) => requireContext(...a) }));
vi.mock('@/lib/audit', () => ({ logAudit: (...a: unknown[]) => logAudit(...a) }));
vi.mock('@/lib/authorization', () => ({
  authorize: (...a: unknown[]) => authorize(...a),
  can: (...a: unknown[]) => can(...a),
}));
vi.mock('@/lib/rbac', () => ({
  assertOrderAccess: async () => ({ allowed: true, order: ORDER }),
  orderVisibilityWhere: () => ({}),
}));

const CHANNEL_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const ORDER_ID = '11111111-2222-4333-8444-555555555555';
const ORDER = {
  id: ORDER_ID,
  companyId: 'c1',
  storeId: 's1',
  customerId: 'cu1',
  version: 3,
  confirmationStatus: 'CONTACTING',
  shippingStatus: 'NOT_READY',
  shippingCost: 5,
  channelId: '99999999-8888-4777-8666-555555555555',
  lockedById: null,
  lockExpiresAt: null,
};

import { PATCH } from './[id]/route';

const patch = (body: unknown) =>
  PATCH(
    new Request(`http://localhost/api/orders/${ORDER_ID}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: ORDER_ID }) }
  );

/** The agent: may edit her own orders, holds neither of the two authorities. */
function asAgent() {
  can.mockImplementation(() => false);
}
/** A manager: holds both. */
function asManager() {
  can.mockImplementation(() => true);
}

beforeEach(() => {
  vi.clearAllMocks();
  requireContext.mockResolvedValue({
    user: { id: 'u1', name: 'سارة', role: 'CONFIRMATION_AGENT' },
    companyId: 'c1',
    storeId: 's1',
    country: { minorUnit: 2, currencyCode: 'USD' },
  });
  authorize.mockReturnValue({ allowed: true });
  db.order.findUnique.mockResolvedValue(ORDER);
  db.orderChannel.findFirst.mockResolvedValue({ id: CHANNEL_ID, name: 'فيسبوك' });
  db.$transaction.mockImplementation(async (fn: never) =>
    typeof fn === 'function' ? (fn as (tx: unknown) => unknown)(db) : fn
  );
  db.order.updateMany.mockResolvedValue({ count: 1 });
  db.order.update.mockResolvedValue(ORDER);
});

describe('the confirmation agent', () => {
  beforeEach(asAgent);

  it('cannot move the order’s attribution to another channel', async () => {
    const res = await patch({ expectedVersion: 3, channelId: CHANNEL_ID });
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe('CHANNEL_FORBIDDEN');
    expect(db.orderChannel.findFirst).not.toHaveBeenCalled();
  });

  it('cannot decide what the parcel costs to send', async () => {
    const res = await patch({ expectedVersion: 3, shippingCost: 99 });
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe('SHIPPING_FORBIDDEN');
  });

  it('is refused even when the change is buried among allowed ones', async () => {
    // The guard is on the field, not on the shape of the request.
    const res = await patch({ expectedVersion: 3, customerName: 'محمد', shippingCost: 0 });
    expect(res.status).toBe(403);
  });
});

describe('someone who holds the authority', () => {
  beforeEach(asManager);

  it('may change the channel', async () => {
    const res = await patch({ expectedVersion: 3, channelId: CHANNEL_ID });
    expect(res.status).not.toBe(403);
    expect(db.orderChannel.findFirst).toHaveBeenCalled();
  });

  it('may change the shipping cost', async () => {
    const res = await patch({ expectedVersion: 3, shippingCost: 7 });
    expect(res.status).not.toBe(403);
  });
});

describe('an order whose batch has gone to the courier', () => {
  beforeEach(asManager);

  it('refuses the edit and points at a change request', async () => {
    // The parcel is on a van. The address the driver holds is fixed
    // somewhere we do not control, so this becomes somebody's decision,
    // not somebody's edit.
    db.shippingBatch.findFirst.mockResolvedValue({ status: 'SHIPPED', batchNumber: 'BATCH-2026-0007' });
    const res = await patch({ expectedVersion: 3, customerAddress: 'شارع آخر' });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe('ORDER_SEALED');
    expect(body.fields).toEqual(['customerAddress']);
    expect(body.error).toContain('طلب تعديل');
  });

  it('still lets a note through — it changes nothing for the driver', async () => {
    db.shippingBatch.findFirst.mockResolvedValue({ status: 'SHIPPED', batchNumber: 'B' });
    const res = await patch({ expectedVersion: 3, internalNotes: 'اتصل الزبون' });
    expect(res.status).not.toBe(409);
  });

  it('edits normally while the batch is still open', async () => {
    db.shippingBatch.findFirst.mockResolvedValue({ status: 'READY', batchNumber: 'B' });
    const res = await patch({ expectedVersion: 3, customerAddress: 'شارع آخر' });
    expect(res.status).not.toBe(409);
  });

  it('does not even look for a batch when nothing sealed was asked for', async () => {
    await patch({ expectedVersion: 3, internalNotes: 'x' });
    expect(db.shippingBatch.findFirst).not.toHaveBeenCalled();
  });
});
