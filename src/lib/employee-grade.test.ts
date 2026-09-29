import { describe, expect, it } from 'vitest';
import {
  EMPLOYEE_GRADE_STATES,
  GRADABLE_STATUS,
  MIN_TRACE_EVENTS,
  STALE_DAYS,
  byEmployeeGrade,
  gradeEmployee,
  madeOfFor,
  presenceOf,
  rosterReadiness,
  type EmployeeFacts,
  type EmployeeScore,
} from './employee-grade';
import { stripComments, stripTemplates, repoFile } from './guard-source';

/**
 * THE GUARDS, ANCHORED TO WHAT WAS MEASURED.
 *
 * Every number quoted below was read off the dev database on 2026-09-29
 * before a line of this was designed: 19 accounts in 11 roles, 10 of them in
 * a role the score has bands for, exactly 1 clearing the owner's minimum
 * sample of 10 (82 out of 90, rank 1 of 4 moderators), 6 with no recorded
 * action anywhere. The scenario at the bottom replays that roster, so if the
 * shape of the verdict ever changes the failure names the real case.
 */

const trace = (events: number, activeDays: number, lastSeenDaysAgo: number | null) => ({
  events,
  activeDays,
  lastSeenDaysAgo,
});

const scored = (over: Partial<EmployeeScore> = {}): EmployeeScore => ({
  total: 82,
  possible: 90,
  sample: 148,
  minSample: 10,
  rank: 1,
  of: 4,
  ...over,
});

const facts = (over: Partial<EmployeeFacts> = {}): EmployeeFacts => ({
  userId: 'u1',
  role: 'MODERATOR',
  status: 'ACTIVE',
  trace: trace(150, 4, 0),
  scored: scored(),
  ...over,
});

describe('the states', () => {
  it('are checked most-informative first, and exactly one is true of a row', () => {
    // Every state reachable, and no row carrying two.
    const rows = [
      facts({ trace: trace(0, 0, null), scored: null }),
      facts({ role: 'ACCOUNTANT', scored: null }),
      facts({ status: 'DISABLED', scored: null }),
      facts({ scored: null }),
      facts({ scored: scored({ total: null, sample: 1 }) }),
      facts(),
    ];
    expect(rows.map((f) => gradeEmployee(f).state)).toEqual([...EMPLOYEE_GRADE_STATES]);
  });

  it('calls an account with no recorded action «بلا أثر» before anything else', () => {
    // Measured: 4 of the 6 traceless accounts hold a role the score CAN band,
    // so «0 من 10» is also true of them — and it invites the reader to wait
    // for a sample that is not coming. The account is the finding.
    const g = gradeEmployee(facts({ trace: trace(0, 0, null), scored: scored({ total: null, sample: 0 }) }));
    expect(g.state).toBe('NO_TRACE');
    expect(g.why).not.toContain('الحدّ الأدنى');
    expect(g.why).toContain('لم يسجّل حركةً واحدةً');
  });

  it('and paints only that one red, and only while the account is active', () => {
    const live = gradeEmployee(facts({ trace: trace(0, 0, null), scored: null }));
    const gone = gradeEmployee(facts({ trace: trace(0, 0, null), scored: null, status: 'DISABLED' }));
    expect(live.tone).toBe('bad');
    // A disabled account doing nothing is expected, not a finding.
    expect(gone.tone).toBe('unknown');
    expect(gone.why).toContain('متوقَّع');
  });

  it('says a role with no bands can NEVER be graded — a ceiling, not a floor', () => {
    // Measured: 9 of 19 accounts hold such a role. Telling the accountant to
    // confirm more orders would be telling them to wait for ever.
    const g = gradeEmployee(facts({ role: 'ACCOUNTANT', trace: trace(2, 1, 8), scored: null }));
    expect(g.state).toBe('ROLE_NOT_MEASURED');
    expect(g.madeOf).toEqual([]);
    expect(g.why).toContain('مهما عمِل');
    expect(g.why).not.toContain('الحدّ الأدنى');
  });

  it('never calls somebody who left «under the sample» — the reason is the status', () => {
    const g = gradeEmployee(facts({ status: 'SUSPENDED', scored: null }));
    expect(g.state).toBe('NOT_ACTIVE');
    expect(g.why).toContain('SUSPENDED');
    expect(g.label).not.toBe('خارج هذا المتجر');
  });

  it('nor calls somebody in another store ungraded — they are graded elsewhere', () => {
    const g = gradeEmployee(facts({ scored: null }));
    expect(g.state).toBe('OUTSIDE_STORE');
    expect(g.why).toContain('متجره');
  });

  it('prints the floor and what the number WOULD be made of when the sample is thin', () => {
    // Measured: 9 of the 10 measurable people sit at a sample of 0 or 1.
    const g = gradeEmployee(facts({ scored: scored({ total: null, sample: 1 }) }));
    expect(g.state).toBe('THIN_SAMPLE');
    expect(g.why).toContain('1 طلباً');
    expect(g.why).toContain('10');
    for (const band of madeOfFor('MODERATOR')) expect(g.why).toContain(band);
  });
});

