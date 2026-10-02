import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * THE HEALTH ENDPOINT.
 *
 * It is the only route in this application that any stranger on the
 * internet can call, and it touches the database. So the tests that matter
 * are the negative ones:
 *
 *   - it must not answer 200 when the database is unreachable;
 *   - /api/health/worker must not answer 200 when the scheduler is dead,
 *     NOR when its own check broke — an endpoint that goes green whenever
 *     it cannot tell is an endpoint that goes green at the worst moment;
 *   - /api/health must NOT go red for a dead worker, because a 503 there
 *     makes container health checks restart the web app for a fault in a
 *     different process;
 *   - neither may leak a version, a hostname, a table name, a job name, a
 *     timestamp or a count;
 *   - neither may be cacheable.
 */

const { readHeartbeat } = vi.hoisted(() => ({ readHeartbeat: vi.fn() }));
vi.mock('@/lib/jobs/heartbeat', () => ({
  readHeartbeat: (...a: unknown[]) => readHeartbeat(...a),
}));

import { GET as appHealth } from './route';
import { GET as workerHealth } from './worker/route';
import { resetHealthCache } from './cached';

beforeEach(() => {
  vi.clearAllMocks();
  // The cache is module state shared by both routes; without this one
  // test's answer would decide the next one's.
  resetHealthCache();
});

const app = async () => {
  const res = await appHealth();
  return { status: res.status, body: await res.json(), headers: res.headers };
};
const worker = async () => {
  const res = await workerHealth();
  return { status: res.status, body: await res.json(), headers: res.headers };
};

// ─────────────────────────────────────────────────────
// The app's own status code
// ─────────────────────────────────────────────────────

describe('GET /api/health', () => {
  it('is 200 and "ok" when everything is up', async () => {
    readHeartbeat.mockResolvedValue({ db: 'up', scheduler: 'alive' });
    expect(await app()).toMatchObject({ status: 200, body: { status: 'ok', db: 'up', scheduler: 'alive' } });
  });

  it('is 503 when the database is unreachable', async () => {
    // This is the one thing that makes the APP unhealthy: it can serve
    // nothing at all, and the right action is to page somebody.
    readHeartbeat.mockResolvedValue({ db: 'down', scheduler: 'unknown' });
    expect(await app()).toMatchObject({ status: 503, body: { status: 'fail', db: 'down' } });
  });

  it('stays 200 with a dead worker, and says so in its own field', async () => {
    // THE RULING, AS A TEST. A 503 here would make a Docker HEALTHCHECK or
    // a Kubernetes liveness probe restart the WEB container because a
    // background job is nine minutes late — and restarting the website does
    // not fix the worker. It would take the storefront down, in a loop,
    // while customers cannot order: an outage manufactured by the
    // monitoring. The worker gets its own URL instead.
    readHeartbeat.mockResolvedValue({ db: 'up', scheduler: 'stale' });
    const res = await app();
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'degraded', scheduler: 'stale' });
  });

  it('stays 200 when the worker is merely unanswerable', async () => {
    readHeartbeat.mockResolvedValue({ db: 'up', scheduler: 'unknown' });
    expect(await app()).toMatchObject({ status: 200, body: { status: 'degraded' } });
  });
});

// ─────────────────────────────────────────────────────
// The worker's own status code
// ─────────────────────────────────────────────────────

describe('GET /api/health/worker', () => {
  it('is 200 only when the scheduler is alive', async () => {
    readHeartbeat.mockResolvedValue({ db: 'up', scheduler: 'alive' });
    expect(await worker()).toMatchObject({ status: 200, body: { status: 'ok', scheduler: 'alive' } });
  });

  it('is 503 when the scheduler is stale', async () => {
    readHeartbeat.mockResolvedValue({ db: 'up', scheduler: 'stale' });
    expect(await worker()).toMatchObject({ status: 503, body: { status: 'fail', scheduler: 'stale' } });
  });

  it('is 503 — not 200 — when its own check cannot be made', async () => {
    // Fail closed. The database being unreadable is not evidence that the
    // jobs are running, and an endpoint whose whole purpose is to be
    // believed must not go green because it stopped being able to look.
    readHeartbeat.mockResolvedValue({ db: 'down', scheduler: 'unknown' });
    expect(await worker()).toMatchObject({ status: 503, body: { status: 'fail' } });
  });

  it('is a path of its own, not a query parameter on /api/health', async () => {
    // A URL whose meaning depends on its query string is a URL somebody
    // eventually configures without it — and then the worker check silently
    // becomes an app check that is always green. The two routes answer
    // differently to the same world, which is what makes them two monitors.
    readHeartbeat.mockResolvedValue({ db: 'up', scheduler: 'stale' });
    expect((await app()).status).toBe(200);
    expect((await worker()).status).toBe(503);
  });
});

// ─────────────────────────────────────────────────────
// It leaks nothing
// ─────────────────────────────────────────────────────

