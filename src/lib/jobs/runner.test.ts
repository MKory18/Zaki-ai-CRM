import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The scheduler's runner.
 *
 * A scheduler that gets these wrong is worse than not having one: a job that
 * runs twice double-processes, and a job that silently stops firing looks
 * exactly like a job with nothing to do.
 */

const { db } = vi.hoisted(() => ({
  db: { jobRun: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() } },
}));
vi.mock('../db', () => ({ db }));

import {
  ALERT_AFTER_FAILURES,
  PARK_AFTER_FAILURES,
  isParked,
  unpark,
  JobSkipped,
  backoffSeconds,
  consecutiveFailures,
  isOverdue,
  runJob,
  STALE_RUN_MINUTES,
  type JobDefinition,
} from './runner';

const NOW = new Date('2026-09-20T12:00:00.000Z');

const job = (run: JobDefinition['run']): JobDefinition => ({
  name: 'test-job',
  everySeconds: 300,
  description: 'اختبار',
  run,
});

beforeEach(() => {
  vi.clearAllMocks();
  db.jobRun.findFirst.mockResolvedValue(null);
  // The failure path reads the recent runs to decide whether this one is
  // the straw that parks the job.
  db.jobRun.findMany.mockResolvedValue([]);
  db.jobRun.create.mockImplementation(async ({ data }: any) => ({ id: 'run1', ...data }));
  db.jobRun.update.mockResolvedValue({});
});

describe('running a job', () => {
  it('records what it processed on success', async () => {
    const result = await runJob(job(async () => ({ processed: 3, detail: 'ثلاثة' })), { now: NOW });

    expect(result).toMatchObject({ processed: 3, runId: 'run1' });
    expect(db.jobRun.update.mock.calls[0][0].data).toMatchObject({
      status: 'SUCCEEDED', processed: 3, detail: 'ثلاثة',
    });
  });

  it('records a quiet run as a success, not as nothing', async () => {
    await runJob(job(async () => ({ processed: 0 })), { now: NOW });
    expect(db.jobRun.update.mock.calls[0][0].data).toMatchObject({ status: 'SUCCEEDED', processed: 0 });
  });

  it('writes the failure down AND re-throws, so a green board cannot hide it', async () => {
    const boom = job(async () => {
      throw new Error('الشركة لا تستجيب');
    });

    await expect(runJob(boom, { now: NOW })).rejects.toThrow('الشركة لا تستجيب');
    expect(db.jobRun.update.mock.calls[0][0].data).toMatchObject({ status: 'FAILED' });
    expect(db.jobRun.update.mock.calls[0][0].data.error).toContain('لا تستجيب');
  });
});

describe('not running twice at once', () => {
  it('skips a job another run is holding', async () => {
    db.jobRun.findFirst.mockResolvedValue({
      id: 'held', status: 'RUNNING', startedAt: new Date(NOW.getTime() - 60_000),
    });

    await expect(runJob(job(async () => ({ processed: 1 })), { now: NOW })).rejects.toThrow(JobSkipped);
    expect(db.jobRun.create).not.toHaveBeenCalled();
  });

  it('takes over a run whose process plainly died', async () => {
    db.jobRun.findFirst.mockResolvedValue({
      id: 'abandoned',
      status: 'RUNNING',
      startedAt: new Date(NOW.getTime() - (STALE_RUN_MINUTES + 5) * 60_000),
    });

    const result = await runJob(job(async () => ({ processed: 2 })), { now: NOW });

    // The abandoned row is closed as failed rather than left RUNNING forever.
    expect(db.jobRun.update.mock.calls[0][0]).toMatchObject({ where: { id: 'abandoned' } });
    expect(db.jobRun.update.mock.calls[0][0].data.status).toBe('FAILED');
    expect(result.processed).toBe(2);
  });

  it('runs anyway when forced', async () => {
    db.jobRun.findFirst.mockResolvedValue({ id: 'held', status: 'RUNNING', startedAt: NOW });
    const result = await runJob(job(async () => ({ processed: 1 })), { now: NOW, force: true });
    expect(result.processed).toBe(1);
  });
});

