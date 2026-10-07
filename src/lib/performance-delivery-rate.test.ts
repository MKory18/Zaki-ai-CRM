import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * THE DELIVERY RATE ON A PERSON'S CARD — THE NUMBER, NOT THE EXPRESSION.
 *
 * It is thirty-five of the hundred, the heaviest band on the card, and it
 * was wrong in two directions at once for a confirmation agent:
 *
 *  1. `measure('DELIVERY_RATE')` returns a WHOLE NUMBER (`rateOf`
 *     multiplies by 100), and the band's arithmetic is
 *     `clamp(value, 0, 1) × weight`. So a 50% agent arrived as 50, clamped
 *     to 1, and earned the FULL 35 — identical to a 100% agent — printed
 *     «٥٠٠٠٪» on the card, and could never fall under a bar of 0.6. The
 *     moderator branch beside it already divided by 100.
 *  2. `.count || null` turned a real 0 into "no measurement". An agent who
 *     confirmed orders and had every one of them come back read «لا يُقاس»,
 *     and the band left `possible` with it — so the worst delivery rate in
 *     the building was scored out of 55 instead of out of 90.
 *
 * Every assertion below is a NUMBER a manager would read off the card. The
 * real `performance-score.ts` does the scoring; only the readers are mocked.
 */

const { db, measure, sampleSize, moderatorPerformance, teamPerformance } = vi.hoisted(() => ({
  db: { order: { findMany: vi.fn(async (): Promise<unknown[]> => []) } },
  measure: vi.fn(),
  sampleSize: vi.fn(),
  moderatorPerformance: vi.fn(async () => [] as unknown[]),
  teamPerformance: vi.fn(async () => ({ employees: [], totals: {} })),
}));
vi.mock('./db', () => ({ db }));
vi.mock('./commission-metrics', () => ({
  measure: (...a: unknown[]) => measure(...a),
  sampleSize: (...a: unknown[]) => sampleSize(...a),
}));
vi.mock('./attribution-performance', () => ({ moderatorPerformance: () => moderatorPerformance() }));
vi.mock('./team-performance', () => ({ teamPerformance: () => teamPerformance() }));

import { scoreRole } from './performance-metrics';

const SCOPE = {
  companyId: 'c1',
  storeId: 's1',
  start: new Date('2026-10-01T00:00:00Z'),
  end: new Date('2026-11-01T00:00:00Z'),
  calendar: { workHoursStart: '09:00', workHoursEnd: '18:00', weekendDays: [5, 6], timezone: 'Asia/Damascus' },
};
const ME = [{ id: 'a', name: 'وكيل' }];

/** Confirmed 20 orders; the delivery rate reads `rate` out of them. */
function agent(opts: { rate: number; everConfirmed: number; confirmed?: number }) {
  measure.mockImplementation(async (_tx: unknown, metric: string) => {
    if (metric === 'DELIVERY_RATE') return { count: opts.rate, amount: 0, orderIds: [] };
    if (metric === 'CONFIRMED_COUNT') return { count: opts.confirmed ?? 20, amount: 0, orderIds: [] };
    return { count: 0, amount: 0, orderIds: [] };
  });
  sampleSize.mockResolvedValue(opts.everConfirmed);
  // One order of their own, undiscounted, so the discount band is measured
  // and these assertions are about the delivery band alone.
  db.order.findMany.mockResolvedValue([
    { confirmedById: 'a', moderatorId: null, discountAmount: 0, totalAmount: 100 },
  ]);
  return scoreRole(SCOPE, 'CONFIRMATION_AGENT', ME, 10);
}

const deliveryBand = (rows: Awaited<ReturnType<typeof scoreRole>>) =>
  rows[0].score.bands.find((b) => b.key === 'delivery_rate')!;

beforeEach(() => {
  vi.clearAllMocks();
  db.order.findMany.mockResolvedValue([]);
  moderatorPerformance.mockResolvedValue([]);
  teamPerformance.mockResolvedValue({ employees: [], totals: {} });
});

describe('an agent who delivered NONE of what they confirmed', () => {
  it('is measured at 0% and earns 0 of the 35 — never «لا يُقاس»', async () => {
    const rows = await agent({ rate: 0, everConfirmed: 20 });
    const band = deliveryBand(rows);
    expect(band.value).toBe(0);
    expect(band.points).toBe(0);
  });

  it('and the band stays in «out of», so the card does not flatter them', async () => {
    // The whole point of the second half of the defect: a null band is
    // dropped from `possible` as well as from the total, so 0 of 35 became
    // "not applicable" and the card said «out of» 35 less than it should.
    const none = await agent({ rate: 0, everConfirmed: 20 });
    expect(none[0].score.possible).toBe(65);
    expect(none[0].score.total).toBe(30);

    // Against the same person with a perfect rate: 65 of 65, and the
    // DIFFERENCE between the two is the full weight of the band.
    const all = await agent({ rate: 100, everConfirmed: 20 });
    expect(all[0].score.possible).toBe(65);
    expect(all[0].score.total).toBe(65);
    expect(all[0].score.total! - none[0].score.total!).toBe(35);
  });
});

