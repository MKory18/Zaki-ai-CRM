import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * «إذا المحافظة مش معروفة، نطاق البلد».
 *
 * In its own file because it needs the database mocked, and
 * delivery-time.test.ts is the pure half — the arithmetic that can be
 * checked without one.
 *
 * WHY IT EXISTS AT ALL: the first version of this rule was tested only
 * through `windowFor`, against maps built by hand in the test. Removing
 * the code that FILLS the country entry broke nothing — the reader was
 * guarded and the writer was not, which is a guard that watches a door
 * nobody uses.
 */

const { db } = vi.hoisted(() => ({ db: { order: { findMany: vi.fn() } } }));
vi.mock('./db', () => ({ db }));

import { EVERYWHERE, MIN_DELIVERIES, deliveryWindows, windowFor } from './delivery-time';

/** A delivery that took `days`, in `regionId`. */
const took = (regionId: string, days: number) => ({
  regionId,
  shippedAt: new Date('2026-09-01T00:00:00.000Z'),
  deliveredAt: new Date(new Date('2026-09-01T00:00:00.000Z').getTime() + days * 86_400_000),
});

const scope = { companyId: 'c1', storeId: 's1' };

beforeEach(() => vi.clearAllMocks());

describe('the country-wide window is really written', () => {
  it('appears once the whole set clears the floor', async () => {
    // Two governorates, neither on its own at the floor, together over it.
    db.order.findMany.mockResolvedValue([
      ...Array.from({ length: 3 }, () => took('r1', 2)),
      ...Array.from({ length: 3 }, () => took('r2', 4)),
    ]);
    const windows = await deliveryWindows(scope);
    expect(windows.get('r1'), 'محافظة تحت الحد تتكلّم').toBeUndefined();
    expect(windows.get('r2')).toBeUndefined();
    expect(windows.get(EVERYWHERE), 'لا نطاق للبلد').toBeTruthy();
  });

  /**
   * A wider claim, held to the same floor. Four deliveries have not taught
   * this shop how long it takes anywhere.
   */
  it('and stays silent when even the whole set is an anecdote', async () => {
    db.order.findMany.mockResolvedValue(
      Array.from({ length: MIN_DELIVERIES - 1 }, () => took('r1', 2))
    );
    const windows = await deliveryWindows(scope);
    expect(windows.get(EVERYWHERE)).toBeUndefined();
    expect(windowFor(windows, 'r9')).toBeNull();
  });

  it('a governorate that knows its own keeps it', async () => {
    db.order.findMany.mockResolvedValue([
      ...Array.from({ length: MIN_DELIVERIES }, () => took('r1', 2)),
      ...Array.from({ length: MIN_DELIVERIES }, () => took('r2', 9)),
    ]);
    const windows = await deliveryWindows(scope);
    expect(windowFor(windows, 'r1')?.medianDays).toBe(2);
    // And a visitor from neither gets the country, which is between them.
    const everywhere = windowFor(windows, 'r9')!.medianDays;
    expect(everywhere).toBeGreaterThanOrEqual(2);
    expect(everywhere).toBeLessThanOrEqual(9);
  });

  it('asks only about orders that reached the door', async () => {
    db.order.findMany.mockResolvedValue([]);
    await deliveryWindows(scope);
    const where = db.order.findMany.mock.calls[0][0].where;
    expect(where.deliveredAt.not).toBeNull();
    expect(where.shippedAt.not).toBeNull();
  });
});
