import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * An order moves sideways, never across jobs.
 *
 * Transfer accepted any active colleague, so a confirmation order could be
 * handed to the warehouse: a pair of hands that cannot do the next thing it
 * needs, and a queue that would never show it again. Whoever holds it hands
 * it to someone who holds the same role.
 */

const { db, requireContext, assertOrderAccess, authorize, can, logAudit } = vi.hoisted(() => ({
  db: {
    user: { findUnique: vi.fn(), findMany: vi.fn() },
    order: { updateMany: vi.fn(), findUnique: vi.fn() },
    orderClaimHistory: { create: vi.fn() },
    orderActivity: { create: vi.fn() },
  },
  requireContext: vi.fn(),
  assertOrderAccess: vi.fn(),
  authorize: vi.fn(),
  can: vi.fn(),
  logAudit: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ db }));
vi.mock('@/lib/geo-context', () => ({ requireContext: (...a: unknown[]) => requireContext(...a) }));
vi.mock('@/lib/rbac', () => ({ assertOrderAccess: (...a: unknown[]) => assertOrderAccess(...a) }));
vi.mock('@/lib/order-locks', () => ({ ownershipSnapshot: vi.fn() }));
vi.mock('@/lib/audit', () => ({ logAudit: (...a: unknown[]) => logAudit(...a) }));
vi.mock('@/lib/authorization', () => ({
  authorize: (...a: unknown[]) => authorize(...a),
  can: (...a: unknown[]) => can(...a),
}));

import { POST, GET } from './[id]/transfer/route';

const ORDER_ID = '55555555-5555-4555-8555-555555555555';
const params = { params: Promise.resolve({ id: ORDER_ID }) };

const HOLDER = { id: 'agent-1', name: 'سارة', role: 'CONFIRMATION_AGENT', roleId: 'role-conf' };
const PEER = { id: 'agent-2', name: 'ليلى', companyId: 'c1', status: 'ACTIVE', role: 'CONFIRMATION_AGENT', roleId: 'role-conf' };
const WAREHOUSE = { id: 'wh-1', name: 'أبو أحمد', companyId: 'c1', status: 'ACTIVE', role: 'WAREHOUSE', roleId: 'role-wh' };

const order = {
  id: ORDER_ID, companyId: 'c1', version: 2, status: 'NEW',
  claimedById: HOLDER.id, currentOwnerId: HOLDER.id,
};

const post = (body: unknown) =>
  POST(
    new Request('http://localhost/x', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    params
  );

beforeEach(() => {
  vi.clearAllMocks();
  requireContext.mockResolvedValue({
    user: { id: 'manager', name: 'المدير', role: 'MANAGER' },
    companyId: 'c1', storeId: 's1',
  });
  assertOrderAccess.mockResolvedValue({ allowed: true, order });
  authorize.mockReturnValue({ allowed: true });
  can.mockReturnValue(true);
  db.order.updateMany.mockResolvedValue({ count: 1 });
  db.order.findUnique.mockResolvedValue(order);
  db.user.findUnique.mockImplementation(async ({ where }: any) => {
    if (where.id === PEER.id) return PEER;
    if (where.id === WAREHOUSE.id) return WAREHOUSE;
    if (where.id === HOLDER.id) return HOLDER;
    return null;
  });
});

describe('a transfer stays within the same job', () => {
  it('hands the order to a colleague of the same role', async () => {
    const res = await post({ targetUserId: PEER.id, reason: 'إجازة سارة' });
    expect(res.status).toBe(200);
    expect(db.order.updateMany).toHaveBeenCalled();
  });

  it('refuses to hand a confirmation order to the warehouse', async () => {
    const res = await post({ targetUserId: WAREHOUSE.id, reason: 'تجربة' });
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.code).toBe('DIFFERENT_RANK');
    expect(db.order.updateMany).not.toHaveBeenCalled();
  });

  it('refuses it for a manager too — rank is not a permission', async () => {
    // orders.assign lets a manager move an order; it does not let them put it
    // in hands that cannot work it.
    authorize.mockReturnValue({ allowed: true });
    const res = await post({ targetUserId: WAREHOUSE.id, reason: 'قرار إداري' });
    expect(res.status).toBe(409);
  });

  it('still demands a reason', async () => {
    const res = await post({ targetUserId: PEER.id });
    expect(res.status).toBe(400);
    expect(db.order.updateMany).not.toHaveBeenCalled();
  });

  it('still refuses a delivered order', async () => {
    assertOrderAccess.mockResolvedValue({ allowed: true, order: { ...order, status: 'DELIVERED' } });
    const res = await post({ targetUserId: PEER.id, reason: 'تصحيح' });
    expect((await res.json()).code).toBe('TERMINAL_STATUS');
  });

  it('still refuses a stale version', async () => {
    db.order.updateMany.mockResolvedValue({ count: 0 });
    const res = await post({ targetUserId: PEER.id, reason: 'إجازة سارة' });
    expect((await res.json()).code).toBe('VERSION_CONFLICT');
  });
});

describe('the screen is offered exactly what the server accepts', () => {
  it('lists only colleagues of the holder’s role', async () => {
    db.user.findMany.mockResolvedValue([{ id: PEER.id, name: PEER.name, email: 'l@x.com' }]);

    const body = await (await GET(new Request('http://localhost/x'), params)).json();

    expect(body.mayTransfer).toBe(true);
    expect(body.holder.name).toBe('سارة');
    expect(db.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ companyId: 'c1', status: 'ACTIVE', roleId: 'role-conf' }),
      })
    );
    expect(body.candidates).toHaveLength(1);
  });

  it('offers nobody when this person may not transfer at all', async () => {
    authorize.mockReturnValue({ allowed: false });
    can.mockReturnValue(false);

    const body = await (await GET(new Request('http://localhost/x'), params)).json();
    expect(body.mayTransfer).toBe(false);
    expect(body.candidates).toEqual([]);
  });

  it('never offers the holder themselves', async () => {
    db.user.findMany.mockResolvedValue([]);
    await GET(new Request('http://localhost/x'), params);
    expect(db.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: { not: HOLDER.id } }) })
    );
  });
});
