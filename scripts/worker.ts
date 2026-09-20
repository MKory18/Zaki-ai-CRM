/**
 * The scheduler worker.
 *
 * A real process, run alongside the app and independent of any browser:
 *
 *   npx tsx scripts/worker.ts            run forever
 *   npx tsx scripts/worker.ts --once     run every job once and exit
 *   npx tsx scripts/worker.ts --job=NAME run one job and exit
 *
 * Deliberately node-cron-and-Redis-free. Each job keeps its own next-due
 * time in memory and its own backoff, and the database run log is what
 * survives a restart — so there is no queue to operate, nothing to install,
 * and a crashed worker resumes simply by starting again.
 *
 * A job that fails backs off exponentially rather than hammering a courier
 * that is down, and after three consecutive failures it says so loudly
 * instead of scrolling past.
 */
import { config } from 'dotenv';
config();

import { db } from '../src/lib/db';
import { JOBS, jobByName } from '../src/lib/jobs/definitions';
import {
  ALERT_AFTER_FAILURES,
  JobSkipped,
  backoffSeconds,
  consecutiveFailures,
  runJob,
  type JobDefinition,
} from '../src/lib/jobs/runner';

const args = process.argv.slice(2);
const once = args.includes('--once');
const only = args.find((a) => a.startsWith('--job='))?.slice('--job='.length);

const stamp = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
const log = (msg: string) => console.log(`[${stamp()}] ${msg}`);

async function attempt(job: JobDefinition): Promise<number> {
  try {
    const result = await runJob(job);
    log(`✓ ${job.name} — ${result.detail ?? `${result.processed}`}`);
    return job.everySeconds;
  } catch (error) {
    if (error instanceof JobSkipped) {
      log(`· ${job.name} — يعمل بالفعل، تُخطّي`);
      return job.everySeconds;
    }

    const failures = await consecutiveFailures(job.name);
    const wait = backoffSeconds(failures, job.everySeconds);
    const message = error instanceof Error ? error.message : String(error);

    if (failures >= ALERT_AFTER_FAILURES) {
      log(`✗✗ ${job.name} — فشل ${failures} مرات متتالية: ${message}`);
      log(`   يحتاج تدخّلاً — المحاولة القادمة بعد ${wait}s`);
    } else {
      log(`✗ ${job.name} — ${message} (المحاولة القادمة بعد ${wait}s)`);
    }
    return wait;
  }
}

async function main() {
  const jobs = only ? [jobByName(only)].filter(Boolean as unknown as (j: JobDefinition | undefined) => j is JobDefinition) : JOBS;

  if (only && jobs.length === 0) {
    console.error(`لا توجد مهمة باسم ${only}. المتاح: ${JOBS.map((j) => j.name).join(', ')}`);
    process.exit(1);
  }

  if (once || only) {
    for (const job of jobs) await attempt(job);
    await db.$disconnect();
    return;
  }

  log(`بدأ المجدول — ${jobs.length} مهمة`);
  for (const job of jobs) log(`   ${job.name} كل ${job.everySeconds}s — ${job.description}`);

  const dueAt = new Map<string, number>(jobs.map((j) => [j.name, 0]));
  let stopping = false;

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => {
      if (stopping) process.exit(1); // a second one means business
      stopping = true;
      log('إيقاف بعد انتهاء المهمة الحالية…');
    });
  }

  while (!stopping) {
    const now = Date.now();
    for (const job of jobs) {
      if (stopping) break;
      if ((dueAt.get(job.name) ?? 0) > now) continue;
      const wait = await attempt(job);
      dueAt.set(job.name, Date.now() + wait * 1000);
    }
    await new Promise((r) => setTimeout(r, 1000));
  }

  await db.$disconnect();
  log('توقف المجدول');
}

main().catch(async (error) => {
  console.error('المجدول توقف بخطأ غير متوقَّع:', error);
  await db.$disconnect();
  process.exit(1);
});
