import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * WHO EACH EVENT IS ANNOUNCED TO.
 *
 * createNotification is replaced here and the routes run for real, so each
 * test reads the audience a route asks for: which permission, which named
 * people, which store, and who is left out. That the audience is then
 * resolved correctly is notification-audience.test.ts's job.
 *
 *   new order            confirmation.supervise, in the order's store
 *   confirmed/rejected   confirmation.supervise + the order's moderator, not the actor
 *   failed delivery      ops.track, in the order's store
 *   change request       the holding agent before operations, else whoever
 *                        holds control.change_requests or a supervising role
 *                        (the same rule the routing decides by); never the
 *                        requester
 */

const { db, requireContext, assertOrderAccess, can, createNotification } = vi.hoisted(() => {
  const db: any = {
    order: { findFirst: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn() },
    orderChangeRequest: { findFirst: vi.fn(), create: vi.fn() },
    orderChannel: { findFirst: vi.fn(async () => null) },
    orderNote: { create: vi.fn() },
    orderStatusLog: { create: vi.fn() },
    orderActivity: { create: vi.fn() },
    orderItem: { create: vi.fn() },
    user: { findUnique: vi.fn(), findMany: vi.fn() },
    region: { findMany: vi.fn() },
    offer: { findMany: vi.fn() },
    // The store's pricing policy, asked by every order door.
    store: { findFirst: vi.fn(async () => ({ priceIncludesDelivery: false })) },
    landingPageRecommendation: { findMany: vi.fn() },
    $transaction: vi.fn(),
  };
  return {
    db,
    requireContext: vi.fn(),
    assertOrderAccess: vi.fn(),
    can: vi.fn(),
    createNotification: vi.fn(),
  };
});

vi.mock('@/lib/db', () => ({ db }));
vi.mock('@/lib/geo-context', () => ({ requireContext: (...a: unknown[]) => requireContext(...a) }));
vi.mock('@/lib/rbac', () => ({ assertOrderAccess: (...a: unknown[]) => assertOrderAccess(...a) }));
vi.mock('@/lib/audit', () => ({ logAudit: vi.fn() }));
vi.mock('@/lib/notification', () => ({ createNotification: (...a: unknown[]) => createNotification(...a) }));
vi.mock('@/lib/authorization', () => ({
  can: (...a: unknown[]) => can(...a),
  authorize: () => ({ allowed: true }),
  requirePermission: vi.fn(),
}));
vi.mock('@/lib/reservation', () => ({
  reserveOrderLines: vi.fn(),
  releaseOrderLines: vi.fn(),
  orderLinesForGuard: vi.fn(async () => []),
}));
vi.mock('@/lib/apps/events', () => ({ emitAppEvent: vi.fn() }));
vi.mock('@/lib/conversions/emit', () => ({ queueConversions: vi.fn() }));
vi.mock('@/lib/customer-identity', () => ({
  findOrCreateCustomer: vi.fn(async () => ({ id: 'cust-1', firstOrderDate: null })),
}));
vi.mock('@/lib/order-ref', () => ({ orderRefFields: vi.fn(async () => ({ orderNumber: 'ORD-77' })) }));
vi.mock('@/lib/blacklist', () => ({ isBlocked: vi.fn(async () => false), NEUTRAL_REFUSAL: 'x' }));
vi.mock('@/lib/landing-pages', () => ({ signAddonToken: vi.fn(async () => 'token') }));

import { POST as confirmationPOST } from '@/app/api/orders/[id]/confirmation/route';
import { POST as shippingPOST } from '@/app/api/orders/[id]/shipping/route';
import { POST as changeRequestPOST } from '@/app/api/orders/[id]/change-requests/route';
import { createPublicOrder } from '@/lib/public-order';
import { SUPERVISOR_ROLES } from '@/lib/change-request-routing';

