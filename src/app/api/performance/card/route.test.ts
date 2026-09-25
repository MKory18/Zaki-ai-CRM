import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * YOUR OWN NUMBERS ARE YOURS. SOMEBODY ELSE'S ARE A DECISION.
 *
 * A person may always open their own card: a system that shows somebody
 * their delivery rate only if an administrator remembered to tick a box is
 * a system where nobody knows where they stand, and the score exists to be
 * acted on.
 *
 * Reading a COLLEAGUE's card is a different thing and needs `team.monitor`,
 * enforced here rather than by not drawing a button.
 */

const { db, requireContext, can, performanceSettings, scoreRole, peersOf, owedTo } = vi.hoisted(() => ({
  db: { user: { findFirst: vi.fn() } },
  requireContext: vi.fn(),
  can: vi.fn(),
  performanceSettings: vi.fn(),
  scoreRole: vi.fn(),
  peersOf: vi.fn(),
  owedTo: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ db }));
vi.mock('@/lib/geo-context', () => ({ requireContext: (...a: unknown[]) => requireContext(...a) }));
vi.mock('@/lib/authorization', () => ({ can: (...a: unknown[]) => can(...a) }));
vi.mock('@/lib/performance-settings', () => ({ performanceSettings: (...a: unknown[]) => performanceSettings(...a) }));
vi.mock('@/lib/performance-metrics', () => ({ scoreRole: (...a: unknown[]) => scoreRole(...a) }));
vi.mock('@/lib/performance-people', () => ({ peersOf: (...a: unknown[]) => peersOf(...a) }));
vi.mock('@/lib/commission-payout', () => ({ owedTo: (...a: unknown[]) => owedTo(...a) }));

import { GET } from './route';

const ME = 'me-1';
const OTHER = 'other-1';

const card = (userId?: string) =>
  GET(new Request(`http://localhost/api/performance/card${userId ? `?userId=${userId}` : ''}`));

const ROW = (id: string, total: number, rank: number) => ({
  id,
  name: 'سارة',
  role: 'CONFIRMATION_AGENT',
  score: { total, possible: 85, bands: [], sample: 40, minSample: 10, reason: null },
  rank,
  of: 3,
});

beforeEach(() => {
  vi.resetAllMocks();
  requireContext.mockResolvedValue({
    user: { id: ME, role: 'CONFIRMATION_AGENT' },
    companyId: 'c1',
    storeId: 's1',
    country: { workHoursStart: '09:00', workHoursEnd: '18:00', weekendDays: [5, 6], timezone: 'Asia/Damascus', currencyCode: 'SYP' },
  });
  can.mockReturnValue(false);
  db.user.findFirst.mockResolvedValue({ id: ME, name: 'سارة', role: 'CONFIRMATION_AGENT', commissionCurrency: null });
  performanceSettings.mockResolvedValue({ deliveryRateBar: 0.6, issuesRateBar: 0.1, minSample: 10, period: 'MONTHLY' });
  peersOf.mockResolvedValue([{ id: ME, name: 'سارة' }]);
  scoreRole.mockResolvedValue([ROW(ME, 71, 2)]);
  owedTo.mockResolvedValue([{ currencyCode: 'SYP', amount: 500, entries: ['e1'] }]);
});

describe('my own card', () => {
  it('opens without any permission at all', async () => {
    expect((await card()).status).toBe(200);
    expect(can).not.toHaveBeenCalled();
  });

  it('comes back band by band, never as one opaque figure', async () => {
    const body = await (await card()).json();
    expect(body.score).toHaveProperty('bands');
    expect(body.score).toHaveProperty('possible');
  });

  it('says where I stand within my role, and out of how many', async () => {
    const body = await (await card()).json();
    expect(body.rank).toEqual({ position: 2, of: 3 });
  });

  it('carries the bars, so the screen can mark a line as under them', async () => {
    const body = await (await card()).json();
    expect(body.bars).toEqual({ deliveryRate: 0.6, issuesRate: 0.1 });
  });

  it('and what I am owed, from the ledger that already knows', async () => {
    const body = await (await card()).json();
    expect(body.owed[0]).toMatchObject({ currencyCode: 'SYP', amount: 500 });
  });
});

describe('somebody else’s card', () => {
  it('is refused without team.monitor — and nothing is read', async () => {
    can.mockReturnValue(false);
    const res = await card(OTHER);
    expect(res.status).toBe(403);
    expect(db.user.findFirst).not.toHaveBeenCalled();
    expect(scoreRole).not.toHaveBeenCalled();
  });

  it('opens with it', async () => {
    can.mockReturnValue(true);
    db.user.findFirst.mockResolvedValue({ id: OTHER, name: 'عمر', role: 'CONFIRMATION_AGENT', commissionCurrency: 'EGP' });
    scoreRole.mockResolvedValue([ROW(OTHER, 64, 1)]);
    expect((await card(OTHER)).status).toBe(200);
    expect(can).toHaveBeenCalledWith(expect.anything(), 'team.monitor');
  });

  it('and never somebody of another company', async () => {
    can.mockReturnValue(true);
    db.user.findFirst.mockResolvedValue(null);
    expect((await card(OTHER)).status).toBe(404);
    expect(db.user.findFirst.mock.calls[0][0].where).toMatchObject({ id: OTHER, companyId: 'c1' });
  });
});

describe('a role this score does not measure', () => {
  it('comes back with no score rather than a made-up one', async () => {
    db.user.findFirst.mockResolvedValue({ id: ME, name: 'سارة', role: 'ACCOUNTANT', commissionCurrency: null });
    peersOf.mockResolvedValue([]);
    scoreRole.mockResolvedValue([]);
    const body = await (await card()).json();
    expect(body.score).toBeNull();
    expect(body.rank).toBeNull();
  });
});
