import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * THE GRADE ON THE EMPLOYEES LIST IS THE CARD'S GRADE.
 *
 * Not «the same formula» — the same call. Every test below holds the route to
 * borrowing: it may read presence, and it may decide which of five sentences
 * a row prints, but the number out of ninety must arrive from `scoreRole` and
 * leave unchanged. A route that recomputed it would give one person two
 * grades in one product, and the argument about which is real would be won by
 * whichever screen the owner opened first.
 */

const { db, requireContext, requirePermission, performanceSettings, scoreRole, peersOf } = vi.hoisted(() => ({
  db: { user: { findMany: vi.fn() }, $queryRaw: vi.fn() },
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

import { GET, daysSince } from './route';

/** The measured roster, trimmed to the rows each test needs. */
const SARA = { id: 'sara', role: 'MODERATOR', status: 'ACTIVE' };
const ACCOUNTANT = { id: 'acct', role: 'ACCOUNTANT', status: 'ACTIVE' };
const EMPTY = { id: 'ffff', role: 'CONFIRMATION_AGENT', status: 'ACTIVE' };

const req = (ids: string) => new Request(`http://x/api/users/grades?ids=${ids}`);

beforeEach(() => {
  vi.resetAllMocks();
  requireContext.mockResolvedValue({
    user: { id: 'owner', role: 'COMPANY_ADMIN', companyId: 'c1' },
    companyId: 'c1',
    storeId: 's1',
    country: { workHoursStart: '09:00', workHoursEnd: '17:00', weekendDays: [5, 6], timezone: 'Asia/Amman' },
  });
  requirePermission.mockResolvedValue(undefined);
  performanceSettings.mockResolvedValue({ deliveryRateBar: 0.6, issuesRateBar: 0.1, minSample: 10, period: 'MONTHLY' });
  peersOf.mockResolvedValue([{ id: 'sara', name: 'سارة' }]);
  scoreRole.mockResolvedValue([
    {
      id: 'sara',
      name: 'سارة',
      role: 'MODERATOR',
      score: { total: 82, possible: 90, bands: [], sample: 148, minSample: 10, reason: null },
      rank: 1,
      of: 4,
    },
  ]);
  db.user.findMany.mockResolvedValue([SARA]);
  db.$queryRaw.mockResolvedValue([{ uid: 'sara', events: 150, days: 4, last_seen: new Date() }]);
});

describe('who may ask', () => {
  it('needs the roster permission AND the monitoring one', async () => {
    await GET(req('sara'));
    const asked = requirePermission.mock.calls.map((c) => c[0]);
    expect(asked).toContain('users.view');
    expect(asked).toContain('team.monitor');
  });

  it('and an administrator without team.monitor gets no grades, not a broken list', async () => {
    requirePermission.mockImplementation(async (key: string) => {
      if (key === 'team.monitor') throw new Error('Forbidden: missing required permission team.monitor');
    });
    const res = await GET(req('sara'));
    expect(res.status).toBeGreaterThanOrEqual(400);
    // Nothing was read, so nothing leaked on the way to the refusal.
    expect(db.user.findMany).not.toHaveBeenCalled();
    expect(db.$queryRaw).not.toHaveBeenCalled();
  });

  it('filters the ids through the one tenancy rule rather than trusting them', async () => {
    await GET(req('sara,someone-elses-user'));
    const where = db.user.findMany.mock.calls[0][0].where;
    // manageableUsersWhere for a company admin: their own company plus the
    // unplaced accounts waiting to be adopted — never a bare id list.
    expect(JSON.stringify(where)).toContain('companyId');
    expect(where.AND[1].id.in).toEqual(['sara', 'someone-elses-user']);
  });

  it('and returns nothing at all for an empty ask, without querying', async () => {
    const res = await GET(req(''));
    const body = await res.json();
    expect(body.grades).toEqual([]);
    expect(body.readiness.total).toBe(0);
    expect(db.user.findMany).not.toHaveBeenCalled();
  });

  it('caps the ask, so a hand-written query string cannot scan the company', async () => {
    const many = Array.from({ length: 300 }, (_, i) => `u${i}`).join(',');
    db.user.findMany.mockResolvedValue([]);
    await GET(req(many));
    expect(db.user.findMany.mock.calls[0][0].where.AND[1].id.in.length).toBeLessThanOrEqual(100);
  });

  it('and asks about each person once however often they are named', async () => {
    await GET(req('sara,sara,sara'));
    expect(db.user.findMany.mock.calls[0][0].where.AND[1].id.in).toEqual(['sara']);
  });
});

describe('the number', () => {
  it('is the one scoreRole returned, unchanged', async () => {
    const body = await (await GET(req('sara'))).json();
    const sara = body.grades.find((g: { userId: string }) => g.userId === 'sara');
    expect(sara.state).toBe('GRADED');
    expect(sara.scored).toEqual({ total: 82, possible: 90, sample: 148, minSample: 10, rank: 1, of: 4 });
    expect(sara.why).toContain('82 من 90');
  });

  it('is scored per role in one pass, over the store and window the card uses', async () => {
    await GET(req('sara'));
    expect(scoreRole).toHaveBeenCalledTimes(1);
    const [scope, role, , minSample] = scoreRole.mock.calls[0];
    expect(role).toBe('MODERATOR');
    expect(scope.storeId).toBe('s1');
    expect(scope.companyId).toBe('c1');
    expect(scope.calendar.timezone).toBe('Asia/Amman');
    expect(minSample).toBe(10);
  });

  it('and a role with no bands is never even queried for one', async () => {
    db.user.findMany.mockResolvedValue([ACCOUNTANT]);
    db.$queryRaw.mockResolvedValue([{ uid: 'acct', events: 2, days: 1, last_seen: new Date() }]);
    const body = await (await GET(req('acct'))).json();
    expect(scoreRole).not.toHaveBeenCalled();
    expect(peersOf).not.toHaveBeenCalled();
    expect(body.grades[0].state).toBe('ROLE_NOT_MEASURED');
  });

  it('says which store the grade is scoped to, because a rank across stores is two businesses', async () => {
    const body = await (await GET(req('sara'))).json();
    expect(body.store.id).toBe('s1');
  });
});

describe('presence', () => {
  it('is read from the evidence tables, and a person absent from them has none', async () => {
    db.user.findMany.mockResolvedValue([EMPTY]);
    db.$queryRaw.mockResolvedValue([]);
    peersOf.mockResolvedValue([]);
    scoreRole.mockResolvedValue([]);
    const body = await (await GET(req('ffff'))).json();
    expect(body.grades[0].state).toBe('NO_TRACE');
    expect(body.grades[0].trace).toEqual({ events: 0, activeDays: 0, lastSeenDaysAgo: null });
  });

  it('counts whole days since the last action, floored, so a floor is never crossed by rounding', () => {
    const now = new Date('2026-09-29T12:00:00Z');
    expect(daysSince(null, now)).toBeNull();
    expect(daysSince(new Date('2026-09-29T11:00:00Z'), now)).toBe(0);
    expect(daysSince(new Date('2026-09-28T01:00:00Z'), now)).toBe(1);
    expect(daysSince(new Date('2026-09-15T23:00:00Z'), now)).toBe(13);
    // A clock skew ahead of now must not read as a negative age.
    expect(daysSince(new Date('2026-09-30T12:00:00Z'), now)).toBe(0);
  });

  it('reads every evidence table, because the back office appears in only one of them', async () => {
    await GET(req('sara'));
    const sql = JSON.stringify(db.$queryRaw.mock.calls[0][0]);
    for (const table of [
      'orders',
      'order_claim_history',
      'order_status_logs',
      'order_contact_attempts',
      'audit_logs',
      'delivery_attempts',
    ]) {
      expect(sql, `${table} is not in the trace`).toContain(table);
    }
  });

  it('and counts a day in the country\'s own timezone, not the server\'s', async () => {
    await GET(req('sara'));
    const call = db.$queryRaw.mock.calls[0][0];
    expect(JSON.stringify(call.values ?? [])).toContain('Asia/Amman');
  });
});

describe('the strip', () => {
  it('counts the roster by reason, and the reasons add up to the roster', async () => {
    db.user.findMany.mockResolvedValue([SARA, ACCOUNTANT, EMPTY]);
    db.$queryRaw.mockResolvedValue([
      { uid: 'sara', events: 150, days: 4, last_seen: new Date() },
      { uid: 'acct', events: 2, days: 1, last_seen: new Date() },
    ]);
    const body = await (await GET(req('sara,acct,ffff'))).json();
    const r = body.readiness;
    expect(r.total).toBe(3);
    expect(r.graded).toBe(1);
    expect(r.roleNotMeasured).toBe(1);
    expect(r.noTrace).toBe(1);
    expect(r.graded + r.thinSample + r.roleNotMeasured + r.notActive + r.outsideStore + r.noTrace).toBe(3);
    expect(r.why).toContain('من 3 موظفاً');
  });

  it('and orders the rows so the graded lead and the empty accounts trail', async () => {
    db.user.findMany.mockResolvedValue([EMPTY, ACCOUNTANT, SARA]);
    db.$queryRaw.mockResolvedValue([
      { uid: 'sara', events: 150, days: 4, last_seen: new Date() },
      { uid: 'acct', events: 2, days: 1, last_seen: new Date() },
    ]);
    const body = await (await GET(req('ffff,acct,sara'))).json();
    expect(body.grades.map((g: { userId: string }) => g.userId)).toEqual(['sara', 'acct', 'ffff']);
  });
});
