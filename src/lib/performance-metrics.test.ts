import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * THE TWO READINGS THAT DID NOT EXIST ANYWHERE.
 *
 * Everything else the score is built from is read through a function some
 * screen already draws. These two are new, and both have a way of turning
 * into a weapon if they are written carelessly: an entry-problem rate that
 * counts issues somebody was WRONG to raise lets a colleague damage a
 * record on purpose, and a discount share measured over discounted orders
 * alone makes two orders out of four look like two out of two hundred.
 */

const { db } = vi.hoisted(() => ({
  db: { order: { findMany: vi.fn() } },
}));
vi.mock('./db', () => ({ db }));

import { discountGrantedBy, discountUse, issuesRate } from './performance-metrics';

const SCOPE = {
  companyId: 'c1',
  storeId: 's1',
  start: new Date('2026-09-01T00:00:00Z'),
  end: new Date('2026-10-01T00:00:00Z'),
  calendar: { workHoursStart: '09:00', workHoursEnd: '18:00', weekendDays: [5, 6], timezone: 'Asia/Damascus' },
};

beforeEach(() => {
  vi.resetAllMocks();
});

describe('who granted a discount', () => {
  it('whoever confirmed it', () => {
    expect(discountGrantedBy({ confirmedById: 'agent', moderatorId: 'mod' })).toBe('agent');
  });

  it('and the moderator for an order that never reached an agent', () => {
    expect(discountGrantedBy({ confirmedById: null, moderatorId: 'mod' })).toBe('mod');
  });

  it('nobody, when nobody is recorded — never a guess', () => {
    expect(discountGrantedBy({ confirmedById: null, moderatorId: null })).toBeNull();
  });
});

describe('how heavily somebody discounts', () => {
  const order = (confirmedById: string | null, discount: number, total: number) => ({
    discountAmount: discount,
    totalAmount: total,
    confirmedById,
    moderatorId: 'mod',
  });

  it('is measured over every order they touched, not the discounted ones alone', async () => {
    // Two discounts out of two hundred is not the same person as two out of
    // two — and a denominator of "orders carrying a discount" says it is.
    db.order.findMany.mockResolvedValue([
      order('a', 10, 90),
      order('a', 0, 100),
      order('a', 0, 100),
      order('a', 0, 100),
    ]);
    const { byUser } = await discountUse(db as never, SCOPE);
    // 10 given away out of a gross of 100 + 100 + 100 + 100.
    expect(byUser.get('a')!.share).toBeCloseTo(10 / 400, 6);
  });

  it('against what the order would have been before the discount', async () => {
    db.order.findMany.mockResolvedValue([order('a', 20, 80)]);
    const { byUser } = await discountUse(db as never, SCOPE);
    expect(byUser.get('a')!.gross).toBe(100);
    expect(byUser.get('a')!.share).toBeCloseTo(0.2, 6);
  });

  it('the shop’s own habit is pooled, so one small desk cannot move it', async () => {
    db.order.findMany.mockResolvedValue([
      order('big', 0, 1000),
      order('small', 50, 50), // half off, but on one tiny order
    ]);
    const { team } = await discountUse(db as never, SCOPE);
    // Pooled: 50 of 1100, not the average of 0% and 50%.
    expect(team.share).toBeCloseTo(50 / 1100, 6);
  });

  it('an order nobody is recorded against still counts for the shop, not for a person', async () => {
    db.order.findMany.mockResolvedValue([{ discountAmount: 30, totalAmount: 70, confirmedById: null, moderatorId: null }]);
    const { byUser, team } = await discountUse(db as never, SCOPE);
    expect(byUser.size).toBe(0);
    expect(team.discount).toBe(30);
  });

  it('a shop that discounted nothing has a share of zero, not a division by zero', async () => {
    db.order.findMany.mockResolvedValue([]);
    const { team } = await discountUse(db as never, SCOPE);
    expect(team.share).toBe(0);
  });
});

describe('how often an entry comes back as a problem', () => {
  it('counts the issues against the person who ENTERED the order', async () => {
    db.order.findMany.mockResolvedValue([
      { moderatorId: 'mod', issues: [{ id: 'i1' }] },
      { moderatorId: 'mod', issues: [] },
      { moderatorId: 'mod', issues: [] },
      { moderatorId: 'mod', issues: [] },
    ]);
    const map = await issuesRate(db as never, SCOPE);
    expect(map.get('mod')).toMatchObject({ issues: 1, orders: 4, rate: 0.25 });
  });

  it('and asks the database to leave out the ones that were thrown out', async () => {
    // A VOIDED issue is one somebody raised and was wrong about. Counting it
    // would let an agent damage a colleague's record by raising issues that
    // are then voided — the one way to turn a measurement into a weapon.
    db.order.findMany.mockResolvedValue([]);
    await issuesRate(db as never, SCOPE);
    expect(db.order.findMany.mock.calls[0][0].select.issues.where).toEqual({ status: { not: 'VOIDED' } });
  });

  it('somebody who entered nothing has no rate — not a perfect one', async () => {
    db.order.findMany.mockResolvedValue([]);
    const map = await issuesRate(db as never, SCOPE);
    expect(map.get('mod')).toBeUndefined();
  });

  it('reads this store and this window only', async () => {
    db.order.findMany.mockResolvedValue([]);
    await issuesRate(db as never, SCOPE);
    expect(db.order.findMany.mock.calls[0][0].where).toMatchObject({
      companyId: 'c1',
      storeId: 's1',
      createdAt: { gte: SCOPE.start, lt: SCOPE.end },
    });
  });
});