describe('it leaks nothing', () => {
  const STATES = [
    { db: 'up', scheduler: 'alive' },
    { db: 'up', scheduler: 'stale' },
    { db: 'up', scheduler: 'unknown' },
    { db: 'down', scheduler: 'unknown' },
  ] as const;

  it('answers with a closed vocabulary and nothing else, in every state', async () => {
    for (const state of STATES) {
      readHeartbeat.mockResolvedValue(state);
      resetHealthCache();
      const a = await app();
      resetHealthCache();
      const w = await worker();

      expect(Object.keys(a.body).sort(), JSON.stringify(state)).toEqual(['db', 'scheduler', 'status']);
      expect(Object.keys(w.body).sort(), JSON.stringify(state)).toEqual(['scheduler', 'status']);

      for (const [name, body] of [['app', a.body], ['worker', w.body]] as const) {
        for (const value of Object.values(body)) {
          // Every value is one of eight fixed words. Nothing is
          // interpolated from the database or from an exception, so there
          // is no path by which a table name, a connection string or a
          // seller's data could reach a stranger.
          expect(['ok', 'degraded', 'fail', 'up', 'down', 'alive', 'stale', 'unknown'], name).toContain(value);
        }
      }
    }
  });

  it('publishes no version, hostname, job name, timestamp or count', async () => {
    // A version string is a free gift to anyone matching the install
    // against a CVE list. A count of orders is this business's volume,
    // published to its competitors. A job's last-run time is the shape of
    // its working day.
    for (const state of STATES) {
      resetHealthCache();
      readHeartbeat.mockResolvedValue(state);
      const raw = JSON.stringify((await app()).body) + JSON.stringify((await worker()).body);
      for (const forbidden of [
        'version', 'commit', 'next', 'prisma', 'postgres', 'localhost', '5432',
        'JobRun', 'job_run', 'deliver-app-events', 'accrue-commission',
        'count', 'uptime', 'error', 'detail',
      ]) {
        expect(raw.toLowerCase(), forbidden).not.toContain(forbidden.toLowerCase());
      }
      // No digits at all, so no timestamp and no count can ever appear.
      expect(raw).not.toMatch(/\d/);
    }
  });

  it('cannot be cached by a proxy, a CDN or the framework', async () => {
    // A cached "ok" is a lie the moment the thing it describes fails. A
    // reverse proxy would otherwise serve a 60-second-old green answer to
    // the monitor and hide a real outage.
    readHeartbeat.mockResolvedValue({ db: 'up', scheduler: 'alive' });
    const a = await app();
    resetHealthCache();
    const w = await worker();
    for (const [name, headers] of [['app', a.headers], ['worker', w.headers]] as const) {
      expect(headers.get('cache-control'), name).toContain('no-store');
      expect(headers.get('x-content-type-options'), name).toBe('nosniff');
    }
    const [{ dynamic: a1 }, { dynamic: w1 }] = await Promise.all([
      import('./route'),
      import('./worker/route'),
    ]);
    expect([a1, w1]).toEqual(['force-dynamic', 'force-dynamic']);
  });
});

// ─────────────────────────────────────────────────────
// It is cheap, because it is polled for ever
// ─────────────────────────────────────────────────────

describe('it is cheap', () => {
  it('reads the database at most once across a burst on both routes', async () => {
    // The flood defence. One index seek is cheap; ten thousand a second
    // from a script against an unauthenticated endpoint is not.
    readHeartbeat.mockResolvedValue({ db: 'up', scheduler: 'alive' });
    for (let i = 0; i < 50; i++) await app();
    for (let i = 0; i < 50; i++) await worker();
    expect(readHeartbeat).toHaveBeenCalledTimes(1);
  });

  it('does not keep answering from a cache long enough to hide a failure', async () => {
    // The opposite risk: a long cache would let the endpoint keep saying
    // "alive" after the worker died. A monitor polls every 60 seconds, so
    // the window must be far shorter than that.
    const { cachedHeartbeat } = await import('./cached');
    const t0 = new Date('2026-10-02T12:00:00.000Z');
    readHeartbeat.mockResolvedValue({ db: 'up', scheduler: 'alive' });
    await cachedHeartbeat(t0);
    readHeartbeat.mockResolvedValue({ db: 'up', scheduler: 'stale' });
    expect(await cachedHeartbeat(new Date(t0.getTime() + 10_000))).toMatchObject({
      scheduler: 'stale',
    });
  });

  it('writes nothing, so the endpoint cannot itself cause an outage', async () => {
    // An unauthenticated endpoint that writes is an unauthenticated write.
    // Only GET is exported from either route; no POST, PUT, PATCH or
    // DELETE exists to be called.
    const [a, w] = await Promise.all([import('./route'), import('./worker/route')]);
    for (const mod of [a, w] as unknown as Record<string, unknown>[]) {
      for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
        expect(mod[method]).toBeUndefined();
      }
      expect(typeof mod.GET).toBe('function');
    }
  });
});
