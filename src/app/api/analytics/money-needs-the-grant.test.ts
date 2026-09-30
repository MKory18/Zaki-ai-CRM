import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * THE COMPANY'S PROFIT DOES NOT TRAVEL TO WHOEVER OPENS A DASHBOARD.
 *
 * Found with a real session, not by reading: signed in as a MODERATOR —
 * `sara@bioderma.com`, a salesperson whose grants do not include
 * `finance.view` — `GET /api/analytics?period=today` answered 200 with
 *
 *   financials.costOfGoodsSold · commission · operationalExpenses
 *   financials.grossProfit · netProfit · profitMargin
 *   aiContext.net_profit · production_cost · profit_margin
 *   previous.netProfit
 *
 * The dashboard never showed her any of it: every financial tile is
 * wrapped in `canFinance`, which reads `finance.view`. So the rule was
 * already decided — and only written on the client, where it is a
 * decoration. «A control hidden in the UI but permitted by the API is not
 * a permission.»
 *
 * The route is gated on `analytics.view`, which the engine resolves
 * through `LEGACY_ALIAS` to `reports.view` — and a moderator holds that.
 * The gate was never the problem; the payload was.
 *
 * THE COUNTS AND THE RATES STAY. How many orders were confirmed or
 * delivered is this person's own work, and it is what the screen is for.
 */

const { requireContext, requirePermission, can, getCompanyAnalytics, rateLimit } = vi.hoisted(() => ({
  requireContext: vi.fn(),
  requirePermission: vi.fn(),
  can: vi.fn(),
  getCompanyAnalytics: vi.fn(),
  rateLimit: vi.fn(() => ({ allowed: true, remaining: 29, retryAfterSec: 0 })),
}));

vi.mock('@/lib/geo-context', () => ({ requireContext: (...a: unknown[]) => requireContext(...a) }));
vi.mock('@/lib/authorization', () => ({
  requirePermission: (...a: unknown[]) => requirePermission(...a),
  can: (...a: unknown[]) => can(...a),
  getPermissionScope: () => ({ scope: 'ALL_COMPANY' }),
}));
vi.mock('@/lib/rate-limit', () => ({ rateLimit: (...a: unknown[]) => rateLimit(...a) }));
vi.mock('@/lib/analytics', async (orig) => ({
  ...(await orig<typeof import('@/lib/analytics')>()),
  getCompanyAnalytics: (...a: unknown[]) => getCompanyAnalytics(...a),
}));
vi.mock('@/lib/db', () => ({
  db: {
    order: { count: vi.fn().mockResolvedValue(0), aggregate: vi.fn().mockResolvedValue({ _sum: {}, _count: { _all: 0 } }), groupBy: vi.fn().mockResolvedValue([]), findMany: vi.fn().mockResolvedValue([]) },
    expense: { count: vi.fn().mockResolvedValue(0), aggregate: vi.fn().mockResolvedValue({ _sum: {} }) },
    orderItem: { groupBy: vi.fn().mockResolvedValue([]), findMany: vi.fn().mockResolvedValue([]) },
  },
}));

import { GET } from './route';

/** What `getCompanyAnalytics` hands the route. */
const ANALYTICS = {
  period: 'today',
  ordersCount: { total: 4, confirmed: 3, delivered: 2 },
  rates: { confirmationRate: 75, deliveryRate: 66 },
  financials: {
    deliveredRevenue: 900,
    costOfGoodsSold: 300,
    shippingCosts: 40,
    commission: 25,
    operationalExpenses: 60,
    grossProfit: 560,
    netProfit: 475,
    profitMargin: 52.7,
  },
  aiContext: {
    orders_today: 4,
    net_profit: 475,
    production_cost: 300,
    profit_margin: 52.7,
    top_profitable_product: 'كريم الندبات',
  },
  productStats: [],
  orders: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  requireContext.mockResolvedValue({
    companyId: 'c1',
    storeId: 's1',
    user: { id: 'u1', role: 'MODERATOR', status: 'ACTIVE' },
  });
  requirePermission.mockResolvedValue({});
  rateLimit.mockReturnValue({ allowed: true, remaining: 29, retryAfterSec: 0 });
  getCompanyAnalytics.mockResolvedValue(ANALYTICS);
});

const read = async () => {
  const res = await GET(new Request('http://localhost/api/analytics?period=today'));
  return { status: res.status, body: await res.json() };
};

describe('a role without finance.view', () => {
  beforeEach(() => can.mockImplementation((_u: unknown, p: string) => p !== 'finance.view'));

  it('is not handed the company financials', async () => {
    const { status, body } = await read();
    expect(status).toBe(200);
    expect(body.financials, 'سُلِّمت الأرباحُ لمن لا يملك finance.view').toBeUndefined();
  });

  it('nor the same figures wearing the assistant’s clothes', async () => {
    // A second copy of a number is a second door to it.
    const { body } = await read();
    const keys = Object.keys(body.aiContext ?? {});
    expect(keys).toContain('orders_today');
    for (const leaked of ['net_profit', 'production_cost', 'profit_margin', 'top_profitable_product']) {
      expect(keys, `aiContext.${leaked}`).not.toContain(leaked);
    }
  });

  it('nor last period’s profit through the comparison', async () => {
    const { body } = await read();
    if (body.previous) expect(body.previous.netProfit).toBeUndefined();
  });

  it('but keeps the counts and rates, which are their own work', async () => {
    const { body } = await read();
    expect(body.ordersCount).toMatchObject({ total: 4, confirmed: 3, delivered: 2 });
    expect(body.rates).toMatchObject({ confirmationRate: 75 });
  });
});

describe('a role that may see money', () => {
  beforeEach(() => can.mockReturnValue(true));

  it('gets all of it, unchanged', async () => {
    const { body } = await read();
    expect(body.financials).toMatchObject({ netProfit: 475, costOfGoodsSold: 300, profitMargin: 52.7 });
    expect(Object.keys(body.aiContext)).toContain('net_profit');
  });
});