describe('knowing a job stopped firing', () => {
  it('is overdue when it has never succeeded', () => {
    expect(isOverdue({ everySeconds: 300 }, null, NOW)).toBe(true);
  });

  it('is not overdue just because the interval passed', () => {
    const justOver = new Date(NOW.getTime() - 310 * 1000);
    expect(isOverdue({ everySeconds: 300 }, justOver, NOW)).toBe(false);
  });

  it('is overdue once it has missed its window with room to spare', () => {
    const wayBack = new Date(NOW.getTime() - 20 * 60 * 1000);
    expect(isOverdue({ everySeconds: 300 }, wayBack, NOW)).toBe(true);
  });

  it('gives a fast job a floor, so a 2-minute job is not called late at 2 minutes', () => {
    const recent = new Date(NOW.getTime() - 100 * 1000);
    expect(isOverdue({ everySeconds: 2 }, recent, NOW)).toBe(false);
  });
});

describe('counting failures', () => {
  it('counts back to the last success and stops', async () => {
    db.jobRun.findMany.mockResolvedValue([
      { status: 'FAILED' }, { status: 'FAILED' }, { status: 'SUCCEEDED' }, { status: 'FAILED' },
    ]);
    expect(await consecutiveFailures('test-job')).toBe(2);
  });

  it('is zero when the last run succeeded', async () => {
    db.jobRun.findMany.mockResolvedValue([{ status: 'SUCCEEDED' }, { status: 'FAILED' }]);
    expect(await consecutiveFailures('test-job')).toBe(0);
  });
});

describe('backoff', () => {
  it('grows with each failure and stops at an hour', () => {
    expect(backoffSeconds(0, 120)).toBe(120);
    expect(backoffSeconds(1, 120)).toBe(240);
    expect(backoffSeconds(3, 120)).toBe(960);
    expect(backoffSeconds(99, 120)).toBe(3600);
  });

  it('alerts after three in a row, not on the first blip', () => {
    expect(ALERT_AFTER_FAILURES).toBe(3);
  });
});


/**
 * THE DEAD LETTER.
 *
 * A job failing every minute for three days writes four thousand identical
 * failures, buries every other job's history under them, and hammers a
 * provider that is plainly not coming back. Stopping is not abandoning the
 * work: the record stays, the screen says so, and a person restarts it when
 * they have fixed whatever it was.
 */
describe('giving up', () => {
  const failing = job(async () => {
    throw new Error('الشركة لا تستجيب');
  });

  const failures = (n: number) =>
    db.jobRun.findMany.mockResolvedValue(Array.from({ length: n }, () => ({ status: 'FAILED' })));

  it('an ordinary failure is FAILED and will be tried again', async () => {
    failures(1);
    await expect(runJob(failing, { now: NOW })).rejects.toThrow();
    expect(db.jobRun.update.mock.calls[0][0].data.status).toBe('FAILED');
  });

  it('the straw that breaks it is written as GAVE_UP', async () => {
    failures(PARK_AFTER_FAILURES - 1);
    await expect(runJob(failing, { now: NOW })).rejects.toThrow();
    expect(db.jobRun.update.mock.calls[0][0].data.status).toBe('GAVE_UP');
  });

  it('and the error is still written down — parking is not forgetting', async () => {
    failures(PARK_AFTER_FAILURES - 1);
    await expect(runJob(failing, { now: NOW })).rejects.toThrow();
    expect(db.jobRun.update.mock.calls[0][0].data.error).toContain('لا تستجيب');
  });

  it('it parks well after the alert, so somebody has time to act first', () => {
    expect(PARK_AFTER_FAILURES).toBeGreaterThan(ALERT_AFTER_FAILURES);
  });
});

describe('a parked job', () => {
  it('is parked while its last run says it gave up', async () => {
    db.jobRun.findFirst.mockResolvedValue({ status: 'GAVE_UP' });
    expect(await isParked('test-job')).toBe(true);
  });

  it('and is not parked once something newer succeeded', async () => {
    db.jobRun.findFirst.mockResolvedValue({ status: 'SUCCEEDED' });
    expect(await isParked('test-job')).toBe(false);
  });

  it('starting it again WRITES a row rather than editing one', async () => {
    // The parking happened. A record that can be erased is a record nobody
    // can rely on.
    await unpark('test-job', 'boss');
    expect(db.jobRun.update).not.toHaveBeenCalled();
    expect(db.jobRun.create.mock.calls[0][0].data).toMatchObject({
      jobName: 'test-job',
      status: 'SUCCEEDED',
      processed: 0,
    });
    expect(db.jobRun.create.mock.calls[0][0].data.detail).toContain('boss');
  });
});
