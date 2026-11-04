import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * THE CATALOGUE'S ECONOMICS — `GET /api/v1/products?fields=…` behind
 * `products.economics.read` (2026-11-04, the media buyer's work order §4.1
 * item 4).
 *
 * The rule the owner set for every number here: a figure this system holds
 * is given; one it does not hold is `null`; none is ever invented. So:
 *
 *   · `delivery_fee` / `return_fee` come from `DeliveryFee` — but that table
 *     is per courier per region, so a figure is given only where it has ONE
 *     answer for the product's shop, and `null` where couriers differ
 *   · `return_fee` of 0 is the column's default and reads as «not set»
 *   · `cod_fee_pct` has no source in this system: always `null`
 *   · `products.read` alone keeps hiding every one of them
 * ═══════════════════════════════════════════════════════════════════════
 */

const h = vi.hoisted(() => ({
  db: {
    systemToken: { findUnique: vi.fn(), update: vi.fn() },
    order: { findFirst: vi.fn() },
    orderItem: { findMany: vi.fn(), aggregate: vi.fn() },
    product: { findMany: vi.fn() },
    productionBatch: { findMany: vi.fn() },
    deliveryFee: { findMany: vi.fn() },
  },
  rateLimit: vi.fn(),
  activeOffersFor: vi.fn(),
  availableStock: vi.fn(),
  reservedElsewhere: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ db: h.db }));
vi.mock('@/lib/rate-limit', () => ({ rateLimit: (...a: unknown[]) => h.rateLimit(...a) }));
vi.mock('@/lib/offers', () => ({ activeOffersFor: (...a: unknown[]) => h.activeOffersFor(...a) }));
vi.mock('@/lib/reservation', () => ({
  availableStock: (...a: unknown[]) => h.availableStock(...a),
  reservedElsewhere: (...a: unknown[]) => h.reservedElsewhere(...a),
}));

import { GET as getProducts } from '@/app/api/v1/products/route';
import { COST_FIELDS, PRODUCT_FIELDS, singleFee } from './product-figures';
import { REPLIES_SCOPES, hasEconomicsScope, type V1Scope } from './system-token';

const tokenRow = (scopes: readonly string[], over: Record<string, unknown> = {}) => ({
  id: 'tok_mb',
  companyId: 'c1',
  system: 'mediabuyer',
  scopes: JSON.stringify(scopes),
  rateLimitPerMin: 30,
  expiresAt: new Date(Date.now() + 86_400_000),
  revokedAt: null,
  lastUsedAt: new Date(),
  ...over,
});

const call = (path: string, headers: Record<string, string> = { authorization: 'Bearer zk1_test' }) =>
  new Request(`https://oms.test${path}`, { headers: { 'x-request-id': 'mb_p', ...headers } });

/** A product in a shop whose country is Jordan (3 decimals) or Syria (USD). */
const jo = {
  id: 'p-jo',
  sku: 'TRF01',
  name: 'ماء الكمأة',
  nameEn: 'KamaaEye',
  basePrice: 20,
  storeId: 's-jo',
  store: { countryId: 'k-jo', country: { currencyCode: 'JOD', minorUnit: 3 } },
};
const sy = {
  id: 'p-sy',
  sku: 'TRF02',
  name: 'منتج',
  nameEn: null,
  basePrice: 15,
  storeId: 's-sy',
  store: { countryId: 'k-sy', country: { currencyCode: 'USD', minorUnit: 2 } },
};

const fee = (countryId: string, fee: number, returnFee: number, storeId: string | null = null) => ({
  countryId,
  fee,
  returnFee,
  provider: { storeId },
});

const FIELDS = '/api/v1/products?fields=code,name,delivery_fee,return_fee,cod_fee_pct';

beforeEach(() => {
  vi.clearAllMocks();
  h.rateLimit.mockReturnValue({ allowed: true, remaining: 29, retryAfterSec: 0 });
  h.db.systemToken.update.mockResolvedValue({});
  h.db.systemToken.findUnique.mockResolvedValue(tokenRow(['products.read', 'products.economics.read']));
  h.db.product.findMany.mockResolvedValue([jo, sy]);
  h.db.deliveryFee.findMany.mockResolvedValue([]);
  h.db.productionBatch.findMany.mockResolvedValue([]);
  h.db.order.findFirst.mockResolvedValue(null);
  h.db.orderItem.findMany.mockResolvedValue([]);
  h.activeOffersFor.mockResolvedValue([]);
  h.availableStock.mockResolvedValue(20);
  h.reservedElsewhere.mockResolvedValue(0);
});