describe('the rate is a fraction, because the band and the bar both are', () => {
  it('50% is 0.5 and earns 18 of the 35 — not 50, which earned all 35', async () => {
    const band = deliveryBand(await agent({ rate: 50, everConfirmed: 20 }));
    // Points first, deliberately: on the old scale this read 35 — the same
    // as a perfect agent — and that is the number the band is judged on.
    expect(band.points).toBe(18);
    expect(band.value).toBe(0.5);
  });

  it('78% is 0.78 and earns 27 — the number the file promises in its own comment', async () => {
    const band = deliveryBand(await agent({ rate: 78, everConfirmed: 20 }));
    expect(band.value).toBe(0.78);
    expect(band.points).toBe(27);
  });

  it('100% is 1 and earns 35, so the top of the scale did not move', async () => {
    const band = deliveryBand(await agent({ rate: 100, everConfirmed: 20 }));
    expect(band.value).toBe(1);
    expect(band.points).toBe(35);
  });

  it('and a rate under the owner’s bar is a value the bar can compare with', async () => {
    // The bar is stored 0..1 (`deliveryRateBar: 0.6`) and the screen asks
    // `band.value < bars.deliveryRate`. On the old scale 50 was not below
    // 0.6 and no agent could ever be flagged.
    const band = deliveryBand(await agent({ rate: 50, everConfirmed: 20 }));
    expect(band.value! < 0.6).toBe(true);
    // And the card prints the percentage by multiplying by 100.
    expect(Math.round(band.value! * 100)).toBe(50);
  });
});

describe('nobody measured them at all', () => {
  it('is null — told apart by the DENOMINATOR, not by the rate being 0', async () => {
    // Confirmed nothing: `measure` returns EMPTY, count 0 — the same 0 a
    // genuinely terrible agent produces. The denominator is what differs.
    const band = deliveryBand(await agent({ rate: 0, everConfirmed: 0, confirmed: 20 }));
    expect(band.value).toBeNull();
    expect(band.points).toBeNull();
    expect(sampleSize).toHaveBeenCalled();
  });
});

describe('the discount band, swept from the same file', () => {
  /** The orders `discountUse` reads, attributed to whoever confirmed them. */
  const orders = (rows: { confirmedById: string | null; discountAmount: number; totalAmount: number }[]) => {
    db.order.findMany.mockResolvedValue(rows.map((r) => ({ ...r, moderatorId: null })));
    measure.mockImplementation(async (_tx: unknown, metric: string) =>
      metric === 'DELIVERY_RATE'
        ? { count: 100, amount: 0, orderIds: [] }
        : { count: 20, amount: 0, orderIds: [] }
    );
    sampleSize.mockResolvedValue(20);
    return scoreRole(SCOPE, 'CONFIRMATION_AGENT', ME, 10);
  };
  const discountBand = (rows: Awaited<ReturnType<typeof scoreRole>>) =>
    rows[0].score.bands.find((b) => b.key === 'discount_use')!;

  it('no order attributed to them is «لا يُقاس» — never a perfect record', async () => {
    // Somebody else's orders are in the window; none of them is theirs.
    const band = discountBand(await orders([{ confirmedById: 'b', discountAmount: 20, totalAmount: 80 }]));
    expect(band.value).toBeNull();
    expect(band.points).toBeNull();
  });

  it('and the 10 points leave «out of» with it, instead of being handed over', async () => {
    const none = await orders([{ confirmedById: 'b', discountAmount: 20, totalAmount: 80 }]);
    const mine = await orders([{ confirmedById: 'a', discountAmount: 0, totalAmount: 100 }]);
    expect(none[0].score.possible).toBe(65);
    expect(mine[0].score.possible).toBe(75);
    expect(mine[0].score.possible - none[0].score.possible).toBe(10);
    // The points are not handed over either: 65 of 75 against 65 of 65.
    expect(mine[0].score.total).toBe(75);
    expect(none[0].score.total).toBe(65);
  });

  it('but a real share of 0 still earns the band — they had orders and gave nothing away', async () => {
    const band = discountBand(await orders([{ confirmedById: 'a', discountAmount: 0, totalAmount: 100 }]));
    expect(band.value).toBe(0);
    expect(band.points).toBe(10);
  });

  it('and a real share is still measured against the shop’s own habit', async () => {
    // Theirs is 20 of 100; the shop's pooled habit is 20 of 200 = 0.1. Twice
    // the habit spends the band: clamp(2 − 0.2/0.1, 0, 1) × 10 = 0.
    const band = discountBand(
      await orders([
        { confirmedById: 'a', discountAmount: 20, totalAmount: 80 },
        { confirmedById: 'b', discountAmount: 0, totalAmount: 100 },
      ])
    );
    expect(band.value).toBe(0.2);
    expect(band.points).toBe(0);
  });
});

describe('the moderator branch, which was already right', () => {
  const mod = (deliveryRate: number | null) => {
    moderatorPerformance.mockResolvedValue([{ id: 'a', deliveryRate, confirmed: 20 }]);
    measure.mockResolvedValue({ count: 0, amount: 0, orderIds: [] });
    return scoreRole(SCOPE, 'MODERATOR', ME, 10);
  };

  it('0 out of what they brought is 0% and 0 points, not «لا يُقاس»', async () => {
    const band = deliveryBand(await mod(0));
    expect(band.value).toBe(0);
    expect(band.points).toBe(0);
  });

  it('60 is 0.6 and earns 21 of the 35', async () => {
    const band = deliveryBand(await mod(60));
    expect(band.value).toBe(0.6);
    expect(band.points).toBe(21);
  });

  it('and null stays null — a moderator nobody measured', async () => {
    const band = deliveryBand(await mod(null));
    expect(band.value).toBeNull();
    expect(band.points).toBeNull();
  });

  it('never asks the agent-side reader for its denominator', async () => {
    await mod(60);
    expect(sampleSize).not.toHaveBeenCalled();
  });
});
