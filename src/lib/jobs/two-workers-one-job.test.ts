import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * TWO WORKERS, ONE JOB — AND THE JOB THAT RAN TWICE WROTE MONEY.
 *
 * The claim in `runner.ts` was read-then-create: look for a RUNNING row,
 * then create one. Two workers a millisecond apart both see no RUNNING row
 * and both create one, and the job runs twice. Nothing in `job_runs`
 * refused the second insert — two plain indexes and no unique one.
 *
 * It never mattered while ONE container ran the worker. It starts
 * mattering the moment two do, and that is exactly what the rolling update
 * introduces: `docker-entrypoint.sh` starts a worker in every container
 * unless `RUN_WORKER=false`, and during the overlap the new container is
 * up before the old one stops — two schedulers, one database.
 *
 * And the jobs where twice is not harmless are the ones that matter:
 *
 *   accrue-commission · accrue-period-commission · propose-penalties
 *       write money
 *   deliver-conversions
 *       reports a conversion to Meta and TikTok
 *   deliver-app-events
 *       delivers a signed webhook to the replies system
 *
 * Twice is a double accrual and a double-counted conversion.
 *
 * The claim is the DATABASE's now — a partial unique index, UNIQUE
 * (jobName) WHERE status = 'RUNNING' — and the loser of the race is told
 * in the same word it was told before: `JobSkipped`.
 * ═══════════════════════════════════════════════════════════════════════
 */

const { db } = vi.hoisted(() => ({
  db: {
    jobRun: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  },
}));
vi.mock('../db', () => ({ db }));

import { JobSkipped, runJob, STALE_RUN_MINUTES } from './runner';

const NOW = new Date('2026-10-15T12:00:00.000Z');

/** A job that records every time it actually ran. */
function countingJob(ran: string[]) {
  return {
    name: 'accrue-commission',
    everySeconds: 60,
    description: 'يحسب العمولة',
    run: async () => {
      ran.push('run');
      return { processed: 1, detail: 'ok' };
    },
  } as never;
}

/** What Prisma throws when a unique index refuses an insert. */
const uniqueViolation = () => Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });

beforeEach(() => {
  vi.clearAllMocks();
  db.jobRun.findFirst.mockResolvedValue(null);
  db.jobRun.create.mockResolvedValue({ id: 'r1' });
  db.jobRun.update.mockResolvedValue({});
});

describe('when two workers reach the same job together', () => {
  it('the second one is refused by the database, and the job does not run twice', async () => {
    const ran: string[] = [];
    // Both saw no RUNNING row — that is the race, and it is why reading
    // first cannot be the claim.
    db.jobRun.create.mockRejectedValueOnce(uniqueViolation());

    await expect(runJob(countingJob(ran), { now: NOW })).rejects.toBeInstanceOf(JobSkipped);
    expect(ran, 'الوظيفة اشتغلت مرّتين').toHaveLength(0);
  });

  it('and the refusal is the same word a skipped job always had', async () => {
    // The jobs screen and the worker loop both read `JobSkipped` already;
    // a new error type here would be a second thing for them to learn.
    db.jobRun.create.mockRejectedValueOnce(uniqueViolation());
    await expect(runJob(countingJob([]), { now: NOW })).rejects.toThrow(/accrue-commission/);
  });

  it('and the winner runs exactly once', async () => {
    const ran: string[] = [];
    await runJob(countingJob(ran), { now: NOW });
    expect(ran).toHaveLength(1);
  });
});

describe('and a failure that is not the race is still a failure', () => {
  it('any other database error is raised, not swallowed as «somebody else has it»', async () => {
    // Reporting a dead database as «skipped» would make the jobs screen
    // say the scheduler is busy while nothing runs at all.
    const ran: string[] = [];
    db.jobRun.create.mockRejectedValueOnce(Object.assign(new Error('connection refused'), { code: 'P1001' }));

    await expect(runJob(countingJob(ran), { now: NOW })).rejects.toThrow('connection refused');
    expect(ran).toHaveLength(0);
  });
});

describe('and an abandoned run is still taken over', () => {
  it('a RUNNING row older than the stale window does not block for ever', async () => {
    /*
     * The other half of the rule, unchanged: a container killed mid-run
     * leaves a RUNNING row behind, and without this the job would never
     * run again. The runner marks it FAILED and claims the job.
     */
    const ran: string[] = [];
    db.jobRun.findFirst.mockResolvedValue({
      id: 'old',
      startedAt: new Date(NOW.getTime() - (STALE_RUN_MINUTES + 1) * 60_000),
    });

    await runJob(countingJob(ran), { now: NOW });

    expect(db.jobRun.update.mock.calls[0][0].data.status, 'الصفّ المتروك ما انغلق').toBe('FAILED');
    expect(ran).toHaveLength(1);
  });

  it('and a run that is merely slow is not stolen', async () => {
    const ran: string[] = [];
    db.jobRun.findFirst.mockResolvedValue({
      id: 'live',
      startedAt: new Date(NOW.getTime() - 60_000),
    });

    await expect(runJob(countingJob(ran), { now: NOW })).rejects.toBeInstanceOf(JobSkipped);
    expect(ran).toHaveLength(0);
  });
});
