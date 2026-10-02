import { NextResponse } from 'next/server';
import { cachedHeartbeat } from '../cached';

/**
 * GET /api/health/worker — THE SCHEDULER'S HEALTH, AS ITS OWN SIGNAL.
 *
 * The brief asks for uptime monitoring on the app AND the worker. The
 * worker is a separate process with no HTTP server of its own, so it cannot
 * be polled directly; what CAN be polled is the run log it writes. This
 * route turns that log into a status code, so a second uptime check can
 * point at a second URL and alert about a second process.
 *
 * ── WHY A SEPARATE ROUTE RATHER THAN A FIELD OR A QUERY PARAMETER ──
 *
 * `/api/health` reports the scheduler in a field but stays 200 when it is
 * dead, and `route.ts` there says at length why: a 503 on that URL makes
 * container health checks and load balancers act on the WEB app for a fault
 * in a different process, and restarting the website never fixes the
 * worker.
 *
 * But a monitor only ever alerts on a status code. A field nobody can alert
 * on is a field nobody reads, so a dead worker would stay invisible — which
 * is the exact failure this whole stage exists to end.
 *
 * A query parameter (`?check=worker`) was the other option and is worse: a
 * URL whose meaning depends on its query string is a URL somebody
 * eventually configures without it, and then the worker check silently
 * becomes an app check that is always green. Two paths cannot be confused.
 *
 * So: two URLs, two monitors, two alerts, and neither process can take the
 * other down.
 *
 * ── NO SESSION, AND THE SAME LEAK RULES ──
 *
 * Unauthenticated for the same reason — a monitor has no cookie — and under
 * the same discipline: a fixed vocabulary of words, no job names, no
 * timestamps, no counts, no error text. "Which job is late and since when"
 * belongs on /admin/jobs behind a login, and in the Telegram alert; not
 * here, where a stranger could read the rhythm of the business off it.
 *
 * ── COST PER CALL ──
 *
 * Nothing of its own. It shares the cached reading with `/api/health`
 * (see `../cached.ts`): at most one indexed, one-row query per 5-second
 * window across BOTH routes together, so adding this second monitor costs
 * no extra database work at all.
 */

// Never prerender, never cache — a build-time "ok" would answer 200 for
// ever, including while the worker is dead.
export const dynamic = 'force-dynamic';

const HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate',
  'X-Content-Type-Options': 'nosniff',
};

export async function GET() {
  const reading = await cachedHeartbeat();

  /**
   * 503 when the scheduler is stale — here, this IS the subject, so a
   * stale scheduler is a failed check and the monitor should shout.
   *
   * 'unknown' (the run log could not be read) is ALSO 503, deliberately.
   * The temptation is to answer 200 because "we do not know" is not "it is
   * dead". But an endpoint that reports healthy whenever its own check
   * breaks is an endpoint that goes green at exactly the wrong moment: the
   * database being unreadable is not evidence the jobs are running, and
   * fail-closed is the only honest default for a thing whose entire
   * purpose is to be believed.
   */
  const alive = reading.scheduler === 'alive';

  return NextResponse.json(
    {
      status: alive ? 'ok' : 'fail',
      scheduler: reading.scheduler,
    },
    { status: alive ? 200 : 503, headers: HEADERS }
  );
}
