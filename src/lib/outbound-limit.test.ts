import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_LIMIT, forgetOutboundLimits, limitFor, paced, takeSlot } from './outbound-limit';

/**
 * NOT FLOODING SOMEBODY ELSE'S SERVER.
 *
 * The courier poll walks up to two hundred barcodes every two minutes, one
 * call each, as fast as the loop goes round. Crossing a provider's published
 * limit does not slow anything down — it suspends the account, on a working
 * day, for a business that cannot ship until somebody there answers an email.
 *
 * The clock is injected throughout: a rate-limit test that really sleeps is
 * a rate-limit test nobody runs, and one nobody runs stops being true.
 */

/** A clock that never really waits — it just moves. */
function fakeClock(start = 1_000_000) {
  let t = start;
  const waits: number[] = [];
  return {
    waits,
    now: () => t,
    wait: async (ms: number) => {
      waits.push(ms);
      t += ms;
    },
    advance: (ms: number) => {
      t += ms;
    },
  };
}

beforeEach(() => forgetOutboundLimits());

describe('the pacing', () => {
  it('lets the first calls through without waiting at all', async () => {
    const clock = fakeClock();
    const limit = { calls: 2, windowMs: 1000 };
    await takeSlot('k', limit, clock);
    await takeSlot('k', limit, clock);
    expect(clock.waits).toEqual([]);
  });

  it('and makes the one past the limit wait for a slot', async () => {
    const clock = fakeClock();
    const limit = { calls: 2, windowMs: 1000 };
    await takeSlot('k', limit, clock);
    await takeSlot('k', limit, clock);
    await takeSlot('k', limit, clock);
    // Waits exactly until the oldest call leaves the window, not a guess.
    expect(clock.waits).toEqual([1000]);
  });

  it('a window that has passed frees the slots again', async () => {
    const clock = fakeClock();
    const limit = { calls: 2, windowMs: 1000 };
    await takeSlot('k', limit, clock);
    await takeSlot('k', limit, clock);
    clock.advance(1001);
    await takeSlot('k', limit, clock);
    expect(clock.waits).toEqual([]);
  });

  it('and one provider never spends another’s allowance', async () => {
    const clock = fakeClock();
    const limit = { calls: 1, windowMs: 1000 };
    await takeSlot('logestechs', limit, clock);
    await takeSlot('meta', limit, clock);
    expect(clock.waits).toEqual([]);
  });
});

describe('a whole sweep', () => {
  it('never exceeds the limit, however many parcels there are', async () => {
    const clock = fakeClock();
    const limit = { calls: 2, windowMs: 1000 };
    const at: number[] = [];

    await paced('sweep', limit, [1, 2, 3, 4, 5, 6], async (n) => {
      at.push(clock.now());
      return n;
    }, clock);

    // In every 1000ms window there are at most two calls.
    for (const t of at) {
      const inWindow = at.filter((x) => x > t - 1000 && x <= t).length;
      expect(inWindow).toBeLessThanOrEqual(2);
    }
  });

  it('returns every result, in order — pacing must not lose a parcel', async () => {
    const clock = fakeClock();
    const out = await paced('sweep', { calls: 1, windowMs: 100 }, ['a', 'b', 'c'], async (x) => x.toUpperCase(), clock);
    expect(out).toEqual(['A', 'B', 'C']);
  });
});

describe('the limits themselves', () => {
  it('name the providers whose limits can suspend an account', () => {
    expect(limitFor('LOGESTECHS').calls).toBeLessThanOrEqual(5);
    expect(limitFor('logestechs')).toEqual(limitFor('LOGESTECHS'));
    expect(limitFor('META').calls).toBeGreaterThan(0);
  });

  it('and an unknown provider gets the cautious default, never "unlimited"', () => {
    expect(limitFor('SOMETHING_NEW')).toEqual(DEFAULT_LIMIT);
    expect(limitFor(null)).toEqual(DEFAULT_LIMIT);
    expect(limitFor(undefined).calls).toBeGreaterThan(0);
  });
});

describe('where it is actually used', () => {
  /**
   * A structural test, and deliberately so.
   *
   * The pacing lives inside an adapter that talks to a real server, so the
   * behavioural test for it would need that server. What CAN be checked
   * without one is the thing that actually went wrong: a sweep over a list
   * of barcodes fired all of them at once. If somebody reaches for
   * Promise.all again — which is the natural thing to reach for, and faster
   * on every metric except the one that suspends the account — this fails.
   */
  it('every barcode sweep is paced, and none of them uses Promise.all', async () => {
    const { readFileSync, readdirSync } = await import('node:fs');
    const { join } = await import('node:path');
    const dir = join(process.cwd(), 'src', 'lib', 'couriers');

    for (const file of readdirSync(dir)) {
      if (!file.endsWith('.ts') || file.includes('.test.')) continue;
      const src = readFileSync(join(dir, file), 'utf8');
      if (!src.includes('async fetchEvents')) continue;
      // An adapter that reaches no network needs no pacing — the manual
      // courier polls nothing and returns an empty list.
      if (!src.includes('this.call') && !src.includes('fetch(')) continue;

      expect(src.includes('paced('), `${file}: يمسح الباركودات بلا تمهّل`).toBe(true);
      expect(
        /Promise\.all\(\s*trackingNumbers/.test(src),
        `${file}: يطلق كل الباركودات دفعة واحدة`
      ).toBe(false);
    }
  });
});
