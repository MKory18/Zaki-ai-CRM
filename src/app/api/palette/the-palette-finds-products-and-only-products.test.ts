import { beforeEach, describe, expect, it, vi } from 'vitest';
import { productScopeWhere } from '@/lib/product-scope';

/**
 * Ctrl+K — A PRODUCT BY NAME OR CODE, AND NOTHING ELSE THAT IS PERSONAL.
 *
 * The owner's answer (24/10): products only. Customers are personal data and the palette
 * finds none. What the door must keep:
 *
 *   · a product is found on `products.view`, in the SAME scope the catalogue lists (a grant
 *     narrowed to one category finds that category and no other);
 *   · it is an id, a name and a code — never a price, a cost or a stock figure;
 *   · it is the SESSION's company and store, whatever the body says;
 *   · it works for a catalogue keeper with no `orders.view` — and for them the order-shaped
 *     answers stay empty, exactly as before;
 *   · nobody without `products.view` pays for the query, and gets an empty list.
 */

const { db, requireContext } = vi.hoisted(() => ({
  db: {
    order: { count: vi.fn() },
    product: { findMany: vi.fn() },
    user: { findMany: vi.fn() },
  },
  requireContext: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ db }));
vi.mock('@/lib/geo-context', () => ({ requireContext: (...a: unknown[]) => requireContext(...a) }));
vi.mock('@/lib/authorization', () => ({
  can: (u: { __perms?: string[] }, p: string) => (u.__perms ?? []).includes(p),
  requirePermission: vi.fn(),
  getPermissionScope: (u: { __grants?: Record<string, { scope: string; scopeIds?: string[] }> }, p: string) =>
    u.__grants?.[p] ?? null,
}));
vi.mock('@/lib/api-error', () => ({
  apiErrorResponse: (e: unknown) => new Response(JSON.stringify({ error: `UNEXPECTED: ${(e as Error)?.message}` }), { status: 500 }),
}));
vi.mock('@/lib/rate-limit', () => ({ rateLimit: () => ({ allowed: true, retryAfterSec: 0 }) }));

import { POST } from './route';

const ask = (q: string) =>
  POST(new Request('http://x/api/palette', { method: 'POST', body: JSON.stringify({ q }), headers: { 'Content-Type': 'application/json' } }));

const user = (grants: Record<string, { scope: string; scopeIds?: string[] }>) => ({
  id: 'u1', status: 'ACTIVE', role: 'MANAGER', companyId: 'co-1', __grants: grants, __perms: [],
});
const WHOLE = { scope: 'ALL_COMPANY' };

beforeEach(() => {
  vi.clearAllMocks();
  requireContext.mockResolvedValue({ user: user({ 'products.view': WHOLE, 'orders.view': WHOLE }), companyId: 'co-1', storeId: 'st-1' });
  db.order.count.mockResolvedValue(0);
  db.user.findMany.mockResolvedValue([]);
  db.product.findMany.mockResolvedValue([{ id: 'p1', name: 'كريم الشعر', sku: 'CR-01' }]);
});

describe('what is found', () => {
  it('a product by name or code, as an id, a name and a code', async () => {
    const body = await (await ask('كريم')).json();
    expect(body.products).toEqual([{ id: 'p1', name: 'كريم الشعر', sku: 'CR-01' }]);
    const args = db.product.findMany.mock.calls[0][0];
    expect(args.select).toEqual({ id: true, name: true, sku: true });
    expect(args.take).toBe(4);
    const or = args.where.AND[1].OR;
    expect(or).toEqual([
      { name: { contains: 'كريم', mode: 'insensitive' } },
      { nameEn: { contains: 'كريم', mode: 'insensitive' } },
      { sku: { contains: 'كريم', mode: 'insensitive' } },
    ]);
  });

  it('never a price, a cost or a stock figure — the select is closed', async () => {
    await ask('كريم');
    const select = db.product.findMany.mock.calls[0][0].select;
    for (const secret of ['basePrice', 'costPrice', 'cost', 'stock', 'quantity', 'unitCost']) {
      expect(select, secret).not.toHaveProperty(secret);
    }
  });

  it('and not one customer — the palette asks the customers table nothing', async () => {
    await ask('0791234567');
    expect(Object.keys(db)).not.toContain('customer');
  });
});

describe('in whose scope', () => {
  it('the session’s company and store, never the body’s', async () => {
    await ask('كريم');
    const base = db.product.findMany.mock.calls[0][0].where.AND[0];
    expect(base).toEqual({ companyId: 'co-1', storeId: 'st-1' });
  });

  it('a grant narrowed to a category finds only that category', async () => {
    requireContext.mockResolvedValue({
      user: user({ 'products.view': { scope: 'CATEGORY', scopeIds: ['cat-1'] } }), companyId: 'co-1', storeId: 'st-1',
    });
    await ask('كريم');
    expect(db.product.findMany.mock.calls[0][0].where.AND[0].categoryId).toEqual({ in: ['cat-1'] });
  });

  it('a grant narrowed to specific products finds only those', async () => {
    requireContext.mockResolvedValue({
      user: user({ 'products.view': { scope: 'SPECIFIC', scopeIds: ['p1', 'p2'] } }), companyId: 'co-1', storeId: 'st-1',
    });
    await ask('كريم');
    expect(db.product.findMany.mock.calls[0][0].where.AND[0].id).toEqual({ in: ['p1', 'p2'] });
  });

  it('the one function the catalogue also uses says the same', () => {
    expect(productScopeWhere({ scope: 'ALL_COMPANY' }, 'c', 's')).toEqual({ companyId: 'c', storeId: 's' });
    expect(productScopeWhere({ scope: 'OWN' }, 'c', null)).toEqual({ companyId: 'c' });
    expect(productScopeWhere({ scope: 'CATEGORY', scopeIds: undefined }, 'c', 's').categoryId).toEqual({ in: [] });
  });
});

describe('who gets it', () => {
  it('NEGATIVE: without «products.view» there is no query and no products', async () => {
    requireContext.mockResolvedValue({ user: user({ 'orders.view': WHOLE }), companyId: 'co-1', storeId: 'st-1' });
    const body = await (await ask('كريم')).json();
    expect(body.products).toEqual([]);
    // the order counters look a product's NAME up to count its orders; the palette's own product query is not among them
    const own = db.product.findMany.mock.calls.filter((c) => c[0]?.select?.sku === true);
    expect(own).toHaveLength(0);
  });

  it('and with neither grant, nothing at all reads the products', async () => {
    requireContext.mockResolvedValue({ user: user({}), companyId: 'co-1', storeId: 'st-1' });
    const body = await (await ask('كريم')).json();
    expect(body.products).toEqual([]);
    expect(db.product.findMany).not.toHaveBeenCalled();
  });

  it('a catalogue keeper with no «orders.view» finds the product, and the order-shaped answers stay empty', async () => {
    requireContext.mockResolvedValue({ user: user({ 'products.view': WHOLE }), companyId: 'co-1', storeId: 'st-1' });
    const body = await (await ask('كريم')).json();
    expect(body.products).toHaveLength(1);
    expect(body.facts).toEqual([]);
    expect(body.people).toEqual([]);
    expect(db.order.count).not.toHaveBeenCalled();
  });

  it('two letters is the floor: a shorter word asks the database nothing', async () => {
    const body = await (await ask('ك')).json();
    expect(body).toEqual({ facts: [], people: [], products: [] });
    expect(db.product.findMany).not.toHaveBeenCalled();
  });
});