describe('singleFee — one answer or none', () => {
  it('one distinct positive value, at the currency’s own places', () => {
    expect(singleFee([2.5, 2.5, 2.5], 3)).toBe('2.500');
    expect(singleFee([2.5, 2.50], 2)).toBe('2.50');
    expect(singleFee([3], 2)).toBe('3.00');
  });

  it('two different values, nothing, or only the zero default → null (never a pick)', () => {
    expect(singleFee([2.5, 3], 3)).toBeNull();
    expect(singleFee([], 3)).toBeNull();
    expect(singleFee([0, 0], 3)).toBeNull();
    expect(singleFee([Number.NaN], 3)).toBeNull();
    // A zero beside a real one is «not set» for that courier, not a second answer.
    expect(singleFee([0, 2.5], 3)).toBe('2.500');
  });
});

describe('the scope', () => {
  it('both names open the economics: the new one and the older products.costs.read', () => {
    expect(hasEconomicsScope(['products.economics.read'])).toBe(true);
    expect(hasEconomicsScope(['products.costs.read'])).toBe(true);
    expect(hasEconomicsScope(['products.read', 'orders.attribution.read'])).toBe(false);
    expect(hasEconomicsScope(REPLIES_SCOPES)).toBe(false);
  });

  it('every cost field is behind it — products.read alone is refused each one, before any product is read', async () => {
    h.db.systemToken.findUnique.mockResolvedValue(tokenRow(['products.read']));
    for (const f of COST_FIELDS) {
      const res = await getProducts(call(`/api/v1/products?fields=code,name,${f}`));
      expect(res.status, f).toBe(403);
      expect((await res.json()).error).toMatchObject({ code: 'SCOPE_MISSING', details: { required: 'products.economics.read' } });
    }
    expect(h.db.product.findMany).not.toHaveBeenCalled();
    expect(h.db.deliveryFee.findMany).not.toHaveBeenCalled();
  });

  it('and the fields that are not cost (aliases, price_options) stay with products.read', async () => {
    h.db.systemToken.findUnique.mockResolvedValue(tokenRow(['products.read']));
    const res = await getProducts(call('/api/v1/products?fields=code,name,aliases,price_options'));
    expect(res.status).toBe(200);
  });

  it('a key minted under the older name keeps working', async () => {
    h.db.systemToken.findUnique.mockResolvedValue(tokenRow(['products.read', 'products.costs.read']));
    h.db.deliveryFee.findMany.mockResolvedValue([fee('k-jo', 2.5, 1)]);
    const res = await getProducts(call(FIELDS));
    expect(res.status).toBe(200);
    expect((await res.json()).items[0].delivery_fee).toBe('2.500');
  });

  it('economics without products.read is not a way into the catalogue: 403', async () => {
    h.db.systemToken.findUnique.mockResolvedValue(tokenRow(['products.economics.read']));
    expect((await getProducts(call(FIELDS))).status).toBe(403);
  });

  it('401 with no key or a dead one, 429 over the allowance — and no query either time', async () => {
    expect((await getProducts(call(FIELDS, {}))).status).toBe(401);
    h.db.systemToken.findUnique.mockResolvedValue(null);
    expect((await getProducts(call(FIELDS))).status).toBe(401);
    h.db.systemToken.findUnique.mockResolvedValue(tokenRow(['products.read', 'products.economics.read']));
    h.rateLimit.mockReturnValue({ allowed: false, remaining: 0, retryAfterSec: 9 });
    const res = await getProducts(call(FIELDS));
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('9');
    expect(h.db.product.findMany).not.toHaveBeenCalled();
  });
});

