import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * THE NOON SHIFT, IN THE TABLE THAT REPORTS LATENESS.
 *
 * The unit test beside this one proves the calendar is chosen correctly.
 * This one proves attendance actually USES it — the two can drift, and the
 * day they do, somebody starts losing money for arriving on time.
 */

const { db } = vi.hoisted(() => ({
  db: {
    attendanceMark: { findMany: vi.fn() },
    orderClaimHistory: { findMany: vi.fn() },
    orderStatusLog: { findMany: vi.fn() },
    orderContactAttempt: { findMany: vi.fn() },
  },
}));
vi.mock('./db', () => ({ db }));

import { attendance } from './attendance';

const COUNTRY = {
  workHoursStart: '09:00',
  workHoursEnd: '17:00',
  weekendDays: [5, 6],
  timezone: 'UTC',
};

/** Arrived at 12:00 UTC on a Wednesday. */
const ARRIVED = new Date('2026-09-23T12:00:00Z');

beforeEach(() => {
  vi.resetAllMocks();
  db.attendanceMark.findMany.mockResolvedValue([{ userId: 'u1', kind: 'CHECK_IN', at: ARRIVED }]);
  db.orderClaimHistory.findMany.mockResolvedValue([]);
  db.orderStatusLog.findMany.mockResolvedValue([]);
  db.orderContactAttempt.findMany.mockResolvedValue([]);
});

const run = (shifts?: Map<string, { shiftStart: string | null; shiftEnd: string | null; restDays: string | null }>) =>
  attendance({
    companyId: 'c1',
    storeId: 's1',
    userIds: ['u1'],
    calendar: COUNTRY,
    shifts,
    start: new Date('2026-09-21T00:00:00Z'),
    end: new Date('2026-09-26T00:00:00Z'),
  });

describe('somebody whose day begins at noon', () => {
  it('is three hours late against the country — which is the bug', async () => {
    const rows = await run();
    expect(rows.get('u1')!.totalLateMinutes).toBe(180);
  });

  it('and is on time against their own shift', async () => {
    const rows = await run(new Map([['u1', { shiftStart: '12:00', shiftEnd: '20:00', restDays: null }]]));
    expect(rows.get('u1')!.totalLateMinutes).toBe(0);
    expect(rows.get('u1')!.daysLate).toBe(0);
  });

  it('and the end of the shift is theirs too', async () => {
    // Handed over at 18:00. That is an hour PAST the country's day and two
    // hours SHORT of theirs — so the flag must follow their shift, not the
    // country's, or a late shift can never be early and never be measured.
    db.attendanceMark.findMany.mockResolvedValue([
      { userId: 'u1', kind: 'CHECK_IN', at: ARRIVED },
      { userId: 'u1', kind: 'CHECK_OUT', at: new Date('2026-09-23T18:00:00Z') },
    ]);
    expect((await run()).get('u1')!.days[0].leftEarly).toBe(false);
    const own = await run(new Map([['u1', { shiftStart: '12:00', shiftEnd: '20:00', restDays: null }]]));
    expect(own.get('u1')!.days[0].leftEarly).toBe(true);
  });
});

describe('their own rest days', () => {
  it('a day they are not expected in is never counted as late', async () => {
    // Wednesday is weekday 3; make it their rest day.
    const rows = await run(new Map([['u1', { shiftStart: null, shiftEnd: null, restDays: '3' }]]));
    expect(rows.get('u1')!.totalLateMinutes).toBe(0);
    expect(rows.get('u1')!.days[0].lateMinutes).toBeNull();
  });
});

describe('everybody else', () => {
  it('is measured exactly as before, when no shift is passed at all', async () => {
    const withMap = await run(new Map());
    const without = await run();
    expect(withMap.get('u1')!.totalLateMinutes).toBe(without.get('u1')!.totalLateMinutes);
  });
});
