import { zonedParts } from '../business-calendar';

/**
 * WHEN A JOB IS ACTUALLY DUE.
 *
 * The worker kept each job's next-due time in memory, starting at zero. Two
 * things followed from that, and both are the kind of fault that hides:
 *
 *   EVERY DEPLOY RE-RAN EVERY JOB. Restart at 20:00 and the daily closing
 *   reminder fires at 20:00, the commission accrual fires again, the
 *   deduction proposer fires again. The idempotent ones survived it; the
 *   ones that send a message to a person sent it twice, and a reminder that
 *   arrives twice teaches people to ignore reminders.
 *
 *   "DAILY" MEANT "EVERY 86400 SECONDS FROM WHENEVER THE WORKER LAST
 *   STARTED". A reminder meant for 16:45, so somebody counts the drawer
 *   before they go home, drifted to whatever hour the server was last
 *   restarted at — and then stayed there.
 *
 * So a job may name a CLOCK TIME, and whether it is due is answered from
 * the run log in the database rather than from a variable that a restart
 * resets. The schedule survives the process, which is the whole point of
 * having written the runs down.
 */

export interface Schedule {
  /** Every N seconds — for work that should simply keep happening. */
  everySeconds: number;
  /**
   * A clock time, "HH:mm", for work that belongs to a moment of the day: a
   * closing reminder before people leave, an accrual after the day ends.
   */
  at?: string;
  /**
   * The timezone that clock time is read in. Defaults to the scheduler's
   * own, which a single-country business will have set to its own.
   *
   * A business spanning genuinely distant timezones needs each country's
   * daily jobs fired in that country's local evening, which is a per-country
   * scheduler and a larger change than this. Named here rather than faked:
   * a job that claims a local hour it does not honour is worse than one
   * that plainly runs at a fixed hour.
   */
  timezone?: string;
}

export const DEFAULT_TIMEZONE = process.env.SCHEDULER_TZ || 'Asia/Damascus';

/** Minutes past local midnight, in the given zone. */
function localMinutes(at: Date, timezone: string): number {
  const p = zonedParts(at, timezone);
  return p.hour * 60 + p.minute;
}

/** yyyy-MM-dd in the given zone — the local DAY, which is what "daily" means. */
function localDay(at: Date, timezone: string): string {
  const p = zonedParts(at, timezone);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

function parseAt(at: string): number | null {
  const m = at.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

/**
 * Is this job due right now?
 *
 * For an interval job: has `everySeconds` passed since it last STARTED? Last
 * started, not last succeeded — a job that fails every time must still back
 * off rather than spin, and the backoff is the caller's business.
 *
 * For a clock-time job: is it past the hour in the local day, and has it not
 * already run in that local day? Both halves matter. Without the first it
 * fires at midnight; without the second every restart fires it again.
 */
export function isDue(
  schedule: Schedule,
  lastRunAt: Date | null,
  now: Date = new Date()
): boolean {
  if (!schedule.at) {
    if (!lastRunAt) return true;
    return (now.getTime() - lastRunAt.getTime()) / 1000 >= schedule.everySeconds;
  }

  const timezone = schedule.timezone ?? DEFAULT_TIMEZONE;
  const target = parseAt(schedule.at);
  // A clock time nobody can read falls back to the interval rather than
  // never running: a typo in a schedule must not silently stop the work.
  if (target === null) {
    if (!lastRunAt) return true;
    return (now.getTime() - lastRunAt.getTime()) / 1000 >= schedule.everySeconds;
  }

  if (localMinutes(now, timezone) < target) return false;
  if (!lastRunAt) return true;

  // Already run today? Then not again today, however many times the worker
  // restarts between now and midnight.
  if (localDay(lastRunAt, timezone) === localDay(now, timezone)) {
    // Unless it ran BEFORE today's target — a manual run at 09:00 must not
    // cancel the 16:45 one.
    return localMinutes(lastRunAt, timezone) < target;
  }
  return true;
}

/**
 * How long a job is OVERDUE by, in seconds — zero when it is not.
 *
 * The jobs screen turns red on this. A clock-time job is late only after
 * its hour has passed and it has not run, which is a different question
 * from "has an interval elapsed", and answering it with the interval made
 * the daily jobs look red every morning before they were due.
 */
export function overdueBy(
  schedule: Schedule,
  lastSuccessAt: Date | null,
  now: Date = new Date()
): number {
  if (!schedule.at) {
    if (!lastSuccessAt) return Math.max(60, schedule.everySeconds) * 2;
    const elapsed = (now.getTime() - lastSuccessAt.getTime()) / 1000;
    const grace = Math.max(60, schedule.everySeconds) * 2;
    return elapsed > grace ? Math.round(elapsed - grace) : 0;
  }

  const timezone = schedule.timezone ?? DEFAULT_TIMEZONE;
  const target = parseAt(schedule.at);
  if (target === null) return 0;

  const minutesNow = localMinutes(now, timezone);
  if (minutesNow < target) return 0;
  if (!lastSuccessAt) return (minutesNow - target) * 60;

  const ranToday =
    localDay(lastSuccessAt, timezone) === localDay(now, timezone) &&
    localMinutes(lastSuccessAt, timezone) >= target;
  return ranToday ? 0 : (minutesNow - target) * 60;
}

/** The schedule in a seller's words, for the jobs screen. */
export function scheduleAr(schedule: Schedule): string {
  if (schedule.at) return `يومياً ${schedule.at}`;
  const s = schedule.everySeconds;
  if (s % 86_400 === 0) return `كل ${s / 86_400} يوم`;
  if (s % 3600 === 0) return `كل ${s / 3600} ساعة`;
  if (s % 60 === 0) return `كل ${s / 60} دقيقة`;
  return `كل ${s} ثانية`;
}