describe('the number itself', () => {
  it('is the performance card\'s, passed through with no arithmetic on it', () => {
    const g = gradeEmployee(facts({ scored: scored({ total: 37, possible: 85, sample: 44, rank: 3, of: 5 }) }));
    expect(g.scored).toEqual(scored({ total: 37, possible: 85, sample: 44, rank: 3, of: 5 }));
    expect(g.why).toContain('37 من 85');
    expect(g.why).toContain('المرتبة 3 من 5');
  });

  it('and «مقيَّم» is green for a bad score too — it means the record can speak', () => {
    // There is no owner-set bar for a composite out of ninety. A chip that
    // greened at 82 and reddened at 12 would be this screen inventing one,
    // which is why the verdict is about readiness and the number is bare.
    const high = gradeEmployee(facts({ scored: scored({ total: 82 }) }));
    const low = gradeEmployee(facts({ scored: scored({ total: 12 }) }));
    expect(high.tone).toBe('good');
    expect(low.tone).toBe('good');
    expect(low.label).toBe(high.label);
  });

  it('is never fused with presence into one figure', () => {
    const a = gradeEmployee(facts({ scored: scored({ total: 50 }), trace: trace(150, 4, 0) }));
    const b = gradeEmployee(facts({ scored: scored({ total: 50 }), trace: trace(3, 1, 20) }));
    // Two very different working records, the same grade — because presence is
    // reported beside the score, never added to it.
    expect(a.scored?.total).toBe(b.scored?.total);
    expect(a.presence).not.toBe(b.presence);
  });
});

describe('presence — the second, independent fact', () => {
  it('counts rows and days and says how long ago, with no ratio anywhere', () => {
    const p = presenceOf(trace(150, 4, 0), 'ACTIVE');
    expect(p.text).toBe('150 حركةً في 4 أيام، آخرها اليوم.');
    expect(p.stale).toBe(false);
  });

  it('states plainly that there is nothing at all, rather than printing zeros', () => {
    const p = presenceOf(trace(0, 0, null), 'ACTIVE');
    expect(p.text).toContain('لا حركةَ مسجَّلةً');
    expect(p.text).not.toContain('0');
  });

  it('counts an Arabic noun the way Arabic counts it', () => {
    // «4 يوماً» reads to the owner the way «4 day» reads in English. Five
    // cases, and every sentence on this screen is read by him.
    expect(presenceOf(trace(1, 1, 3), 'ACTIVE').text).toBe('حركة في يوم، آخرها قبل 3 أيام.');
    expect(presenceOf(trace(2, 2, 2), 'ACTIVE').text).toBe('حركتين في يومين، آخرها قبل يومين.');
    expect(presenceOf(trace(7, 3, 11), 'ACTIVE').text).toBe('7 حركات في 3 أيام، آخرها قبل 11 يوماً.');
    expect(presenceOf(trace(150, 100, 1), 'ACTIVE').text).toBe('150 حركةً في 100 يوم، آخرها قبل يوم.');
  });

  it('flags a live account nobody has used, at the floor and not before it', () => {
    expect(presenceOf(trace(5, 2, STALE_DAYS), 'ACTIVE').stale).toBe(false);
    expect(presenceOf(trace(5, 2, STALE_DAYS + 1), 'ACTIVE').stale).toBe(true);
    expect(presenceOf(trace(5, 2, STALE_DAYS + 1), 'ACTIVE').text).toContain('لم يُستخدَم');
  });

  it('and never flags an account that is not active — dormancy is the point of it', () => {
    expect(presenceOf(trace(5, 2, 400), 'DISABLED').stale).toBe(false);
    expect(presenceOf(trace(5, 2, 400), 'SUSPENDED').stale).toBe(false);
  });

  it('has a threshold of one, because zero rows is a complete record not a small sample', () => {
    expect(MIN_TRACE_EVENTS).toBe(1);
    expect(presenceOf(trace(1, 1, 0), 'ACTIVE').text).not.toContain('لا حركةَ');
  });
});

