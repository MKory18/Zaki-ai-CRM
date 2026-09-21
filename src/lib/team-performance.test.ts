import { beforeEach, describe, expect, it, vi } from 'vitest';

const { db } = vi.hoisted(() => ({
  db: {
    orderClaimHistory: { findMany: vi.fn() },
    orderStatusLog: { findMany: vi.fn() },
    orderContactAttempt: { groupBy: vi.fn() },
    order: { groupBy: vi.fn() },
    user: { findMany: vi.fn() },
  },
}));
vi.mock('./db', () => ({ db }));

import { teamPerformance } from './team-performance';

/**
 * The numbers a manager will act on: who to praise, who to help, who is
 * drowning. Every one of them is a way to be unfair to somebody, so the
 * cases below are the ways this could lie.
 */

/** Sunday to Thursday, 09:00–17:00, Amman. */
const CAL = {
  workHoursStart: '09:00',
  workHoursEnd: '17:00',
  weekendDays: [5, 6],
  timezone: 'Asia/Amman',
};

/** A local wall-clock moment in Amman (UTC+3, no DST in this window). */
const at = (day: number, hour: number, minute = 0) =>
  new Date(Date.UTC(2026, 8, day, hour - 3, minute));

const SARA = 'user-sara';
const input = { companyId: 'c1', storeId: 's1', calendar: CAL };

const claim = (userId: string, createdAt: Date) => ({ userId, createdAt });
const decision = (
  changedById: string,
  newValue: string,
  createdAt: Date,
  claimedAt: Date | null = null
) => ({ changedById, newValue, createdAt, order: { claimedAt } });

beforeEach(() => {
  vi.clearAllMocks();
  db.orderClaimHistory.findMany.mockResolvedValue([]);
  db.orderStatusLog.findMany.mockResolvedValue([]);
  db.orderContactAttempt.groupBy.mockResolvedValue([]);
  db.order.groupBy.mockResolvedValue([]);
  db.user.findMany.mockResolvedValue([{ id: SARA, name: 'سارة', role: 'CONFIRMATION_AGENT' }]);
});

const row = async () => (await teamPerformance(input)).employees[0];

describe('how long a confirmation takes', () => {
  it('counts working time only — an order held overnight is not a slow one', async () => {
    // Pulled at 16:50, confirmed 09:10 the next morning: ten minutes before
    // closing plus ten after opening. Wall-clock would call this 16 hours
    // and mark a good agent as the slowest on the desk.
    db.orderStatusLog.findMany.mockResolvedValue([
      decision(SARA, 'CONFIRMED', at(21, 9, 10), at(20, 16, 50)),
    ]);
    expect((await row()).medianConfirmMinutes).toBe(20);
  });

  it('does not charge anyone for the weekend', async () => {
    // Thursday 16:30 → Sunday 09:30. Friday and Saturday are not work.
    db.orderStatusLog.findMany.mockResolvedValue([
      decision(SARA, 'CONFIRMED', at(20, 9, 30), at(17, 16, 30)),
    ]);
    expect((await row()).medianConfirmMinutes).toBe(60);
  });

  it('reports the typical call, not the one that went wrong', async () => {
    // Four quick ones and a disaster. An average says 100 minutes; nothing
    // about that number describes this agent's day.
    const spans = [10, 12, 15, 18, 480];
    db.orderStatusLog.findMany.mockResolvedValue(
      spans.map((m, i) => decision(SARA, 'CONFIRMED', at(20, 9, 0 + m + i * 0), at(20, 9, 0)))
    );
    const r = await row();
    expect(r.medianConfirmMinutes).toBe(15);
  });

  it('counts a confirmation that never went through the pool, but does not time it', async () => {
    // An imported or directly-entered order has no claim moment. It is a
    // real confirmation; it is not evidence of anybody's speed.
    db.orderStatusLog.findMany.mockResolvedValue([decision(SARA, 'CONFIRMED', at(20, 11), null)]);
    const r = await row();
    expect(r.confirmed).toBe(1);
    expect(r.medianConfirmMinutes).toBeNull();
  });

  it('says nothing rather than zero when there is nothing to measure', async () => {
    db.orderClaimHistory.findMany.mockResolvedValue([claim(SARA, at(20, 10))]);
    const r = await row();
    expect(r.medianConfirmMinutes).toBeNull();
    expect(r.confirmationRate).toBeNull();
  });
});

describe('the gap between one order and the next', () => {
  it('measures working time between consecutive claims', async () => {
    db.orderClaimHistory.findMany.mockResolvedValue([
      claim(SARA, at(20, 9, 0)),
      claim(SARA, at(20, 9, 30)),
      claim(SARA, at(20, 10, 45)),
    ]);
    // Gaps of 30 and 75 minutes; the middle of two is their mean.
    expect((await row()).medianGapMinutes).toBe(53);
  });

  it('does not count going home as idleness', async () => {
    // Last pull at 16:40, first of the next morning at 09:20.
    db.orderClaimHistory.findMany.mockResolvedValue([
      claim(SARA, at(20, 16, 40)),
      claim(SARA, at(21, 9, 20)),
    ]);
    expect((await row()).medianGapMinutes).toBe(40);
  });

  it('has no gap to report from a single claim', async () => {
    db.orderClaimHistory.findMany.mockResolvedValue([claim(SARA, at(20, 10))]);
    expect((await row()).medianGapMinutes).toBeNull();
  });
});

