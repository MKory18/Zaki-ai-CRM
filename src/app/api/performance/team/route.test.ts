import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * NO PUBLISHED LIST OF THE WORST. EVER.
 *
 * A board sorted upward is a different product from a measuring tool:
 * people stop trying to raise the number and start trying not to be last,
 * and the number stops describing anything. So the order is fixed in the
 * service — best first — and there is no parameter that reverses it.
 *
 * A supervisor who wants to find who needs help reads the bottom of a list
 * sorted downward. What they cannot do is hand somebody a ranking of
 * failures.
 */

const { db, requireContext, requirePermission, performanceSettings, scoreRole, peersOf } = vi.hoisted(() => ({
  db: {},
  requireContext: vi.fn(),
  requirePermission: vi.fn(),
  performanceSettings: vi.fn(),
  scoreRole: vi.fn(),
  peersOf: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ db }));
vi.mock('@/lib/geo-context', () => ({ requireContext: (...a: unknown[]) => requireContext(...a) }));
vi.mock('@/lib/authorization', () => ({ requirePermission: (...a: unknown[]) => requirePermission(...a) }));
vi.mock('@/lib/performance-settings', () => ({ performanceSettings: (...a: unknown[]) => performanceSettings(...a) }));
vi.mock('@/lib/performance-metrics', () => ({ scoreRole: (...a: unknown[]) => scoreRole(...a) }));
vi.mock('@/lib/performance-people', () => ({ peersOf: (...a: unknown[]) => peersOf(...a) }));

import { GET } from './route';

const person = (id: string, total: number | null, rank: number) => ({
  id,
  name: id,
  role: 'CONFIRMATION_AGENT',
  score: { total, possible: 85, bands: [], sample: 40, minSample: 10, reason: total === null ? 'BELOW_MINIMUM' : null },
  rank,
  of: 3,
});

beforeEach(() => {
  vi.resetAllMocks();
  requireContext.mockResolvedValue({
    companyId: 'c1',
    storeId: 's1',
    country: { workHoursStart: '09:00', workHoursEnd: '18:00', weekendDays: [5, 6], timezone: 'Asia/Damascus' },
  });
  requirePermission.mockResolvedValue(undefined);
  performanceSettings.mockResolvedValue({ deliveryRateBar: 0.6, issuesRateBar: 0.1, minSample: 10, period: 'WEEKLY' });
  peersOf.mockResolvedValue([{ id: 'a', name: 'a' }]);
  scoreRole.mockResolvedValue([person('a', 80, 1), person('b', 55, 2), person('c', null, 3)]);
});

describe('who may look', () => {
  it('nobody without team.monitor — and nothing is computed', async () => {
    requirePermission.mockRejectedValue(new Error('Forbidden: missing required permission team.monitor'));
    expect((await GET()).status).toBe(403);
    expect(scoreRole).not.toHaveBeenCalled();
  });
});

describe('the order', () => {
  it('is best first, as the service produced it', async () => {
    const body = await (await GET()).json();
    expect(body.roles[0].people.map((p: { id: string }) => p.id)).toEqual(['a', 'b', 'c']);
  });

  it('and there is no parameter anywhere that reverses it', async () => {
    // The handler takes no request at all: there is nowhere to put one.
    expect(GET.length).toBe(0);
  });
});

describe('what it shows', () => {
  it('one group per role, because the bands differ by role', async () => {
    const body = await (await GET()).json();
    expect(body.roles[0]).toHaveProperty('ar');
    expect(body.roles[0]).toHaveProperty('role');
  });

  it('leaves out a role with nobody in it, rather than an empty table', async () => {
    scoreRole.mockResolvedValue([]);
    const body = await (await GET()).json();
    expect(body.roles).toEqual([]);
  });

  it('the same window and the same bars the card uses', async () => {
    const body = await (await GET()).json();
    expect(body.window.period).toBe('WEEKLY');
    expect(body.bars).toEqual({ deliveryRate: 0.6, issuesRate: 0.1 });
    expect(body.minSample).toBe(10);
  });

  it('and asks for this store only', async () => {
    await GET();
    expect(peersOf.mock.calls[0][1]).toMatchObject({ companyId: 'c1', storeId: 's1' });
  });
});
