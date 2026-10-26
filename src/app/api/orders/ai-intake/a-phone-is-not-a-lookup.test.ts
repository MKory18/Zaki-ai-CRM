import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A PHONE NUMBER WAS A WAY TO LOOK SOMEBODY UP.
 *
 * The AI order-entry preview — which writes nothing — answered «this number
 * is سارة, from عمّان, 4 earlier orders» to anyone allowed to create an
 * order. The customers list answers the same number only by the reader's
 * customers key and its scope, so pasting number after number here was an
 * address book for someone the owner had denied «عرض العملاء».
 *
 * Now the preview says what the customers list would: everything with the
 * full key (OWN: only a customer this person brought in), the name without
 * the count with the basic key, and otherwise only that the number is known
 * — which is all the order needs, since it is linked to the same file.
 */

const { db, requireContext, requirePermission, aiChat, activeBlock, findOrCreateCustomer, orderRefFields, productCost, resolveRegionId } = vi.hoisted(() => ({
  db: {
    product: { findMany: vi.fn(), findFirst: vi.fn() },
    customer: { findFirst: vi.fn(), update: vi.fn() },
    store: { findFirst: vi.fn(async () => ({ priceIncludesDelivery: false })) },
    user: { findFirst: vi.fn() },
    order: { create: vi.fn(), findFirst: vi.fn() },
    orderItem: { create: vi.fn() },
    orderActivity: { create: vi.fn() },
    $transaction: vi.fn(async (fn: unknown) => (typeof fn === 'function' ? (fn as (tx: unknown) => unknown)(db) : fn)),
  },
  requireContext: vi.fn(),
  requirePermission: vi.fn(),
  aiChat: vi.fn(),
  activeBlock: vi.fn(),
  findOrCreateCustomer: vi.fn(),
  orderRefFields: vi.fn(),
  productCost: vi.fn(),
  resolveRegionId: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ db }));
vi.mock('@/lib/geo-context', () => ({ requireContext: (...a: unknown[]) => requireContext(...a) }));
// What the reader holds, by key and scope — the preview answers by it.
const held: { keys: Record<string, string> } = { keys: {} };
vi.mock('@/lib/authorization', () => ({
  can: (_u: unknown, k: string) => k in held.keys,
  getPermissionScope: (_u: unknown, k: string) => (k in held.keys ? { scope: held.keys[k] } : null),
  requirePermission: (...a: unknown[]) => requirePermission(...a),
}));
vi.mock('@/lib/notify', () => ({ notify: vi.fn() }));
vi.mock('@/lib/audit', () => ({ logAudit: vi.fn() }));
vi.mock('@/lib/offers', () => ({ activeOffersFor: vi.fn(async () => []) }));
vi.mock('@/lib/blacklist', () => ({ activeBlock: (...a: unknown[]) => activeBlock(...a) }));
vi.mock('@/lib/customer-identity', () => ({ findOrCreateCustomer: (...a: unknown[]) => findOrCreateCustomer(...a) }));
vi.mock('@/lib/order-ref', () => ({ orderRefFields: (...a: unknown[]) => orderRefFields(...a) }));
vi.mock('@/lib/product-cost', () => ({ productCost: (...a: unknown[]) => productCost(...a) }));
vi.mock('@/lib/regions', () => ({ resolveRegionId: (...a: unknown[]) => resolveRegionId(...a) }));
vi.mock('@/lib/ai-prompts', () => ({ resolvePrompt: () => 'prompt' }));
vi.mock('@/lib/ai-provider', () => {
  class AiNotLocal extends Error {}
  class AiNotConfigured extends Error {}
  class AiEndpointMissing extends Error {}
  return { AiNotLocal, AiNotConfigured, AiEndpointMissing, aiChat: (...a: unknown[]) => aiChat(...a), aiSettings: async () => ({ prompts: {} }) };
});

import { POST } from './route';

const preview = () =>
  POST(new Request('http://localhost/api/orders/ai-intake', { method: 'POST', body: JSON.stringify({ text: 'الاسم: سارة — الرقم: 0791234567' }) }));

beforeEach(() => {
  vi.clearAllMocks();
  held.keys = { 'orders.create': 'ALL_COMPANY' };
  requireContext.mockResolvedValue({
    user: { id: 'u1', name: 'هدى', role: 'CUSTOM' },
    companyId: 'c1', storeId: 's1', countryId: 'co1',
    country: { id: 'co1', code: 'JO', minorUnit: 2, currencyCode: 'JOD', orderPrefix: 'ORD' },
  });
  requirePermission.mockResolvedValue(undefined);
  db.product.findMany.mockResolvedValue([]);
  db.customer.findFirst.mockResolvedValue({ id: 'cu1', fullName: 'سارة', totalOrders: 4, city: 'عمّان' });
  db.order.findFirst.mockResolvedValue(null);
  aiChat.mockRejectedValue(new Error('no model in this test'));
});

const known = async () => (await (await preview()).json()).existingCustomer;

describe('a known number, in the preview', () => {
  it('without any customers key: only that it is known', async () => {
    expect(await known()).toEqual({ exists: true });
  });

  it('the basic key: the name and city, not the count', async () => {
    held.keys['customers.view_basic'] = 'ALL_COMPANY';
    expect(await known()).toEqual({ exists: true, fullName: 'سارة', city: 'عمّان' });
  });

  it('the full key over all customers: name, city and count', async () => {
    held.keys['customers.view'] = 'ALL_COMPANY';
    expect(await known()).toEqual({ exists: true, fullName: 'سارة', city: 'عمّان', totalOrders: 4 });
  });

  it('the full key, OWN: a customer somebody else brought in is only «known»', async () => {
    held.keys['customers.view'] = 'OWN';
    expect(await known()).toEqual({ exists: true });
    db.order.findFirst.mockResolvedValue({ id: 'o9' });
    expect((await known()).totalOrders).toBe(4);
  });

  it('an unknown number is still nothing at all', async () => {
    db.customer.findFirst.mockResolvedValue(null);
    expect(await known()).toBeNull();
  });
});
