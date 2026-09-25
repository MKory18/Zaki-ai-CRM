/**
 * NOT ASKING SOMEBODY ELSE'S SERVER TWO HUNDRED QUESTIONS AT ONCE.
 *
 * The courier poll walks up to two hundred barcodes every two minutes, one
 * HTTP call each, as fast as the loop goes round. LogesTechs, Meta and
 * WhatsApp all publish rate limits, and the penalty for crossing one is not
 * a slower reply — it is a suspended account, on a working day, for a
 * business that cannot ship until somebody at the provider answers an email.
 *
 * NOT the same thing as `rate-limit.ts`, which sits beside it and does the
 * opposite job: that one REJECTS inbound requests to protect this server
 * ("you have had enough, come back later"). This one WAITS before outbound
 * calls to protect somebody else's. Rejecting would be wrong here — a
 * status nobody asked for is a parcel nobody is tracking, and the job has
 * until its next run either way.
 *
 * In memory on purpose. It protects THIS process from flooding a provider,
 * and the run lock means only one worker runs a given job at a time. The
 * day that stops being true, this paragraph is what says so.
 */

export interface LimitConfig {
  /** How many calls are allowed in a window. */
  calls: number;
  /** The window, in milliseconds. */
  windowMs: number;
}

/**
 * What each provider is asked to tolerate.
 *
 * Conservative on purpose: being too slow costs a status that arrives at
 * the next run; being too fast costs an account somebody has to beg to
 * have restored.
 */
export const PROVIDER_LIMITS: Record<string, LimitConfig> = {
  // Their status endpoint takes one barcode at a time, so a full sweep is
  // already hundreds of calls. Two a second is brisk and unremarkable.
  LOGESTECHS: { calls: 2, windowMs: 1000 },
  META: { calls: 10, windowMs: 1000 },
  WHATSAPP: { calls: 10, windowMs: 1000 },
};

export const DEFAULT_LIMIT: LimitConfig = { calls: 5, windowMs: 1000 };

export function limitFor(providerCode: string | null | undefined): LimitConfig {
  return PROVIDER_LIMITS[(providerCode ?? '').toUpperCase()] ?? DEFAULT_LIMIT;
}

/** The timestamps of recent calls, per key. */
const recent = new Map<string, number[]>();

/** Only for tests: forget everything this process has counted. */
export function forgetOutboundLimits(): void {
  recent.clear();
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface Clock {
  now?: () => number;
  wait?: (ms: number) => Promise<void>;
}

/**
 * Wait until one more call is allowed, then count it.
 *
 * The clock is injectable so a test can prove the pacing without actually
 * sleeping — a rate-limit test that really waits is a rate-limit test
 * nobody runs, and one nobody runs is one that stops being true.
 */
export async function takeSlot(key: string, limit: LimitConfig, clock: Clock = {}): Promise<void> {
  const now = clock.now ?? Date.now;
  const wait = clock.wait ?? sleep;

  for (;;) {
    const cutoff = now() - limit.windowMs;
    const calls = (recent.get(key) ?? []).filter((t) => t > cutoff);

    if (calls.length < limit.calls) {
      calls.push(now());
      recent.set(key, calls);
      return;
    }

    // The oldest call in the window decides when a slot frees up. Waiting
    // exactly that long, rather than a fixed guess, keeps a sweep as fast
    // as the provider actually allows.
    const freeAt = calls[0] + limit.windowMs;
    recent.set(key, calls);
    await wait(Math.max(1, freeAt - now()));
  }
}

/**
 * Run `fn` for each item, never exceeding the limit.
 *
 * Sequential by design. Concurrency plus a rate limit is two dials that
 * disagree with each other, and the one that matters to somebody else's
 * server is the rate.
 */
export async function paced<T, R>(
  key: string,
  limit: LimitConfig,
  items: T[],
  fn: (item: T) => Promise<R>,
  clock?: Clock
): Promise<R[]> {
  const out: R[] = [];
  for (const item of items) {
    await takeSlot(key, limit, clock);
    out.push(await fn(item));
  }
  return out;
}
