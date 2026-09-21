import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * «تأجيل» has to land where it says it lands.
 *
 * Two failures met here, and to the agent they were one: she pressed
 * postpone on an order and it never appeared on the postponed screen, and
 * when she pressed it on an order already awaiting a callback the server
 * answered "Cannot schedule follow-up from status FOLLOW_UP_REQUIRED".
 *
 * Moving a callback date is the most ordinary thing on this desk — she
 * calls, the customer says "tomorrow instead" — and it must never be the
 * thing the system refuses.
 */

const { db, requireContext, requirePermission, can, assertOrderAccess } = vi.hoisted(() => ({
  db: {
    order: { findFirst: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    orderNote: { create: vi.fn() },
    orderStatusLog: { create: vi.fn() },
    orderActivity: { create: vi.fn() },
    orderItem: { findMany: vi.fn(), updateMany: vi.fn() },
    $transaction: vi.fn(async (fn: never) => (typeof fn === 'function' ? (fn as (t: unknown) => unknown)(db) : fn)),
  },
  requireContext: vi.fn(),
  requirePermission: vi.fn(),
  can: vi.fn(),
  assertOrderAccess: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ db }));
vi.mock('@/lib/geo-context', () => ({ requireContext: (...a: unknown[]) => requireContext(...a) }));
vi.mock('@/lib/authorization', () => ({
  requirePermission: (...a: unknown[]) => requirePermission(...a),
  can: (...a: unknown[]) => can(...a),
  authorize: () => ({ allowed: true }),
}));
vi.mock('@/lib/rbac', () => ({ assertOrderAccess: (...a: unknown[]) => assertOrderAccess(...a) }));
vi.mock('@/lib/audit', () => ({ logAudit: vi.fn() }));
vi.mock('@/lib/notification', () => ({ createNotification: vi.fn() }));
vi.mock('@/lib/apps/events', () => ({ emitAppEvent: vi.fn() }));
vi.mock('@/lib/reservation', () => ({ releaseOrderLines: vi.fn(), reserveOrderLines: vi.fn() }));

import * as confirmationRoute from '@/app/api/orders/[id]/confirmation/route';
import * as postponedRoute from '@/app/api/confirmation/postponed/route';

const ORDER_ID = 'o1';
const order = (confirmationStatus: string) => ({
  id: ORDER_ID,
  orderNumber: 'ORD-1',
  companyId: 'c1',
  storeId: 's1',
  version: 4,
  confirmationStatus,
  shippingStatus: 'NOT_READY',
  claimedById: 'u1',
  nextFollowUpAt: null,
  followUpStatus: null,
  postponeCount: 0,
  lockedById: null,
  lockExpiresAt: null,
});

const postpone = () =>
  confirmationRoute.POST(
    new Request(`http://localhost/api/orders/${ORDER_ID}/confirmation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'schedule_follow_up',
        nextFollowUpAt: new Date(Date.now() + 3 * 864e5).toISOString(),
        followUpReason: 'CUSTOMER_BUSY',
        preferredTime: 'MORNING',
        expectedVersion: 4,
      }),
    }),
    { params: Promise.resolve({ id: ORDER_ID }) }
  );

/** The status the route decided to write. */
const written = () => {
  const call = db.order.update.mock.calls.at(-1)?.[0] ?? db.order.updateMany.mock.calls.at(-1)?.[0];
  return call?.data?.confirmationStatus;
};

beforeEach(() => {
  vi.clearAllMocks();
  requireContext.mockResolvedValue({
    user: { id: 'u1', name: 'سارة', role: 'CONFIRMATION_AGENT', status: 'ACTIVE' },
    companyId: 'c1',
    storeId: 's1',
    country: { timezone: 'Asia/Amman', minorUnit: 2 },
  });
  requirePermission.mockResolvedValue({ companyId: 'c1' });
  can.mockReturnValue(true);
  db.order.updateMany.mockResolvedValue({ count: 1 });
  db.order.update.mockResolvedValue(order('POSTPONED'));
  db.order.findMany.mockResolvedValue([]);
  db.orderItem.findMany.mockResolvedValue([]);
});

describe('where «تأجيل» lands', () => {
  it('puts an order being worked into POSTPONED, not somewhere else', async () => {
    // It used to write FOLLOW_UP_REQUIRED, and the postponed screen asked
    // for POSTPONED — so the order she had just postponed was nowhere.
    assertOrderAccess.mockResolvedValue({ allowed: true, order: order('IN_PROGRESS') });
    db.order.findFirst.mockResolvedValue(order('IN_PROGRESS'));
    db.order.findUnique.mockResolvedValue(order('IN_PROGRESS'));
    const res = await postpone();
    expect(res.status).toBe(200);
    expect(written()).toBe('POSTPONED');
  });

  it('re-schedules an already postponed order without complaining', async () => {
    assertOrderAccess.mockResolvedValue({ allowed: true, order: order('POSTPONED') });
    db.order.findFirst.mockResolvedValue(order('POSTPONED'));
    db.order.findUnique.mockResolvedValue(order('POSTPONED'));
    const res = await postpone();
    expect(res.status).toBe(200);
    expect(written()).toBe('POSTPONED');
  });

  it('re-schedules an order already awaiting a callback', async () => {
    // This is the one that returned "Cannot schedule follow-up from status
    // FOLLOW_UP_REQUIRED" and left the agent with no way to move the date.
    assertOrderAccess.mockResolvedValue({ allowed: true, order: order('FOLLOW_UP_REQUIRED') });
    db.order.findFirst.mockResolvedValue(order('FOLLOW_UP_REQUIRED'));
    db.order.findUnique.mockResolvedValue(order('FOLLOW_UP_REQUIRED'));
    const res = await postpone();
    expect(res.status).toBe(200);
    expect(written()).toBe('FOLLOW_UP_REQUIRED');
  });

  it('keeps a no-answer order in the follow-up lane', async () => {
    // The customer did not answer; that is a callback, not a decision to
    // postpone, and the workflow table forbids NO_ANSWER → POSTPONED.
    assertOrderAccess.mockResolvedValue({ allowed: true, order: order('NO_ANSWER') });
    db.order.findFirst.mockResolvedValue(order('NO_ANSWER'));
    db.order.findUnique.mockResolvedValue(order('NO_ANSWER'));
    const res = await postpone();
    expect(res.status).toBe(200);
    expect(written()).toBe('FOLLOW_UP_REQUIRED');
  });

  it('still refuses to schedule a callback on a finished order', async () => {
    assertOrderAccess.mockResolvedValue({ allowed: true, order: order('CONFIRMED') });
    db.order.findFirst.mockResolvedValue(order('CONFIRMED'));
    db.order.findUnique.mockResolvedValue(order('CONFIRMED'));
    const res = await postpone();
    expect(res.status).toBe(400);
  });
});

describe('the postponed screen', () => {
  it('asks for everything waiting on a date, not only one of the two states', async () => {
    await postponedRoute.GET();
    expect(db.order.findMany.mock.calls[0][0].where.confirmationStatus).toEqual({
      in: ['POSTPONED', 'FOLLOW_UP_REQUIRED'],
    });
  });

  it('shows an agent only her own', async () => {
    can.mockReturnValue(false); // not a supervisor
    await postponedRoute.GET();
    expect(db.order.findMany.mock.calls[0][0].where.claimedById).toBe('u1');
  });
});
