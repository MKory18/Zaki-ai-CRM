import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * THE PARCEL THE COURIER HAS NEVER HEARD OF.
 *
 * It used to be a `continue`. The poll asked again in two minutes, and
 * again, for ever, while the order sat in SHIPPED — and nobody found out
 * until a customer rang to ask where their parcel was.
 *
 * Two properties are being guarded. Three misses before anybody is told,
 * because one is a blip in somebody's API. And the alarm fires ONCE: an
 * alarm that repeats every two minutes is an alarm people build a filter
 * for, and a filtered alarm is worse than none — everybody believes it is
 * working.
 */

const { db } = vi.hoisted(() => ({ db: { order: { update: vi.fn() } } }));
vi.mock('../db', () => ({ db }));

import { clearMiss, MISSES_BEFORE_ALERT, missingHours, recordMiss } from './missing-shipment';

const NOW = new Date('2026-09-25T12:00:00Z');
const order = (misses: number, alerted: Date | null = null) => ({
  id: 'o1',
  trackingMissCount: misses,
  trackingMissingAlertedAt: alerted,
});

beforeEach(() => {
  vi.resetAllMocks();
  db.order.update.mockResolvedValue({});
});

describe('counting the misses', () => {
  it('one miss tells nobody — an API has bad afternoons', async () => {
    const out = await recordMiss(db as never, order(0), NOW);
    expect(out).toMatchObject({ misses: 1, alertNow: false });
  });

  it('two still tells nobody', async () => {
    expect((await recordMiss(db as never, order(1), NOW)).alertNow).toBe(false);
  });

  it('the third says so out loud', async () => {
    const out = await recordMiss(db as never, order(MISSES_BEFORE_ALERT - 1), NOW);
    expect(out).toMatchObject({ misses: 3, alertNow: true });
  });

  it('and never again after that — a repeating alarm is one people filter', async () => {
    const out = await recordMiss(db as never, order(9, NOW), NOW);
    expect(out.alertNow).toBe(false);
  });
});

describe('when it went missing', () => {
  it('is stamped on the FIRST miss, not the one that raised the alarm', async () => {
    // "How long has it been gone" is the question a human asks, and dating
    // it from the third miss understates it by the first two.
    await recordMiss(db as never, order(0), NOW);
    expect(db.order.update.mock.calls[0][0].data.trackingMissingSince).toEqual(NOW);
  });

  it('and is not re-stamped on later misses', async () => {
    await recordMiss(db as never, order(1), NOW);
    expect(db.order.update.mock.calls[0][0].data.trackingMissingSince).toBeUndefined();
  });

  it('reads in whole hours, for the message', () => {
    expect(missingHours(new Date('2026-09-25T06:30:00Z'), NOW)).toBe(5);
    expect(missingHours(null, NOW)).toBe(0);
    // A clock that ran backwards is not a negative age.
    expect(missingHours(new Date('2026-09-26T00:00:00Z'), NOW)).toBe(0);
  });
});

describe('when it turns up', () => {
  it('the count and the alarm stamp are both cleared', async () => {
    await clearMiss(db as never, order(3, NOW));
    expect(db.order.update.mock.calls[0][0].data).toEqual({
      trackingMissCount: 0,
      trackingMissingSince: null,
      trackingMissingAlertedAt: null,
    });
  });

  it('so a second disappearance is shouted about as loudly as the first', async () => {
    await clearMiss(db as never, order(3, NOW));
    const again = await recordMiss(db as never, order(2, null), NOW);
    expect(again.alertNow).toBe(true);
  });

  it('and a parcel that was never missing costs no write at all', async () => {
    await clearMiss(db as never, order(0, null));
    expect(db.order.update).not.toHaveBeenCalled();
  });
});