const actor = { id: 'actor-1', name: 'منفّذ', role: 'CONFIRMATION_AGENT', status: 'ACTIVE' };
const ctx = {
  user: actor, companyId: 'c1', storeId: 'store-a', countryId: 'jo',
  country: {
    id: 'jo', code: 'JO', name: 'الأردن', currencyCode: 'JOD', minorUnit: 3, timezone: 'Asia/Amman',
    orderPrefix: 'ORD', allowNegativeStock: false, workHoursStart: '09:00', workHoursEnd: '17:00', weekendDays: [5],
  },
};
const order = (over: Record<string, unknown> = {}) => ({
  id: 'o1', companyId: 'c1', storeId: 'store-a', orderNumber: 'ORD-1', version: 1,
  moderatorId: 'mod-1', claimedById: null,
  confirmationStatus: 'IN_PROGRESS', shippingStatus: 'NOT_READY',
  lockedById: null, lockExpiresAt: null, shippedAt: null, nextFollowUpAt: null, followUpStatus: null,
  ...over,
});
const params = { params: Promise.resolve({ id: 'o1' }) };
const post = (body: unknown) =>
  new Request('http://localhost/x', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

beforeEach(() => {
  vi.clearAllMocks();
  requireContext.mockResolvedValue(ctx);
  can.mockReturnValue(false);
  createNotification.mockResolvedValue(1);
  db.$transaction.mockImplementation(async (fn: any) => (typeof fn === 'function' ? fn(db) : fn));
  db.order.updateMany.mockResolvedValue({ count: 1 });
  db.order.findUnique.mockResolvedValue(order());
  db.orderChangeRequest.findFirst.mockResolvedValue(null);
});

describe('a confirmation outcome', () => {
  it('goes to this store\'s supervisors and the order\'s moderator, not to the agent who decided it', async () => {
    assertOrderAccess.mockResolvedValue({ allowed: true, order: order() });
    const res = await confirmationPOST(
      post({ action: 'reject', rejectionReason: 'PRICE_TOO_HIGH', expectedVersion: 1 }),
      params
    );
    expect(res.status).toBe(200);
    expect(createNotification).toHaveBeenCalledTimes(1);
    expect(createNotification.mock.calls[0][0]).toMatchObject({
      companyId: 'c1',
      storeId: 'store-a',
      audience: { permission: 'confirmation.supervise', userIds: ['mod-1'] },
      actorId: 'actor-1',
      title: 'رفض طلب',
    });
  });

  it('a step that is not an outcome announces nothing', async () => {
    assertOrderAccess.mockResolvedValue({ allowed: true, order: order() });
    const res = await confirmationPOST(post({ action: 'contact_result', result: 'NO_ANSWER', expectedVersion: 1 }), params);
    expect(res.status).toBe(200);
    expect(createNotification).not.toHaveBeenCalled();
  });
});

describe('a failed delivery', () => {
  it('goes to this store\'s ops.track holders, not the person who recorded it', async () => {
    assertOrderAccess.mockResolvedValue({
      allowed: true,
      order: order({ confirmationStatus: 'CONFIRMED', shippingStatus: 'OUT_FOR_DELIVERY' }),
    });
    const res = await shippingPOST(
      post({ action: 'transition', to: 'FAILED_DELIVERY', deliveryFailureReason: 'CUSTOMER_NOT_AVAILABLE', expectedVersion: 1 }),
      params
    );
    expect(res.status).toBe(200);
    expect(createNotification.mock.calls[0][0]).toMatchObject({
      storeId: 'store-a',
      audience: { permission: 'ops.track' },
      actorId: 'actor-1',
      type: 'SYSTEM_ALERT',
    });
    expect(createNotification.mock.calls[0][0].link[0]).toBe('/ops/tracking');
  });

  it('any other shipping step announces nothing', async () => {
    assertOrderAccess.mockResolvedValue({
      allowed: true,
      order: order({ confirmationStatus: 'CONFIRMED', shippingStatus: 'SHIPPED' }),
    });
    const res = await shippingPOST(post({ action: 'transition', to: 'OUT_FOR_DELIVERY', expectedVersion: 1 }), params);
    expect(res.status).toBe(200);
    expect(createNotification).not.toHaveBeenCalled();
  });
});

describe('a change request', () => {
  const raise = () => changeRequestPOST(post({ changes: { quantity: { to: 3 } }, reason: 'الزبون طلب ثلاثة' }), params);

  beforeEach(() => {
    db.orderChangeRequest.create.mockImplementation(async ({ data }: any) => ({ id: 'cr1', ...data }));
    db.orderNote.create.mockResolvedValue({});
    db.order.findFirst.mockResolvedValue({
      quantity: 2, productId: 'p1', offerId: null, discountAmount: 0, customerNotes: null,
      customer: { fullName: 'أحمد', phone: '0791234567', altPhone: null, address: 'عمان', city: 'عمان' },
    });
  });

  it('after confirmation goes to everyone who may decide it in this store — the permission and the supervising roles', async () => {
    assertOrderAccess.mockResolvedValue({ allowed: true, order: order({ confirmationStatus: 'CONFIRMED' }) });
    await raise();
    expect(createNotification).toHaveBeenCalledTimes(1);
    expect(createNotification.mock.calls[0][0]).toMatchObject({ storeId: 'store-a', actorId: 'actor-1' });
    // Exactly — a supervisor by role decides requests without the permission.
    expect(createNotification.mock.calls[0][0].audience).toEqual({
      permission: 'control.change_requests',
      roles: SUPERVISOR_ROLES,
    });
    expect(db.user.findMany).not.toHaveBeenCalled();
  });

  it('before operations goes to the agent holding the order, and only to her', async () => {
    assertOrderAccess.mockResolvedValue({ allowed: true, order: order({ claimedById: 'holder-1' }) });
    await raise();
    expect(createNotification).toHaveBeenCalledTimes(1);
    expect(createNotification.mock.calls[0][0]).toMatchObject({ audience: { userIds: ['holder-1'] }, actorId: 'actor-1' });
  });

  it('when the holder raised it herself, the supervisors are told instead of nobody', async () => {
    assertOrderAccess.mockResolvedValue({ allowed: true, order: order({ claimedById: 'actor-1' }) });
    // The holder is the actor, so the first audience resolves to nobody.
    createNotification.mockResolvedValueOnce(0);
    await raise();
    expect(createNotification).toHaveBeenCalledTimes(2);
    expect(createNotification.mock.calls[1][0]).toMatchObject({ actorId: 'actor-1' });
    expect(createNotification.mock.calls[1][0].audience).toEqual({
      permission: 'control.change_requests',
      roles: SUPERVISOR_ROLES,
    });
  });

  it('offers the holder a screen she can open when the queue is closed to her', async () => {
    assertOrderAccess.mockResolvedValue({ allowed: true, order: order({ claimedById: 'holder-1' }) });
    await raise();
    expect(createNotification.mock.calls[0][0].link).toEqual(['/control/change-requests', '/confirmation/mine', '/orders']);
  });
});

describe('a new order', () => {
  it('from a public page goes to the store\'s confirmation supervisors, with no actor', async () => {
    db.region.findMany.mockResolvedValue([{ id: 'r1', name: 'عمان' }]);
    db.offer.findMany.mockResolvedValue([]);
    db.landingPageRecommendation.findMany.mockResolvedValue([]);
    // The transaction's own writes are covered elsewhere; here it only has
    // to hand back the order it made.
    db.$transaction.mockResolvedValue({ id: 'o77', orderNumber: 'ORD-77', totalAmount: 10, currency: 'JOD' });

    const result = await createPublicOrder(
      {
        companyId: 'c1',
        store: { id: 'store-b', countryId: 'jo', country: { code: 'JO', currencyCode: 'JOD', orderPrefix: 'ORD', minorUnit: 3 } },
        product: { id: 'p1', name: 'منتج', image: null, basePrice: 10 },
        landingPage: null,
        source: 'STOREFRONT',
        campaignId: null,
        dedupeScope: `test-${Date.now()}`,
        notice: { title: 'طلب جديد من المتجر', message: (n) => `طلب ${n}` },
      },
      { full_name: 'أحمد علي', phone: '0791234567', address: 'شارع المدينة المنورة', city: 'عمان' }
    );

    expect(result.ok).toBe(true);
    expect(createNotification).toHaveBeenCalledTimes(1);
    const arg = createNotification.mock.calls[0][0];
    expect(arg).toMatchObject({
      companyId: 'c1',
      storeId: 'store-b',
      audience: { permission: 'confirmation.supervise' },
      type: 'ORDER_NEW',
      title: 'طلب جديد من المتجر',
    });
    expect(arg.actorId ?? null).toBeNull();
  });

  it('records the door as its channel and the kind of device — so the tables on the performance screen agree', async () => {
    db.region.findMany.mockResolvedValue([{ id: 'r1', name: 'عمان' }]);
    db.offer.findMany.mockResolvedValue([]);
    db.orderChannel.findFirst.mockResolvedValue({ id: 'ch-web' });
    let created: Record<string, unknown> | null = null;
    // Run the transaction for real this time, to read what the order row gets.
    const anyModel = () => new Proxy({}, { get: () => vi.fn(async () => ({})) });
    db.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
      fn(new Proxy({}, {
        get: (_t, model) => model === 'order'
          ? { create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => { created = data; return { id: 'o78', ...data }; }) }
          : anyModel(),
      }))
    );

    const result = await createPublicOrder(
      {
        companyId: 'c1',
        store: { id: 'store-b', countryId: 'jo', country: { code: 'JO', currencyCode: 'JOD', orderPrefix: 'ORD', minorUnit: 3 } },
        product: { id: 'p1', name: 'منتج', image: null, basePrice: 10 },
        landingPage: null,
        source: 'Store',
        campaignId: null,
        dedupeScope: `test-device-${Date.now()}`,
        deviceClass: 'mobile',
        notice: { title: 'طلب جديد من المتجر', message: (n) => `طلب ${n}` },
      },
      { full_name: 'أحمد علي', phone: '0791234568', address: 'شارع المدينة المنورة', city: 'عمان' }
    );

    expect(result.ok).toBe(true);
    expect(db.orderChannel.findFirst.mock.calls[0][0].where).toMatchObject({ companyId: 'c1', kind: 'WEBSITE', isActive: true });
    expect(created).toMatchObject({ channelId: 'ch-web', deviceClass: 'mobile' });
  });
});
