import type { Prisma } from '@prisma/client';
import { db } from '../db';
import { overdueBy, type Schedule } from './schedule';

/**
 * Running a scheduled job, once.
 *
 * Three things this has to get right, because a scheduler that gets them
 * wrong is worse than none at all:
 *
 *  - It must not run twice at once. Two workers, or a worker and a manual
 *    trigger, would double-process. A job already RUNNING is skipped, unless
 *    its row is old enough that the process holding it is plainly gone.
 *
 *  - Every attempt is recorded, successful or not. A job that silently stops
 *    firing looks exactly like a job with nothing to do; only the run log
 *    tells them apart.
 *
 *  - A failure is a failure. It is written down and re-thrown to the caller
 *    so the worker can back off, rather than being swallowed into a green
 *    dashboard.
 */

export type JobStatus = 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'GAVE_UP';

export interface JobResult {
  /** How many things were acted on. Zero is a perfectly good run. */
  processed: number;
  /** One line a human can read on the jobs screen. */
  detail?: string;
}

export interface JobContext {
  now: Date;
  db: typeof db;
}

export interface JobDefinition extends Schedule {
  name: string;
  /** What it does, in Arabic, for the jobs screen. */
  description: string;
  run: (ctx: JobContext) => Promise<JobResult>;
}

/**
 * A RUNNING row older than this is treated as abandoned — the process that
 * claimed it died without finishing. Long enough that a slow-but-alive job
 * is never stolen from.
 */
export const STALE_RUN_MINUTES = 30;

export class JobSkipped extends Error {
  constructor(readonly jobName: string) {
    super(`${jobName} يعمل بالفعل`);
  }
}

/** The most recent run of a job, whatever its outcome. */
export async function lastRun(jobName: string) {
  return db.jobRun.findFirst({ where: { jobName }, orderBy: { startedAt: 'desc' } });
}

/** How many times in a row it has failed since its last success. */
export async function consecutiveFailures(jobName: string): Promise<number> {
  const recent = await db.jobRun.findMany({
    where: { jobName, status: { in: ['SUCCEEDED', 'FAILED'] } },
    orderBy: { startedAt: 'desc' },
    take: 20,
    select: { status: true },
  });

  let count = 0;
  for (const run of recent) {
    if (run.status !== 'FAILED') break;
    count++;
  }
  return count;
}

/**
 * True when the job has not succeeded within its own interval — allowing a
 * grace period, because a job firing every 2 minutes is not "late" the
 * second it passes 2 minutes.
 */
export function isOverdue(job: Schedule, lastSuccessAt: Date | null, now = new Date()): boolean {
  // Answered by the schedule, which knows the difference between "an
  // interval elapsed" and "its hour passed and it did not run". Judging a
  // daily job by its interval made it look red every morning before it was
  // due, and a screen that is red when nothing is wrong is a screen nobody
  // reads when something is.
  return overdueBy(job, lastSuccessAt, now) > 0;
}

/**
 * Claims the job, runs it, and records the outcome either way.
 *
 * Throws JobSkipped when another run holds it, and re-throws whatever the
 * job threw after writing the failure down.
 */
export async function runJob(
  job: JobDefinition,
  opts: { now?: Date; force?: boolean } = {}
): Promise<JobResult & { runId: string }> {
  const now = opts.now ?? new Date();

  // Claim it. A RUNNING row that is merely old is not a live run.
  const held = await db.jobRun.findFirst({
    where: { jobName: job.name, status: 'RUNNING' },
    orderBy: { startedAt: 'desc' },
  });
  if (held && !opts.force) {
    const ageMinutes = (now.getTime() - held.startedAt.getTime()) / 60_000;
    if (ageMinutes < STALE_RUN_MINUTES) throw new JobSkipped(job.name);

    await db.jobRun.update({
      where: { id: held.id },
      data: {
        status: 'FAILED',
        finishedAt: now,
        error: `تُرك دون إنهاء لأكثر من ${STALE_RUN_MINUTES} دقيقة — يُفترض أن العملية توقفت`,
      },
    });
  }

  const run = await db.jobRun.create({
    data: { jobName: job.name, status: 'RUNNING', startedAt: now },
  });

  try {
    const result = await job.run({ now, db });
    await db.jobRun.update({
      where: { id: run.id },
      data: {
        status: 'SUCCEEDED',
        finishedAt: new Date(),
        processed: result.processed,
        detail: result.detail ?? null,
      },
    });
    return { ...result, runId: run.id };
  } catch (error) {
    // Counted BEFORE this run is written down, then compared inclusive of
    // it: the twelfth consecutive failure is the one that parks it.
    const before = await consecutiveFailures(job.name);
    const parking = before + 1 >= PARK_AFTER_FAILURES;

    await db.jobRun.update({
      where: { id: run.id },
      data: {
        status: parking ? 'GAVE_UP' : 'FAILED',
        finishedAt: new Date(),
        error: (error instanceof Error ? error.message : String(error)).slice(0, 1000),
      },
    });
    throw error;
  }
}

/** Exponential backoff for a worker that keeps hitting the same failure. */
export function backoffSeconds(failures: number, baseSeconds: number): number {
  if (failures <= 0) return baseSeconds;
  return Math.min(baseSeconds * 2 ** Math.min(failures, 6), 3600);
}

/** After this many consecutive failures the job is shouted about, not logged. */
export const ALERT_AFTER_FAILURES = 3;

/**
 * After this many, it stops trying.
 *
 * The dead letter, and the reason it exists: a job failing every minute for
 * three days writes four thousand identical failures, buries every other
 * job's history under them, and hammers a provider that is plainly not
 * coming back. Stopping is not giving up on the work — the record stays,
 * the screen says so in red, and a person presses "try again" when they
 * have fixed whatever it was.
 *
 * Deliberately well above ALERT_AFTER_FAILURES: the alert comes first and
 * has plenty of time to be acted on before anything is parked.
 */
export const PARK_AFTER_FAILURES = 12;

/**
 * Has this job been parked — and not been asked to try again since?
 *
 * Asked of the log rather than a flag, so it survives a restart the same
 * way the schedule does.
 */
export async function isParked(jobName: string): Promise<boolean> {
  const last = await db.jobRun.findFirst({
    where: { jobName, status: { in: ['SUCCEEDED', 'FAILED', 'GAVE_UP'] } },
    orderBy: { startedAt: 'desc' },
    select: { status: true },
  });
  return last?.status === 'GAVE_UP';
}

/**
 * Let a parked job run again.
 *
 * It writes a row rather than editing one: the parking happened, and a
 * record that can be erased is a record nobody can rely on. The new row is
 * SUCCEEDED with nothing processed — an honest "a person cleared this at
 * this time", and it is what `isParked` then reads.
 */
export async function unpark(jobName: string, byUserId: string): Promise<void> {
  await db.jobRun.create({
    data: {
      jobName,
      status: 'SUCCEEDED',
      startedAt: new Date(),
      finishedAt: new Date(),
      processed: 0,
      detail: `أُعيد تفعيلها يدوياً (${byUserId})`,
    },
  });
}

export type Tx = Prisma.TransactionClient | typeof db;
