import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * THE DASHBOARD DOOR ASKS FOR THE WHOLE HISTORY BY NAME.
 *
 * `getCompanyAnalytics` defaults to the 90-day window (see
 * `src/lib/all-means-all.test.ts`). The dashboard's «الكل» is the one place
 * that reads every order, so this door must hand the engine `reportRange` as
 * an explicit window — an empty one under «الكل», a real one for a named
 * period. Asserted on the arguments the door passes, not on its source.
 */

const { requireContext, requirePermission, can, getCompanyAnalytics } = vi.hoisted(() => ({
  requireContext: vi.fn(),
  requirePermission: vi.fn(),
  can: vi.fn(() => true),
  getCompanyAnalytics: vi.fn(),
}));

vi.mock('@/lib/geo-context', () => ({ requireContext: (...a: unknown[]) => requireContext(...a) }));
vi.mock('@/lib/authorization', () => ({
  requirePermission: (...a: unknown[]) => requirePermission(...a),
  can: (...a: unknown[]) => can(...(a as [])),
  getPermissionScope: () => ({ scope: 'ALL_COMPANY' }),
}));
vi.mock('@/lib/rate-limit', () => ({ rateLimit: () => ({ allowed: true, remaining: 29, retryAfterSec: 0 }) }));
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

const ANALYTICS = {
  period: 'all',
  ordersCount: { total: 0, confirmed: 0, delivered: 0 },
  rates: { confirmationRate: 0, deliveryRate: 0 },
  financials: { deliveredRevenue: 0, netProfit: 0 },
  aiContext: {},
  productStats: [],
  orders: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  requireContext.mockResolvedValue({ companyId: 'c1', storeId: 's1', user: { id: 'u1', role: 'COMPANY_ADMIN', status: 'ACTIVE' } });
  requirePermission.mockResolvedValue({});
  getCompanyAnalytics.mockResolvedValue(ANALYTICS);
});

/** The window the door handed the engine for the CURRENT period (the first call). */
const windowFor = async (period: string) => {
  await GET(new Request(`http://localhost/api/analytics?period=${period}`));
  return getCompanyAnalytics.mock.calls[0][2] as { start?: Date; end?: Date } | undefined;
};

describe('the dashboard door', () => {
  it('under «الكل» hands the engine an explicit, empty window — the whole history', async () => {
    expect(await windowFor('all')).toEqual({});
  });

  it('under a named period hands it that period', async () => {
    const w = await windowFor('30d');
    expect(w?.start).toBeInstanceOf(Date);
    expect(w?.end).toBeInstanceOf(Date);
  });
});
