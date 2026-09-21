import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The financial summary.
 *
 * It used to SUM stored columns — totalRevenue, grossProfit, netProfit,
 * productCost, subtotal, discount — and not one of them is ever written. On
 * the live database that was zero of a hundred and fifty-five orders for
 * every single column, so the screen reported a company that had sold
 * nothing: revenue 0, profit 0, margin null.
 *
 * These hold it to the one thing that made it wrong, and to the one rule
 * that keeps a forecast out of a revenue figure.
 */

const { db, requireContext, requirePermission, getCompanyAnalytics } = vi.hoisted(() => ({
  db: { order: { count: vi.fn() } },
  requireContext: vi.fn(),
  requirePermission: vi.fn(),
  getCompanyAnalytics: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ db }));
vi.mock('@/lib/geo-context', () => ({ requireContext: (...a: unknown[]) => requireContext(...a) }));
vi.mock('@/lib/authorization', () => ({ requirePermission: (...a: unknown[]) => requirePermission(...a) }));
vi.mock('@/lib/analytics', () => ({ getCompanyAnalytics: (...a: unknown[]) => getCompanyAnalytics(...a) }));

import { GET } from './summary/route';

const get = (qs = '') => GET(new Request(`http://localhost/api/finance/summary${qs}`));

const analytics = (over: Record<string, unknown> = {}) => ({
  ordersCount: { confirmed: 115, delivered: 115 },
  financials: {
    deliveredRevenue: 2321.48,
    costOfGoodsSold: 0,
    shippingCosts: 432,
    moderatorCommissions: 0,
    operationalExpenses: 0,
    grossProfit: 2321.48,
    netProfit: 1889.48,
    profitMargin: 81.39,
  },
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  requireContext.mockResolvedValue({ companyId: 'c1', storeId: 's1' });
  requirePermission.mockResolvedValue({});
  getCompanyAnalytics.mockResolvedValue(analytics());
  db.order.count.mockResolvedValue(0);
});

describe('the summary', () => {
  it('reports money that exists, not zeros from unwritten columns', async () => {
    const { summary } = await (await get()).json();
    expect(summary.totalRevenue).toBe(2321.48);
    expect(summary.netProfit).toBe(1889.48);
    expect(summary.profitMargin).toBe(81.39);
  });

  it('never sums a column the system does not write', async () => {
    // The whole defect in one assertion: this endpoint must not aggregate
    // orders itself. Its only order queries are settlement COUNTS.
    await get();
    expect(getCompanyAnalytics).toHaveBeenCalledTimes(1);
    for (const call of db.order.count.mock.calls) {
      expect(call[0].where).toHaveProperty('settlementStatus');
    }
  });

  it('averages over DELIVERED orders, not confirmed ones', async () => {
    // A confirmed order that never reached a door is not money. Dividing
    // real revenue by a larger, hopeful count understates the average and
    // makes every order look cheaper than it was.
    getCompanyAnalytics.mockResolvedValue(
      analytics({ ordersCount: { confirmed: 200, delivered: 115 } })
    );
    const { summary } = await (await get()).json();
    expect(summary.avgOrderValue).toBe(20.19); // 2321.48 / 115
  });

  it('says nothing rather than zero when nothing was delivered', async () => {
    getCompanyAnalytics.mockResolvedValue(
      analytics({ ordersCount: { confirmed: 10, delivered: 0 } })
    );
    const { summary } = await (await get()).json();
    expect(summary.avgOrderValue).toBeNull();
  });

  it('passes an explicit range straight through', async () => {
    await get('?from=2026-09-01&to=2026-09-20');
    expect(getCompanyAnalytics.mock.calls[0][1]).toMatchObject({
      startDate: '2026-09-01',
      endDate: '2026-09-20',
    });
  });

  it('asks for everything when no range is given', async () => {
    await get();
    expect(getCompanyAnalytics.mock.calls[0][1]).toEqual({ period: 'all' });
  });

  it('still needs permission to read the money', async () => {
    requirePermission.mockRejectedValue(new Error('Forbidden: missing required permission finance.view'));
    expect((await get()).status).not.toBe(200);
  });
});