describe('delivery_fee and return_fee — from DeliveryFee, or null', () => {
  it('one fee across the shop’s country → that figure, at the currency’s places; USD shop untouched by JOD rows', async () => {
    h.db.deliveryFee.findMany.mockResolvedValue([
      fee('k-jo', 2.5, 1.25),
      fee('k-jo', 2.5, 1.25), // a second region, the same fee
      fee('k-sy', 4, 2),
    ]);
    const { items } = await (await getProducts(call(FIELDS))).json();
    expect(items[0]).toMatchObject({ code: 'TRF01', delivery_fee: '2.500', return_fee: '1.250', cod_fee_pct: null });
    expect(items[1]).toMatchObject({ code: 'TRF02', delivery_fee: '4.00', return_fee: '2.00', cod_fee_pct: null });
  });

  it('couriers that differ → null for BOTH products’ differing figure; never the cheapest, never the mean', async () => {
    h.db.deliveryFee.findMany.mockResolvedValue([fee('k-jo', 2.5, 1), fee('k-jo', 3, 1), fee('k-sy', 4, 2)]);
    const { items } = await (await getProducts(call(FIELDS))).json();
    expect(items[0]).toMatchObject({ delivery_fee: null, return_fee: '1.000' });
    expect(items[1]).toMatchObject({ delivery_fee: '4.00' });
  });

  it('a return fee still at the default zero is «not set» → null', async () => {
    h.db.deliveryFee.findMany.mockResolvedValue([fee('k-jo', 2.5, 0)]);
    const { items } = await (await getProducts(call(FIELDS))).json();
    expect(items[0]).toMatchObject({ delivery_fee: '2.500', return_fee: null });
  });

  it('no fee rows at all → null', async () => {
    const { items } = await (await getProducts(call(FIELDS))).json();
    expect(items[0]).toMatchObject({ delivery_fee: null, return_fee: null, cod_fee_pct: null });
  });

  it('another shop’s own courier is not this shop’s fee; a company-wide courier is everyone’s', async () => {
    h.db.deliveryFee.findMany.mockResolvedValue([
      fee('k-jo', 9, 9, 'another-shop'), // not ours
      fee('k-jo', 2.5, 1, null), // company-wide
      fee('k-jo', 2.5, 1, 's-jo'), // this shop's own, the same
    ]);
    const { items } = await (await getProducts(call(FIELDS))).json();
    expect(items[0]).toMatchObject({ delivery_fee: '2.500', return_fee: '1.000' });
  });

  it('the query is the token’s company, active rows over active couriers only — and only when a fee field was asked', async () => {
    await getProducts(call(FIELDS));
    expect(h.db.deliveryFee.findMany.mock.calls[0][0].where).toEqual({
      companyId: 'c1',
      countryId: { in: ['k-jo', 'k-sy'] },
      isActive: true,
      provider: { isActive: true },
    });
    h.db.deliveryFee.findMany.mockClear();
    await getProducts(call('/api/v1/products?fields=code,name,cod_fee_pct,aliases'));
    expect(h.db.deliveryFee.findMany).not.toHaveBeenCalled();
  });

  it('a shop with no country has no fee, and no query is made for it', async () => {
    h.db.product.findMany.mockResolvedValue([{ ...jo, store: null }]);
    const { items } = await (await getProducts(call(FIELDS))).json();
    expect(items[0]).toMatchObject({ delivery_fee: null, return_fee: null });
    expect(h.db.deliveryFee.findMany).not.toHaveBeenCalled();
  });

  it('cod_fee_pct is null for every product, whatever the fee table holds', async () => {
    h.db.deliveryFee.findMany.mockResolvedValue([fee('k-jo', 2.5, 1)]);
    const { items } = await (await getProducts(call('/api/v1/products?fields=cod_fee_pct'))).json();
    for (const i of items) expect(i.cod_fee_pct).toBeNull();
  });
});

describe('the answer without fields is what it always was', () => {
  it('no economics key appears unless asked, and every declared optional field is a known one', async () => {
    const { items } = await (await getProducts(call('/api/v1/products'))).json();
    for (const i of items) for (const f of PRODUCT_FIELDS) expect(i).not.toHaveProperty(f);
    expect(h.db.deliveryFee.findMany).not.toHaveBeenCalled();
  });

  it('typed as a scope the product defines', () => {
    const s: V1Scope = 'products.economics.read';
    expect(s).toBe('products.economics.read');
  });
});