describe('the confirmation rate', () => {
  it('divides by what was decided, not by what was pulled', async () => {
    // Three confirmed, one rejected, and six still being worked. Counting
    // the open ones as failures punishes whoever is carrying the most work.
    db.orderClaimHistory.findMany.mockResolvedValue(
      Array.from({ length: 10 }, (_, i) => claim(SARA, at(20, 9, i * 5)))
    );
    db.orderStatusLog.findMany.mockResolvedValue([
      decision(SARA, 'CONFIRMED', at(20, 10)),
      decision(SARA, 'CONFIRMED', at(20, 11)),
      decision(SARA, 'CONFIRMED', at(20, 12)),
      decision(SARA, 'REJECTED', at(20, 13)),
    ]);
    const r = await row();
    expect(r.claimed).toBe(10);
    expect(r.decided).toBe(4);
    expect(r.confirmationRate).toBe(75);
  });

  it('treats a cancellation as a sale that did not happen', async () => {
    db.orderStatusLog.findMany.mockResolvedValue([
      decision(SARA, 'CONFIRMED', at(20, 10)),
      decision(SARA, 'CANCELLED', at(20, 11)),
    ]);
    const r = await row();
    expect(r.rejected).toBe(1);
    expect(r.confirmationRate).toBe(50);
  });

  it('keeps no-answer out of the decisions — the order is still alive', async () => {
    db.orderStatusLog.findMany.mockResolvedValue([
      decision(SARA, 'CONFIRMED', at(20, 10)),
      decision(SARA, 'NO_ANSWER', at(20, 11)),
    ]);
    const r = await row();
    expect(r.noAnswer).toBe(1);
    expect(r.decided).toBe(1);
    expect(r.confirmationRate).toBe(100);
  });
});

describe('the window', () => {
  it('bounds claims, decisions and attempts by the dates asked for', async () => {
    const start = at(20, 0);
    const end = at(21, 0);
    await teamPerformance({ ...input, start, end });
    for (const call of [
      db.orderClaimHistory.findMany.mock.calls[0][0],
      db.orderStatusLog.findMany.mock.calls[0][0],
      db.orderContactAttempt.groupBy.mock.calls[0][0],
    ]) {
      expect(call.where.createdAt).toEqual({ gte: start, lte: end });
    }
  });

  it('leaves current workload out of the window — it is a today question', async () => {
    await teamPerformance({ ...input, start: at(20, 0), end: at(21, 0) });
    expect(db.order.groupBy.mock.calls[0][0].where.createdAt).toBeUndefined();
  });

  it('scopes every source to this company and store', async () => {
    await teamPerformance(input);
    const wheres = [
      db.orderClaimHistory.findMany.mock.calls[0][0].where,
      db.orderStatusLog.findMany.mock.calls[0][0].where,
      db.orderContactAttempt.groupBy.mock.calls[0][0].where,
    ];
    for (const w of wheres) {
      expect(w.companyId).toBe('c1');
      expect(w.order).toEqual({ storeId: 's1' });
    }
  });
});

describe('who appears', () => {
  it('lists someone who only closed work pulled before the window', async () => {
    // No claims this week, but she confirmed four orders. A report that
    // keyed on claims alone would show her as having done nothing.
    db.orderStatusLog.findMany.mockResolvedValue([
      decision(SARA, 'CONFIRMED', at(20, 10)),
      decision(SARA, 'CONFIRMED', at(20, 11)),
    ]);
    const r = await row();
    expect(r.claimed).toBe(0);
    expect(r.confirmed).toBe(2);
  });

  it('returns an empty list rather than inventing rows of zeros', async () => {
    const res = await teamPerformance(input);
    expect(res.employees).toEqual([]);
    expect(res.totals.confirmationRate).toBeNull();
    expect(db.user.findMany).not.toHaveBeenCalled();
  });

  it('puts whoever carried the most work first', async () => {
    const OMAR = 'user-omar';
    db.user.findMany.mockResolvedValue([
      { id: SARA, name: 'سارة', role: 'CONFIRMATION_AGENT' },
      { id: OMAR, name: 'عمر', role: 'CONFIRMATION_AGENT' },
    ]);
    db.orderClaimHistory.findMany.mockResolvedValue([
      claim(SARA, at(20, 9)),
      claim(OMAR, at(20, 9, 5)),
      claim(OMAR, at(20, 9, 30)),
      claim(OMAR, at(20, 10)),
    ]);
    const { employees } = await teamPerformance(input);
    expect(employees.map((e) => e.name)).toEqual(['عمر', 'سارة']);
  });
});

describe('contact attempts', () => {
  it('shows no rate at all when nothing was logged', async () => {
    // Plenty of confirming happens on a phone the system never sees. A
    // column of zeros would read as an employee who called nobody.
    db.orderStatusLog.findMany.mockResolvedValue([decision(SARA, 'CONFIRMED', at(20, 10))]);
    db.orderContactAttempt.groupBy.mockResolvedValue([]);
    const r = await row();
    expect(r.attempts).toBe(0);
    expect(r.attemptsPerDecision).toBeNull();
  });

  it('divides logged attempts by what was decided', async () => {
    db.orderStatusLog.findMany.mockResolvedValue([
      decision(SARA, 'CONFIRMED', at(20, 10)),
      decision(SARA, 'REJECTED', at(20, 11)),
    ]);
    db.orderContactAttempt.groupBy.mockResolvedValue([{ employeeId: SARA, _count: { _all: 5 } }]);
    expect((await row()).attemptsPerDecision).toBe(2.5);
  });
});
