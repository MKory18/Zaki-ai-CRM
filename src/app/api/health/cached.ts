import { readHeartbeat, type HeartbeatReading } from '@/lib/jobs/heartbeat';

/**
 * THE SAME READING, SHARED BY BOTH HEALTH ROUTES, FOR A FEW SECONDS.
 *
 * Two reasons, and the second is the one that matters.
 *
 * The small one: `/api/health` and `/api/health/worker` are polled by two
 * separate monitors that ask the same question of the database. There is no
 * reason for both to pay for it.
 *
 * The real one: THIS ENDPOINT HAS NO SESSION. It is the only route in the
 * app that any stranger on the internet can call, and it touches the
 * database. One index seek is cheap; ten thousand a second from a script is
 * not, and the first thing an attacker does with an unauthenticated
 * database-touching endpoint is hold it down. With this cache, load on the
 * database is capped at one query per window no matter how hard the route
 * is hit — the flood answers from memory.
 *
 * WHY THE WINDOW IS SHORT. A monitor polls every 60 seconds, so a window
 * of a few seconds never serves it a stale answer; it exists only to flatten
 * bursts. A long window would do the opposite of this file's job: it would
 * let the endpoint keep saying "alive" after the worker died.
 *
 * In-process, so per app instance — which is correct: each instance answers
 * for itself, and behind a load balancer each pays at most one query per
 * window.
 */
const CACHE_MS = 5_000;

let cached: { at: number; reading: HeartbeatReading } | null = null;

/**
 * THE READING IN FLIGHT, SHARED TOO.
 *
 * The window only helped once a reading had come BACK. While one was still on
 * its way, every caller found the cache stale and started its own read: the
 * container's HEALTHCHECK, the uptime monitor, `/api/health/worker` and any
 * flood all queued for the database at the very moment it was slow, which is
 * exactly when a slow reading is in flight longest. Now they wait for the one
 * already asked. `readHeartbeat` never rejects (every failure is a reading), so
 * nobody waiting on it can be handed an exception.
 */
let pending: Promise<HeartbeatReading> | null = null;

/** Only for tests, so one test's cached answer cannot decide the next one's. */
export function resetHealthCache(): void {
  cached = null;
  pending = null;
}

export async function cachedHeartbeat(now: Date = new Date()): Promise<HeartbeatReading> {
  const ms = now.getTime();
  if (cached && ms - cached.at < CACHE_MS) return cached.reading;
  if (!pending) {
    const asked = readHeartbeat(now).then((reading) => {
      cached = { at: ms, reading };
      return reading;
    });
    pending = asked;
    // Cleared only if it is still this read: a reset in between must not clear a newer one.
    // Both arms, so even a rejection that should never happen is not left unhandled here.
    const clear = () => {
      if (pending === asked) pending = null;
    };
    asked.then(clear, clear);
  }
  return pending;
}
