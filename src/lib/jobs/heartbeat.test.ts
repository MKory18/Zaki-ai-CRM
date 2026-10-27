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

import { DB_PING_TIMEOUT_MS, HEARTBEAT_JOBS, SCHEDULER_STALE_SECONDS, readHeartbeat } from './heartbeat';

const NOW = new Date('2026-10-02T12:00:00.000Z');
const agoSeconds = (s: number) => new Date(NOW.getTime() - s * 1000);

beforeEach(() => {
  vi.clearAllMocks();
  // There are several reads per reading now: an answer queued for one test and not
  // consumed must not become the next test's first answer.
  db.jobRun.findFirst.mockReset();
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
  it('asks for one row PER JOB, by one exact job name, selecting only the timestamp', async () => {
    db.jobRun.findFirst.mockResolvedValue({ startedAt: agoSeconds(1) });
    await readHeartbeat(NOW);

    // `(jobName, startedAt)` is the index on JobRun. ONE exact name plus a
    // descending order on startedAt is a backward index-only scan stopping
    // at the first row. A LIST of names is not: the index orders by name
    // first, so Postgres reads every run of every listed job and sorts them
    // (EXPLAIN on Postgres 16, 27/10). That list is what this endpoint asked
    // for until a deploy made the read cross its 2 s cap and the app said
    // «db: down» with a working database. So: exact names, never `in`.
    const asked = db.jobRun.findFirst.mock.calls.map((c) => c[0]);
    expect(asked.map((a) => a.where)).toEqual(HEARTBEAT_JOBS.map((jobName) => ({ jobName })));
    for (const arg of asked) {
      expect(typeof arg.where.jobName, 'قائمة أسماء بدل اسم واحد — بترجع تقرأ السجل كله').toBe('string');
      expect(arg.orderBy).toEqual({ startedAt: 'desc' });
      // Not the whole row: `detail` and `error` are free text written by
      // jobs, and an unauthenticated endpoint must not pull them into memory
      // at all, never mind risk echoing them.
      expect(arg.select).toEqual({ startedAt: true });
    }
  });

  it('makes one call per watched job and nothing else — no separate liveness probe', async () => {
    // A `SELECT 1` on top would be another round trip to learn what these
    // reads already prove. It is polled every minute for ever.
    db.jobRun.findFirst.mockResolvedValue(null);
    await readHeartbeat(NOW);
    expect(db.jobRun.findFirst).toHaveBeenCalledTimes(HEARTBEAT_JOBS.length);
  });

  it('the newest of the watched jobs decides, whichever job it is', async () => {
    // One job parked for an hour must not make a running worker read as stale,
    // and the order the answers come back in must not matter.
    for (let fresh = 0; fresh < HEARTBEAT_JOBS.length; fresh++) {
      db.jobRun.findFirst.mockReset();
      HEARTBEAT_JOBS.forEach((_, i) =>
        db.jobRun.findFirst.mockResolvedValueOnce(i === fresh ? { startedAt: agoSeconds(20) } : i === 0 ? null : { startedAt: agoSeconds(3600) })
      );
      expect(await readHeartbeat(NOW), `الحديث رقم ${fresh}`).toEqual({ db: 'up', scheduler: 'alive' });
    }
  });

  it('and the newest is still judged by the window — three old runs are stale', async () => {
    db.jobRun.findFirst
      .mockResolvedValueOnce({ startedAt: agoSeconds(SCHEDULER_STALE_SECONDS + 1) })
      .mockResolvedValueOnce({ startedAt: agoSeconds(SCHEDULER_STALE_SECONDS + 60) })
      .mockResolvedValueOnce(null);
    expect(await readHeartbeat(NOW)).toEqual({ db: 'up', scheduler: 'stale' });
  });

  it('one failed read is a failed reading — never «alive» from the other two', async () => {
    db.jobRun.findFirst
      .mockResolvedValueOnce({ startedAt: agoSeconds(1) })
      .mockRejectedValueOnce(new Error('connection refused'))
      .mockResolvedValueOnce({ startedAt: agoSeconds(1) });
    expect(await readHeartbeat(NOW)).toEqual({ db: 'down', scheduler: 'unknown' });
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

describe('a database that never answers', () => {
  /*
   * The case the rest of this file does not cover. Every test above has the
   * query RESOLVE or REJECT — and a rejection was always easy, because the
   * old code already read it as `db: 'down'`. What was missing is the state
   * in between: the connection is accepted and the answer never comes,
   * because the pool is exhausted, a lock is held, or the server is
   * swapping. Then the route hung, and a probe reading a hung route learns
   * nothing at all. Docker's own `--timeout` eventually kills its `wget`
   * and the container does come out right, three intervals late; an uptime
   * monitor records a slow 200 and pages nobody.
   */
  it('is reported as down once the cap passes, not waited for', async () => {
    vi.useFakeTimers();
    try {
      // Accepted, never answered.
      db.jobRun.findFirst.mockReturnValue(new Promise(() => {}));

      const reading = readHeartbeat(NOW);
      await vi.advanceTimersByTimeAsync(DB_PING_TIMEOUT_MS);

      expect(await reading, 'القاعدة ما ردّت والجواب ضلّ معلّقاً').toEqual({
        db: 'down',
        scheduler: 'unknown',
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('and the cap is short enough to be read as an outage, not as slowness', async () => {
    // The real query is one index seek — tenths of a millisecond. A cap in
    // the tens of seconds would be longer than the probe's own timeout, so
    // the word would arrive after the thing that needed it had given up.
    expect(DB_PING_TIMEOUT_MS).toBeLessThanOrEqual(5_000);
  });

  it('leaves no timer behind when the answer comes in time', async () => {
    // The timer is armed on EVERY call — once a minute per monitor, for
    // ever. Forgetting to clear it holds the event loop open, so the
    // process stops exiting when it is asked to and a test run hangs after
    // its last assertion passes.
    vi.useFakeTimers();
    try {
      db.jobRun.findFirst.mockResolvedValue({ startedAt: agoSeconds(1) });
      await readHeartbeat(NOW);
      expect(vi.getTimerCount(), 'مؤقّت ضلّ شغّالاً بعد الجواب').toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
