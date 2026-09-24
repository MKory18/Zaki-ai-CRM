import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Marketing numbers need their own permission: a confirmation supervisor
 * opens the performance screen for the team tables, and that is all.
 */

const { requirePermission, landingAnalytics } = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  landingAnalytics: vi.fn(),
}));

vi.mock('@/lib/geo-context', () => ({ requireContext: async () => ({ companyId: 'c1', storeId: 's1' }) }));
vi.mock('@/lib/authorization', () => ({ requirePermission: (...a: unknown[]) => requirePermission(...a) }));
vi.mock('@/lib/landing-analytics', () => ({ landingAnalytics: (...a: unknown[]) => landingAnalytics(...a) }));

import { GET } from './route';

class Denied extends Error { status = 403; }
vi.mock('@/lib/api-error', () => ({
  apiErrorResponse: (e: unknown) => new Response(JSON.stringify({ error: 'x' }), { status: (e as { status?: number }).status ?? 500 }),
}));

const get = () => GET(new Request('http://localhost/api/growth/landing-analytics?startDate=2026-09-01&endDate=2026-09-30'));

beforeEach(() => {
  vi.clearAllMocks();
  landingAnalytics.mockResolvedValue({ totals: {} });
});

describe('who may read it', () => {
  it('someone who may read reports and landing pages', async () => {
    requirePermission.mockResolvedValue(undefined);
    expect((await get()).status).toBe(200);
    expect(landingAnalytics.mock.calls[0][0]).toMatchObject({ companyId: 'c1', storeId: 's1' });
  });

  it('not a supervisor with reports but no landing pages', async () => {
    requirePermission.mockImplementation(async (key: string) => {
      if (key === 'landing_pages.view') throw new Denied();
    });
    expect((await get()).status).toBe(403);
    expect(landingAnalytics).not.toHaveBeenCalled();
  });

  it('not someone with landing pages but neither reports nor analytics', async () => {
    requirePermission.mockImplementation(async (key: string) => {
      if (key !== 'landing_pages.view') throw new Denied();
    });
    expect((await get()).status).toBe(403);
    expect(landingAnalytics).not.toHaveBeenCalled();
  });
});
