import { NextResponse } from 'next/server';
import { cachedHeartbeat } from './cached';

/**
 * GET /api/health — THE APP'S OWN HEALTH, FOR AN UPTIME MONITOR.
 *
 * Before this existed there was nothing an uptime monitor could call. The
 * only way to find out the system was down was a seller ringing to say the
 * page would not load, which means the first person to notice an outage was
 * a customer losing an order.
 *
 * ── NO SESSION, BY DESIGN ──
 *
 * An uptime monitor has no cookie and never will. `src/proxy.ts` lets every
 * `/api/` path through untouched — it validates the Origin header on
 * MUTATIONS only, and this is a GET — and authentication in this codebase
 * lives in each handler (`requirePermission`, see src/lib/authorization.ts).
 * So this handler simply does not call it. That is the whole mechanism;
 * there is no allowlist to add a path to.
 *
 * Because it is unauthenticated, two rules are absolute:
 *
 *   IT LEAKS NOTHING. No version string, no commit hash, no framework name,
 *   no database name or host, no table names, no connection string, no job
 *   names, no error text, no counts. A version number is a free gift to
 *   anyone matching the install against a CVE list; a count of orders or
 *   users is this business's volume, published to its competitors. The
 *   monitor needs a status code and a word, and that is exactly what it
 *   gets. The fields below are a closed vocabulary of fixed words — nothing
 *   here is interpolated from the database or from an exception.
 *
 *   IT IS CHEAP. See `cached.ts` and `heartbeat.ts`: one indexed query
 *   returning one row, at most once per 5-second window per instance, so a
 *   flood costs memory lookups rather than database time.
 *
 * ── COST PER CALL ──
 *
 * At most ONE database round trip per 5 seconds per app instance: a single
 * index scan on `JobRun(jobName, startedAt)` for three names, stopping at
 * the first row — no table read, no sort, no count, constant as the run log
 * grows. Polled once a minute that is one such query a minute, about
 * 0.1 ms of database time. Every other call inside the window is pure
 * memory. Nothing is written, so the endpoint cannot itself be the cause of
 * an outage.
 *
 * ── WHAT MAKES IT NON-200, AND THE DEAD-WORKER RULING ──
 *
 * 200 when the app can do its own job. 503 only when the database is
 * unreachable, because then the app can serve nothing at all and the right
 * action is to page somebody or fail the container's health check.
 *
 * A DEAD WORKER DOES NOT MAKE THIS ENDPOINT NON-200. It is reported in its
 * own `scheduler` field, and `/api/health/worker` is the route that turns
 * red for it. The reason is not squeamishness, it is blast radius:
 *
 *   The worker is a different process, often a different container. If a
 *   late background job returned 503 here, every automated thing watching
 *   this URL would act on the web app — a Docker `HEALTHCHECK` or a
 *   Kubernetes liveness probe would restart the web container, a load
 *   balancer would pull it out of rotation. Restarting the website does not
 *   fix the worker. So a commission accrual running nine minutes late would
 *   take the storefront offline, and then keep it offline, in a loop,
 *   while customers cannot order. An outage manufactured by the monitoring
 *   is the worst possible outcome of adding monitoring.
 *
 *   The brief asks for uptime monitoring on the app AND the worker — two
 *   things, so two signals. Collapsing them into one status code destroys
 *   the information the second monitor exists to carry: you would know
 *   something is wrong and not which process to look at.
 *
 * So: this route is the APP's monitor and answers for the app. The
 * `scheduler` field is here anyway, because a human or a dashboard reading
 * one URL should see the whole truth; only the STATUS CODE is scoped.
 */

// This must never be prerendered or cached: a cached "ok" is a lie the
// moment the thing it describes fails, and a health endpoint that answers
// from a build artifact answers 200 forever — including while the database
// is down, which is the one case it exists for.
export const dynamic = 'force-dynamic';

/**
 * `no-store` on the response for the same reason, one layer out: a CDN or
 * a reverse proxy in front of the app would otherwise happily serve a
 * 60-second-old "ok" to the monitor and hide a real outage.
 */
const HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate',
  // The answer is for machines. Saying so stops a browser or a proxy from
  // trying to sniff it into something else.
  'X-Content-Type-Options': 'nosniff',
};

export async function GET() {
  const reading = await cachedHeartbeat();

  const healthy = reading.db === 'up';

  return NextResponse.json(
    {
      // A closed vocabulary: 'ok' | 'degraded' | 'fail'. 'degraded' is the
      // honest word for "this app is fine and something it depends on is
      // not" — it is what a human reading the field needs, and the monitor
      // ignores it because the status code is 200.
      status: healthy ? (reading.scheduler === 'alive' ? 'ok' : 'degraded') : 'fail',
      // 'up' | 'down'. Never the host, the name, or the driver's error.
      db: reading.db,
      // 'alive' | 'stale' | 'unknown'. Never which job, never when, never
      // how many — "job X last ran at HH:mm" tells a stranger the shape of
      // this business's day.
      scheduler: reading.scheduler,
    },
    { status: healthy ? 200 : 503, headers: HEADERS }
  );
}

/**
 * Some uptime monitors probe with HEAD to save bandwidth. Next.js answers
 * HEAD from GET automatically, but only when GET exists — which it does —
 * so nothing more is needed here. POST and the rest are left undefined on
 * purpose: Next then answers 405 with an `Allow` header, and an endpoint
 * that accepts no writes cannot be used to write anything.
 */