describe('what the grade is made of', () => {
  it('names the bands in the same words the performance card prints', () => {
    expect(madeOfFor('MODERATOR')).toContain('نسبة التسليم');
    expect(madeOfFor('CONFIRMATION_AGENT')).toContain('زمن الاستجابة');
    // A moderator never works a queue, so there is no claim-to-first-action
    // clock to run on them. Borrowed from `bandsForRole`, not re-listed.
    expect(madeOfFor('MODERATOR')).not.toContain('زمن الاستجابة');
  });

  it('is empty for a role nobody has written bands for, which is itself the answer', () => {
    for (const role of ['ACCOUNTANT', 'WAREHOUSE', 'SETTLEMENT_OFFICER', 'DELIVERY_MANAGER', 'MANAGER', 'SUPER_ADMIN']) {
      expect(madeOfFor(role), role).toEqual([]);
    }
  });

  it('and is still shown for a traceless person whose role COULD be graded', () => {
    // «What it will be made of» is one of the two honest things a screen can
    // say on a day it can grade nobody.
    const g = gradeEmployee(facts({ role: 'CONFIRMATION_AGENT', trace: trace(0, 0, null), scored: null }));
    expect(g.state).toBe('NO_TRACE');
    expect(g.madeOf.length).toBeGreaterThan(0);
  });
});

describe('the order of the rows', () => {
  it('puts the graded first, best first', () => {
    const a = gradeEmployee(facts({ userId: 'a', scored: scored({ total: 40 }) }));
    const b = gradeEmployee(facts({ userId: 'b', scored: scored({ total: 82 }) }));
    expect([a, b].sort(byEmployeeGrade).map((g) => g.userId)).toEqual(['b', 'a']);
  });

  it('and never places «we cannot tell yet» below a measured low scorer', () => {
    const low = gradeEmployee(facts({ userId: 'low', scored: scored({ total: 3 }) }));
    const thin = gradeEmployee(facts({ userId: 'thin', scored: scored({ total: null, sample: 1 }) }));
    // An ungraded person under a measured 3-out-of-90 reads as worse than
    // them, which is a verdict nobody computed.
    expect([thin, low].sort(byEmployeeGrade).map((g) => g.userId)).toEqual(['low', 'thin']);
  });

  it('gathering the empty accounts at the very end, to be dealt with in one pass', () => {
    const none = gradeEmployee(facts({ userId: 'none', trace: trace(0, 0, null), scored: null }));
    const thin = gradeEmployee(facts({ userId: 'thin', scored: scored({ total: null, sample: 1 }) }));
    const noRole = gradeEmployee(facts({ userId: 'role', role: 'ACCOUNTANT', scored: null }));
    expect([none, noRole, thin].sort(byEmployeeGrade).map((g) => g.userId)).toEqual(['thin', 'role', 'none']);
  });
});

describe('the roster strip', () => {
  /** The 2026-09-29 roster, replayed. */
  const roster = [
    gradeEmployee(facts({ userId: 'sara', scored: scored() })),
    ...['sup', 'agent', 'kamel', 'omar', 'mod'].map((id) =>
      gradeEmployee(facts({ userId: id, role: 'CONFIRMATION_AGENT', trace: trace(12, 3, 7), scored: scored({ total: null, sample: 0 }) }))
    ),
    ...['ship', 'store', 'admin', 'acct', 'settle', 'jon', 'owner'].map((id) =>
      gradeEmployee(facts({ userId: id, role: 'ACCOUNTANT', trace: trace(4, 1, 8), scored: null }))
    ),
    ...['plat', 'omar2', 'ffff', 'sales', 'layla', 'kamel2'].map((id) =>
      gradeEmployee(facts({ userId: id, trace: trace(0, 0, null), scored: null }))
    ),
  ];

  it('reproduces the measured roster: 19 people, 1 graded, 6 with no trace', () => {
    const r = rosterReadiness(roster);
    expect(r.total).toBe(19);
    expect(r.graded).toBe(1);
    expect(r.thinSample).toBe(5);
    expect(r.roleNotMeasured).toBe(7);
    expect(r.noTrace).toBe(6);
    expect(r.graded + r.thinSample + r.roleNotMeasured + r.notActive + r.outsideStore + r.noTrace).toBe(r.total);
  });

  it('says it in one sentence carrying the counts', () => {
    const r = rosterReadiness(roster);
    expect(r.why).toContain('من 19 موظفاً');
    expect(r.why).toContain('1 له تقدير');
    expect(r.why).toContain('6 بلا حركةٍ مسجَّلةٍ قطّ');
  });

  it('recites only the categories that are not empty', () => {
    const r = rosterReadiness([roster[0]]);
    expect(r.why).toContain('1 له تقدير');
    expect(r.why).not.toContain('تحت الحدّ');
    expect(r.why).not.toContain('بلا حركة');
  });

  it('and answers an empty list without dividing by it', () => {
    const r = rosterReadiness([]);
    expect(r.total).toBe(0);
    expect(r.why).toContain('لا موظّف');
    expect(r.madeOf).toEqual([]);
  });

  it('lists every band any listed role is graded on, once each', () => {
    const r = rosterReadiness(roster);
    expect(r.madeOf).toContain('نسبة التسليم');
    expect(new Set(r.madeOf).size).toBe(r.madeOf.length);
  });
});

