import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * THE WAREHOUSE ASSISTANT NEVER MEETS THE CUSTOMER.
 *
 * The preparation list it reads carries a customer name and a town on every
 * line, because the screen shows them to a person holding the order. The
 * model is asked a different question — what to pick, what is short — and
 * a name in that request is a customer's data sent outside the company for
 * no gain at all.
 *
 * That is why the payload is built by one named function instead of by each
 * caller remembering to drop two fields. This is the test that says so.
 */

const { db, requireContext, requirePermission, aiChat, preparationGroups, AiNotConfigured } = vi.hoisted(() => ({
  db: { product: { findMany: vi.fn() } },
  requireContext: vi.fn(),
  requirePermission: vi.fn(),
  aiChat: vi.fn(),
  preparationGroups: vi.fn(),
  AiNotConfigured: class AiNotConfigured extends Error {},
}));

vi.mock('@/lib/db', () => ({ db }));
vi.mock('@/lib/geo-context', () => ({ requireContext: (...a: unknown[]) => requireContext(...a) }));
vi.mock('@/lib/authorization', () => ({ requirePermission: (...a: unknown[]) => requirePermission(...a) }));
vi.mock('@/lib/ai-provider', () => ({ aiChat: (...a: unknown[]) => aiChat(...a), AiNotConfigured }));
vi.mock('@/lib/operations', () => ({ preparationGroups: (...a: unknown[]) => preparationGroups(...a) }));

import { POST } from './route';

const GROUPS = [
  {
    productId: 'p1',
    productName: 'كريم',
    orders: 4,
    required: 9,
    available: 5,
    shortage: 4,
    lines: [
      { orderId: 'o1', orderNumber: 'SY-0044', customerName: 'سارة', regionName: 'المزة', quantity: 2, freeQuantity: 1, reservedQty: 0, confirmationStatus: 'CONFIRMED', shippingStatus: 'NOT_READY' },
    ],
  },
];

beforeEach(() => {
  vi.resetAllMocks();
  requireContext.mockResolvedValue({
    user: { id: 'u1' }, companyId: 'c1', storeId: 's1',
    country: { allowNegativeStock: false },
  });
  requirePermission.mockResolvedValue(undefined);
  preparationGroups.mockResolvedValue(GROUPS);
  db.product.findMany.mockResolvedValue([{ id: 'p1', sku: 'CRM-1', category: { name: 'عناية' } }]);
  aiChat.mockResolvedValue('ابدأ بعناية: كريم');
});

const sentToModel = () => JSON.stringify(aiChat.mock.calls[0][0]);

describe('what reaches the provider', () => {
  it('no customer name and no town — the box does not need them', async () => {
    await POST();
    const sent = sentToModel();
    expect(sent).not.toContain('سارة');
    expect(sent).not.toContain('المزة');
    expect(sent).not.toContain('SY-0044');
  });

  it('the numbers it is asked about, as they are on the shelf', async () => {
    await POST();
    const payload = JSON.parse(aiChat.mock.calls[0][0].user);
    expect(payload.picklist[0]).toMatchObject({
      product: 'كريم', sku: 'CRM-1', category: 'عناية',
      orders: 4, required: 9, available: 5, shortage: 4,
    });
    // Whether a shortage stops the van is a country's decision, not the model's.
    expect(payload.allowNegativeStock).toBe(false);
  });

  it('reads the same list the preparation screen reads, for this store', async () => {
    await POST();
    expect(preparationGroups).toHaveBeenCalledWith(db, { companyId: 'c1', storeId: 's1' });
  });

  it('asks nobody anything when there is nothing to pick', async () => {
    preparationGroups.mockResolvedValue([]);
    const body = await (await POST()).json();
    expect(body.empty).toBe(true);
    expect(aiChat).not.toHaveBeenCalled();
  });
});

describe('what it refuses', () => {
  it('anyone without the permission to prepare', async () => {
    requirePermission.mockRejectedValue(new Error('Forbidden: missing required permission ops.prepare'));
    expect((await POST()).status).toBe(403);
    expect(preparationGroups).not.toHaveBeenCalled();
    expect(aiChat).not.toHaveBeenCalled();
  });
});

describe('when the provider does not answer', () => {
  it('the picklist still comes back — it was true before the model was asked', async () => {
    aiChat.mockRejectedValue(new Error('AI_HTTP_429'));
    const body = await (await POST()).json();
    expect(body.suggestion).toBeNull();
    expect(body.picklist[0].shortage).toBe(4);
  });
});
