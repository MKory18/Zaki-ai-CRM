import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * THE WATCHDOG — THE JOB WHOSE JOB IS THE OTHER JOBS.
 *
 * Every other job fails loudly: it throws, the runner writes it down, the
 * worker counts and alerts. What was NOT covered is a job that never runs
 * at all — a clock-time job whose hour passed, a job parked after twelve
 * failures that then sat parked for a fortnight, a job renamed in a deploy
 * so the scheduler had nothing to call. In every one the run log is simply
 * empty for that job, and an empty log looks exactly like a quiet day:
 * nothing throws, so nothing alerts, so nobody is told.
 *
 * These tests are the proof that the silence now gets shouted about, and
 * that the watchdog cannot shout about itself.
 */

const { db, alertAboutJob, isParked, consecutiveFailures, overdueBy } = vi.hoisted(() => ({
  db: { jobRun: { findFirst: vi.fn() } },
  alertAboutJob: vi.fn(),
  isParked: vi.fn(),
  consecutiveFailures: vi.fn(),
  overdueBy: vi.fn(),
}));

vi.mock('../db', () => ({ db, default: db }));
vi.mock('./alerts', () => ({ alertAboutJob: (...a: unknown[]) => alertAboutJob(...a) }));
vi.mock('./runner', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  isParked: (...a: unknown[]) => isParked(...a),
  consecutiveFailures: (...a: unknown[]) => consecutiveFailures(...a),
}));
vi.mock('./schedule', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  overdueBy: (...a: unknown[]) => overdueBy(...a),
}));

import { JOBS, watchdog } from './definitions';

const NOW = new Date('2026-10-02T12:00:00.000Z');
const run = () => watchdog.run({ now: NOW, db: db as never });

/** Which job names the watchdog raised an alert about, in order. */
const alerted = () => alertAboutJob.mock.calls.map((c) => (c[0] as { jobName: string }).jobName);

beforeEach(() => {
  vi.clearAllMocks();
  db.jobRun.findFirst.mockResolvedValue({ startedAt: NOW });
  isParked.mockResolvedValue(false);
  consecutiveFailures.mockResolvedValue(0);
  overdueBy.mockReturnValue(0);
  alertAboutJob.mockResolvedValue({ sent: true });
});

describe('the quiet day', () => {
  it('alerts about nothing when every job is on time', async () => {
    const res = await run();
    expect(alertAboutJob).not.toHaveBeenCalled();
    // `processed` counts alerts SENT, so a healthy day shows zero rather
    // than a number that looks like work was done.
    expect(res.processed).toBe(0);
    expect(res.detail).toContain('في مواعيدها');
  });
});

describe('a job that never ran', () => {
  it('raises it as overdue, with how late it is', async () => {
    overdueBy.mockImplementation((schedule: { name?: string }) =>
      (schedule as { name: string }).name === 'closing-reminder' ? 5400 : 0
    );

    const res = await run();
    expect(alertAboutJob).toHaveBeenCalledTimes(1);
    expect(alertAboutJob.mock.calls[0][0]).toEqual({
      jobName: 'closing-reminder',
      kind: 'overdue',
      overdueSeconds: 5400,
    });
    expect(res.processed).toBe(1);
  });

  it('judges lateness with overdueBy, not with a bare interval', async () => {
    // A daily 16:45 job is not late at 09:00. Judging the daily jobs by
    // their interval made every one of them look late every morning —
    // which is how an alert channel gets muted before it has ever been
    // right about anything.
    await run();
    expect(overdueBy).toHaveBeenCalled();
    const [schedule, lastSuccess, now] = overdueBy.mock.calls[0];
    expect(schedule).toHaveProperty('everySeconds');
    expect(now).toBe(NOW);
    expect(lastSuccess).toBeInstanceOf(Date);
  });

  it('asks only for the last SUCCESSFUL run', async () => {
    // A job failing every minute has a very recent run and is still not
    // doing its work. Reading the last run of ANY status would report it
    // as healthy — the exact blind spot this job exists to close.
    await run();
    const arg = db.jobRun.findFirst.mock.calls[0][0];
    expect(arg.where).toMatchObject({ status: 'SUCCEEDED' });
    expect(arg.orderBy).toEqual({ startedAt: 'desc' });
    expect(arg.select).toEqual({ startedAt: true });
  });

  it('treats no successful run at all as no run, rather than skipping it', async () => {
    db.jobRun.findFirst.mockResolvedValue(null);
    await run();
    expect(overdueBy.mock.calls[0][1]).toBeNull();
  });
});

describe('a parked job', () => {
  it('is reported as parked, not as merely overdue', async () => {
    // Different message because it needs a different action: a parked job
    // will not retry itself, and a reader told only "overdue" waits for a
    // retry that is never coming.
    isParked.mockImplementation(async (name: string) => name === 'daily-backup');
    consecutiveFailures.mockResolvedValue(12);

    await run();
    expect(alertAboutJob).toHaveBeenCalledTimes(1);
    expect(alertAboutJob.mock.calls[0][0]).toEqual({
      jobName: 'daily-backup',
      kind: 'parked',
      failures: 12,
    });
  });

  it('does not also read its schedule — the parked message is the whole answer', async () => {
    isParked.mockResolvedValue(true);
    await run();
    expect(overdueBy).not.toHaveBeenCalled();
    expect(db.jobRun.findFirst).not.toHaveBeenCalled();
  });
});

describe('it cannot shout about itself', () => {
  it('never alerts about the watchdog', async () => {
    // It is running, so it is never the silent one — and a watchdog that
    // can alert about itself is a loop.
    overdueBy.mockReturnValue(9999);
    isParked.mockResolvedValue(false);
    await run();
    expect(alerted()).not.toContain('watchdog');
    expect(alerted().length).toBe(JOBS.length - 1);
  });

  it('is in JOBS, or it never runs at all', async () => {
    expect(JOBS.map((j) => j.name)).toContain('watchdog');
  });

  it('is not one of the jobs it would call late, by its own interval', async () => {
    // It runs every five minutes. A watchdog on a daily clock would find
    // out about a wedged job up to a day later.
    expect(watchdog.at).toBeUndefined();
    expect(watchdog.everySeconds).toBeLessThanOrEqual(300);
  });
});

describe('when the alert cannot be sent', () => {
  it('says the chat id is missing instead of reporting a quiet day', async () => {
    // THE FAILURE THIS PREVENTS: the whole mechanism silently doing
    // nothing because the owner never set a chat id, with the jobs screen
    // cheerfully showing "all jobs on time".
    overdueBy.mockReturnValue(600);
    alertAboutJob.mockResolvedValue({ sent: false, reason: 'NOT_CONFIGURED' });

    const res = await run();
    expect(res.processed).toBe(0);
    expect(res.detail).toContain('TELEGRAM_ALERT_CHAT_ID');
  });

  it('counts only alerts that were actually sent', async () => {
    overdueBy.mockReturnValue(600);
    alertAboutJob.mockResolvedValue({ sent: false, reason: 'DUPLICATE' });
    const res = await run();
    expect(res.processed).toBe(0);
  });

  it('keeps checking the remaining jobs after one alert fails', async () => {
    // A single Telegram timeout must not hide every other late job.
    overdueBy.mockReturnValue(600);
    alertAboutJob.mockResolvedValueOnce({ sent: false, reason: 'SEND_FAILED' });
    await run();
    expect(alertAboutJob).toHaveBeenCalledTimes(JOBS.length - 1);
  });
});