// ─── THE SOURCE GUARDS ───

describe('the rule lives in one place', () => {
  const lib = repoFile('/src/lib/employee-grade.ts');
  const route = repoFile('/src/app/api/users/grades/route.ts');
  const screen = repoFile('/src/components/screens/UsersScreen.tsx');
  const code = (src: string) => stripTemplates(stripComments(src));

  it('and the rule file touches no database and no clock', () => {
    const body = code(lib);
    expect(body.length).toBeGreaterThan(2000);
    for (const forbidden of ['@/lib/db', "'./db'", 'prisma', 'fetch(', 'new Date(', 'Date.now']) {
      expect(body, `employee-grade.ts reaches for ${forbidden}`).not.toContain(forbidden);
    }
  });

  it('and NOTHING in this feature calls a model — «AI» here means derived', () => {
    for (const [name, src] of [['lib', lib], ['route', route], ['screen', screen]] as const) {
      const body = code(src);
      expect(body.length).toBeGreaterThan(500);
      for (const forbidden of ['ai-provider', 'ai-endpoint', 'ai-prompts', 'openai', 'anthropic', 'callModel']) {
        expect(body, `${name} reaches for ${forbidden}`).not.toContain(forbidden);
      }
    }
  });

  it('and the screen computes no grade of its own', () => {
    const body = code(screen);
    expect(body.length).toBeGreaterThan(2000);
    // The number is fetched. A screen that imported the scorer would be the
    // second arithmetic path to one person's quality.
    for (const forbidden of ['scoreOf', 'bandsForRole', 'performance-score', 'gradeEmployee', 'rosterReadiness']) {
      expect(body, `UsersScreen computes ${forbidden} itself`).not.toContain(forbidden);
    }
  });

  it('and the screen prints the reason and the presence, not just the chip', () => {
    const body = code(screen);
    expect(body.length).toBeGreaterThan(2000);
    /**
     * AS TEXT, NOT AS A TOOLTIP.
     *
     * `expect(body).toContain('g.why')` was the first version of this and it
     * was vacuous: `HealthChip` is handed `why: g.why` as its `title`, so
     * deleting the paragraph that PRINTS the sentence left the guard passing
     * and the reason available only to a reader who knows to hover. A verdict
     * whose reason is hidden is a verdict people argue with. So the guard
     * looks for the sentence as a rendered child — `>{…}<` — with whitespace
     * collapsed, because the element may be laid out over several lines.
     */
    const flat = body.replace(/\s+/g, '');
    for (const printed of ['>{g.why}<', '>{g.presence}<', '>{gradeData.readiness.why}<']) {
      expect(flat, `UsersScreen does not RENDER ${printed}`).toContain(printed);
    }
  });

  it('and the route asks manageable-user who may be looked at', () => {
    const body = code(route);
    expect(body.length).toBeGreaterThan(1000);
    expect(body).toContain('manageableUsersWhere');
    // The fault manageable-user.ts exists to end: a hand-written pair that
    // cannot match the unplaced accounts a company admin must be able to see.
    expect(body).not.toMatch(/id:\s*\{\s*in:\s*ids\s*\}\s*,\s*companyId/);
  });

  it('and the route gates the grade on team.monitor, not on users.view alone', () => {
    const body = code(route);
    expect(body).toContain("requirePermission('users.view')");
    expect(body).toContain("requirePermission('team.monitor')");
  });

  it('and the route borrows the scorer rather than carrying its own bands', () => {
    const body = code(route);
    expect(body).toContain('scoreRole');
    expect(body).toContain('peersOf');
    expect(body).toContain('performanceSettings');
    // No second minimum sample, no second list of measurable roles.
    expect(body).not.toMatch(/const\s+MIN_SAMPLE/);
    expect(body).not.toMatch(/BANDS_FOR\s*=/);
  });

  it('and only ACTIVE accounts are ranked, named once', () => {
    expect(GRADABLE_STATUS).toBe('ACTIVE');
    const body = code(lib);
    // One literal 'ACTIVE' — the constant's own definition. A second would be
    // a second answer to which accounts are compared.
    expect(body.match(/'ACTIVE'/g) ?? []).toHaveLength(1);
  });
});
