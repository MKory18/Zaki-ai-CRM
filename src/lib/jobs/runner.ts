import type { Prisma } from '@prisma/client';
import { db } from '../db';

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

export type JobStatus = 'RUNNING' | 'SUCCEEDED' | 'FAILED';

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

export interface JobDefinition {
  name: string;
  /** How often it should run, in seconds. Used to judge "overdue". */
  everySeconds: number;
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
export function isOverdue(
  job: { everySeconds: number },
  lastSuccessAt: Date | null,
  now = new Date()
): boolean {
  if (!lastSuccessAt) return true;
  const grace = Math.max(60, job.everySeconds) * 2;
  return (now.getTime() - lastSuccessAt.getTime()) / 1000 > grace;
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
    await db.jobRun.update({
      where: { id: run.id },
      data: {
        status: 'FAILED',
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

export type Tx = Prisma.TransactionClient | typeof db;
