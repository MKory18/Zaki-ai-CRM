import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * IS THE SCHEDULER ALIVE — THE QUESTION THE HEALTH ENDPOINT ASKS.
 *
 * The fault being guarded against is a single sentence: an endpoint that
 * answers 200 while the worker is dead buys false confidence, and false
 * confidence is worse than no monitoring. So every test here is the
 * negative one — the cases where the honest answer is "no" or "I do not
 * know", because those are the answers a lazy implementation gets wrong.
 */

const { db } = vi.hoisted(() => ({
  db: { jobRun: { findFirst: vi.fn() } },
}));
vi.mock('../db', () => ({ db }));

import { HEARTBEAT_JOBS, SCHEDULER_STALE_SECONDS, readHeartbeat } from './heartbeat';

const NOW = new Date('2026-10-02T12:00:00.000Z');
const agoSeconds = (s: number) => new Date(NOW.getTime() - s * 1000);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('reading the heartbeat', () => {
  it('is alive when a heartbeat job ran inside the window', async () => {
    db.jobRun.findFirst.mockResolvedValue({ startedAt: agoSeconds(30) });
    expect(await readHeartbeat(NOW)).toEqual({ db: 'up', scheduler: 'alive' });
  });

  it('is stale the moment the window is exceeded', async () => {
    // Exactly on the boundary is still alive — a threshold that fires at
    // its own value flaps for a job that fires on a clock.
    db.jobRun.findFirst.mockResolvedValue({ startedAt: agoSeconds(SCHEDULER_STALE_SECONDS) });
    expect((await readHeartbeat(NOW)).scheduler).toBe('alive');

    db.jobRun.findFirst.mockResolvedValue({ startedAt: agoSeconds(SCHEDULER_STALE_SECONDS + 1) });
    expect((await readHeartbeat(NOW)).scheduler).toBe('stale');
  });

  it('is stale, not "unknown", when the run log is empty', async () => {
    // A worker that has never started is exactly as not-running as one that
    // crashed. Answering anything softer than "stale" on a fresh install is
    // how a worker nobody ever deployed goes unnoticed for a month.
    db.jobRun.findFirst.mockResolvedValue(null);
    expect(await readHeartbeat(NOW)).toEqual({ db: 'up', scheduler: 'stale' });
  });

  it('never claims "alive" because the question failed', async () => {
    db.jobRun.findFirst.mockRejectedValue(new Error('connection refused'));
    expect(await readHeartbeat(NOW)).toEqual({ db: 'down', scheduler: 'unknown' });
  });

  it('reads a missing table as the app being up and the worker unanswerable', async () => {
    // Code deployed ahead of its migration. The query reached the server, so
    // the database is NOT down — but nothing can be said about the worker,
    // and saying "alive" here would be the false confidence again.
    const e = Object.assign(new Error('relation does not exist'), { code: 'P2021' });
    db.jobRun.findFirst.mockRejectedValue(e);
    expect(await readHeartbeat(NOW)).toEqual({ db: 'up', scheduler: 'unknown' });
  });

  it('does not launder a connection failure into "unknown"', async () => {
    // Only P2021 is the migration window. Every other Prisma error is a
    // real outage and must raise the app's own status, not be softened into
    // a worker-only remark.
    const e = Object.assign(new Error('terminating connection'), { code: 'P1001' });
    db.jobRun.findFirst.mockRejectedValue(e);
    expect((await readHeartbeat(NOW)).db).toBe('down');
  });
});

describe('the query is the cheap one, and nothing else', () => {
  it('asks for one row, by indexed job name, selecting only the timestamp', async () => {
    db.jobRun.findFirst.mockResolvedValue({ startedAt: agoSeconds(1) });
    await readHeartbeat(NOW);

    const arg = db.jobRun.findFirst.mock.calls[0][0];
    // `(jobName, startedAt)` is the index on JobRun. Equality on jobName
    // plus a descending order on startedAt is an index-only scan stopping
    // at the first row — this assertion is what keeps it that way if
    // somebody later "improves" it into a findMany or a count.
    expect(arg.where).toEqual({ jobName: { in: [...HEARTBEAT_JOBS] } });
    expect(arg.orderBy).toEqual({ startedAt: 'desc' });
    // Not the whole row: `detail` and `error` are free text written by
    // jobs, and an unauthenticated endpoint must not pull them into memory
    // at all, never mind risk echoing them.
    expect(arg.select).toEqual({ startedAt: true });
  });

  it('makes exactly one database call — no separate liveness probe', async () => {
    // A `SELECT 1` on top would be a second round trip to learn what this
    // query already proves. It is polled every minute for ever.
    db.jobRun.findFirst.mockResolvedValue(null);
    await readHeartbeat(NOW);
    expect(db.jobRun.findFirst).toHaveBeenCalledTimes(1);
  });
});

describe('the copied job names cannot drift', () => {
  it('is exactly the set of 60-second interval jobs in JOBS', async () => {
    // heartbeat.ts copies three job names instead of importing JOBS, so the
    // health endpoint does not drag the whole business into its import
    // graph. This is the test that makes the copy safe: rename, retime or
    // delete one of those jobs and this fails, instead of the heartbeat
    // quietly watching a job that no longer exists and reporting "stale"
    // for ever.
    const { JOBS } = await import('./definitions');
    const fastest = JOBS.filter((j) => !j.at && j.everySeconds === 60).map((j) => j.name);
    expect([...HEARTBEAT_JOBS].sort()).toEqual(fastest.sort());
  });

  it('watches at least two jobs, so one parked job cannot fake a dead worker', async () => {
    // With a single heartbeat job, parking it (twelve consecutive failures)
    // would make the worker look dead while it was happily running
    // everything else — and the person would restart the wrong process.
    expect(HEARTBEAT_JOBS.length).toBeGreaterThanOrEqual(2);
  });

  it('allows the window at least two missed cycles of the fastest job', async () => {
    // 60 seconds would mean a single slow cycle, a deploy, or one long
    // transaction turns the monitor red. A monitor that flaps gets muted,
    // and a muted monitor is decoration.
    expect(SCHEDULER_STALE_SECONDS).toBeGreaterThanOrEqual(120);
  });
});
