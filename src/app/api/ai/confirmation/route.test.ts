import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * THE ASSISTANT ON THE CALL SEES ONE ORDER, AND NOT THE PHONE.
 *
 * Two things are being guarded here. The first is reach: an agent who types
 * an id belonging to another store must get nothing, because an id is not a
 * permission. The second is what travels: the agent is looking at the phone
 * number on their own screen, so putting it in the request to an outside
 * provider buys nothing and sends a customer's contact details somewhere
 * nobody in this company is accountable for them.
 *
 * And what it returns is a suggestion. Nothing in this route writes.
 */

const { db, requireContext, requirePermission, aiChat, customerRisk, AiNotConfigured } = vi.hoisted(() => ({
  db: { order: { findFirst: vi.fn(), findMany: vi.fn() } },
  requireContext: vi.fn(),
  requirePermission: vi.fn(),
  aiChat: vi.fn(),
  customerRisk: vi.fn(),
  AiNotConfigured: class AiNotConfigured extends Error {},
}));

vi.mock('@/lib/db', () => ({ db }));
vi.mock('@/lib/geo-context', () => ({ requireContext: (...a: unknown[]) => requireContext(...a) }));
vi.mock('@/lib/authorization', () => ({ requirePermission: (...a: unknown[]) => requirePermission(...a) }));
vi.mock('@/lib/ai-provider', () => ({ aiChat: (...a: unknown[]) => aiChat(...a), AiNotConfigured }));
vi.mock('@/lib/customer-risk', () => ({ customerRisk: (...a: unknown[]) => customerRisk(...a) }));

import { POST } from './route';

const ORDER_ID = '11111111-1111-4111-8111-111111111111';

const ask = (orderId: string = ORDER_ID) =>
  POST(new Request('http://localhost/x', { method: 'POST', body: JSON.stringify({ orderId }) }));

const order = {
  id: ORDER_ID,
  orderNumber: 'SY-0044',
  totalAmount: 1200,
  currency: 'SYP',
  confirmationStatus: 'NEW',
  shippingStatus: 'NOT_READY',
  claimedById: null,
  shippedAt: null,
  labelPrintedAt: null,
  customerNotes: 'يرجى الاتصال مساءً',
  customer: { id: 'cust1', fullName: 'سارة', address: 'شارع بغداد ١٢', city: 'دمشق' },
  items: [{ productName: 'كريم', quantity: 2, freeQuantity: 1 }],
};

beforeEach(() => {
  vi.resetAllMocks();
  requireContext.mockResolvedValue({ user: { id: 'u1' }, companyId: 'c1', storeId: 's1' });
  requirePermission.mockResolvedValue(undefined);
  db.order.findFirst.mockResolvedValue(order);
  db.order.findMany.mockResolvedValue([]);
  customerRisk.mockResolvedValue({
    tier: 'SAFE', returnRate: 0, orders: 3, returns: 0, windowDays: 182,
    recentReturns60d: 0, requiresPrepaymentOrApproval: false,
  });
  aiChat.mockResolvedValue('ابدئي بالسلام عليكم');
});

/** Everything the provider was told, as one string. */
const sentToModel = () => JSON.stringify(aiChat.mock.calls[0][0]);

describe('what reaches the provider', () => {
  it('never the phone and never the address — the agent already has both on screen', async () => {
    await ask();
    const sent = sentToModel();
    expect(sent).not.toContain('شارع بغداد');
    // The fact that an address EXISTS is what the agent needs; the address is not.
    expect(sent).toContain('hasAddress');
    // And nothing selected a phone in the first place.
    const select = db.order.findFirst.mock.calls[0][0].select;
    expect(select.customer.select.phone).toBeUndefined();
  });

  it('says when the address is missing, because that is a reason to call', async () => {
    db.order.findFirst.mockResolvedValue({ ...order, customer: { ...order.customer, address: '   ' } });
    await ask();
    expect(JSON.parse(aiChat.mock.calls[0][0].user).order.hasAddress).toBe(false);
  });

  it('uses the company’s own wording for this job, not a prompt written here', async () => {
    await ask();
    expect(aiChat.mock.calls[0][0].job).toBe('confirmation');
    expect(aiChat.mock.calls[0][0].system).toBeUndefined();
  });

  it('a clean history goes as numbers, so the model cannot invent a worry', async () => {
    const body = await (await ask()).json();
    expect(body.context.customer).toMatchObject({ orders: 3, returns: 0, tier: 'SAFE', previous: [] });
  });
});

describe('what it refuses', () => {
  it('anyone without the permission to work the confirmation queue', async () => {
    requirePermission.mockRejectedValue(new Error('Forbidden: missing required permission confirmation.work'));
    expect((await ask()).status).toBe(403);
    expect(aiChat).not.toHaveBeenCalled();
    expect(db.order.findFirst).not.toHaveBeenCalled();
  });

  it('an order of another store — an id is not a permission', async () => {
    db.order.findFirst.mockResolvedValue(null);
    expect((await ask()).status).toBe(404);
    expect(aiChat).not.toHaveBeenCalled();
  });

  it('and it asks for the order inside this company and this store', async () => {
    await ask();
    expect(db.order.findFirst.mock.calls[0][0].where).toMatchObject({
      id: ORDER_ID, companyId: 'c1', storeId: 's1',
    });
  });

  it('a body that is not an order id', async () => {
    expect((await ask('not-a-uuid')).status).toBe(400);
    expect(db.order.findFirst).not.toHaveBeenCalled();
  });
});

describe('when the provider does not answer', () => {
  it('the facts still come back — the agent is on a call', async () => {
    aiChat.mockRejectedValue(new AiNotConfigured());
    const body = await (await ask()).json();
    expect(body.suggestion).toBeNull();
    expect(body.context.order.number).toBe('SY-0044');
    expect(body.error).toContain('لم يُضبط');
  });
});
