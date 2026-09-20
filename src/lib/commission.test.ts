import { beforeEach, describe, expect, it, vi } from 'vitest';

/** Commission: rules as data with effective dates, accrual, reversal. */

const { db } = vi.hoisted(() => ({
  db: {
    order: { findFirst: vi.fn() },
    commissionRule: { findMany: vi.fn() },
    commissionEntry: { findFirst: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
  },
}));
vi.mock('./db', () => ({ db }));

import { accrueForOrder, commissionAmount, periodOf, reverseForOrder, ruleFor, type RuleLike } from './commission';

const rule = (over: Partial<RuleLike> = {}): RuleLike => ({
  id: 'r1',
  appliesToRole: 'MODERATOR',
  appliesToUserId: null,
  type: 'PERCENT',
  value: 5,
  effectiveFrom: new Date('2026-01-01'),
  effectiveTo: null,
  isActive: true,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  db.commissionEntry.create.mockImplementation(async ({ data }: any) => ({ id: 'e1', ...data }));
  db.commissionEntry.findFirst.mockResolvedValue(null);
  db.commissionEntry.findUnique.mockResolvedValue(null);
});

describe('ruleFor', () => {
  const at = new Date('2026-06-01');

  it('picks the rule in force on that day, not today', () => {
    const old = rule({ id: 'old', value: 5, effectiveFrom: new Date('2026-01-01'), effectiveTo: new Date('2026-05-31') });
    const current = rule({ id: 'current', value: 8, effectiveFrom: new Date('2026-06-01') });
    expect(ruleFor([old, current], { userId: 'u1', role: 'MODERATOR', at })?.id).toBe('current');
    expect(ruleFor([old, current], { userId: 'u1', role: 'MODERATOR', at: new Date('2026-03-01') })?.id).toBe('old');
  });

  it('prefers a rule written for the person over their role', () => {
    const roleRule = rule({ id: 'role', value: 5 });
    const userRule = rule({ id: 'user', appliesToRole: null, appliesToUserId: 'u1', value: 9 });
    expect(ruleFor([roleRule, userRule], { userId: 'u1', role: 'MODERATOR', at })?.id).toBe('user');
    expect(ruleFor([roleRule, userRule], { userId: 'u2', role: 'MODERATOR', at })?.id).toBe('role');
  });

  it('ignores inactive and not-yet-effective rules', () => {
    expect(ruleFor([rule({ isActive: false })], { userId: 'u1', role: 'MODERATOR', at })).toBeNull();
    expect(ruleFor([rule({ effectiveFrom: new Date('2027-01-01') })], { userId: 'u1', role: 'MODERATOR', at })).toBeNull();
  });
});

describe('commissionAmount', () => {
  it('computes a percentage and a fixed amount at the currency precision', () => {
    expect(commissionAmount(rule({ type: 'PERCENT', value: 5 }), 120, 3)).toBe(6);
    expect(commissionAmount(rule({ type: 'FIXED', value: 2.5 }), 120, 3)).toBe(2.5);
  });
});

describe('accrueForOrder', () => {
  const delivered = {
    id: 'o1', shippingStatus: 'DELIVERED', deliveredAt: new Date('2026-06-10'), currency: 'JOD',
    totalAmount: 100, deliveryFee: 0, priceIncludesDelivery: false,
    moderatorId: 'u1', claimedById: 'u1', confirmedById: null,
    moderator: { id: 'u1', role: 'MODERATOR' }, confirmer: null,
  };

  it('accrues on delivery, in the delivery month', async () => {
    db.order.findFirst.mockResolvedValue(delivered);
    db.commissionRule.findMany.mockResolvedValue([rule()]);

    const result = await accrueForOrder(db as never, { companyId: 'c1', orderId: 'o1', minorUnit: 3 });
    expect(result).toMatchObject({ created: 1, amount: 5 });
    expect(db.commissionEntry.create.mock.calls[0][0].data).toMatchObject({
      status: 'ACCRUED', periodMonth: '2026-06', userId: 'u1',
    });
  });

  it('pays nothing on a returned order', async () => {
    db.order.findFirst.mockResolvedValue({ ...delivered, shippingStatus: 'RETURNED' });
    db.commissionRule.findMany.mockResolvedValue([rule()]);

    expect(await accrueForOrder(db as never, { companyId: 'c1', orderId: 'o1', minorUnit: 3 })).toEqual({
      created: 0, skipped: 'RETURNED',
    });
    expect(db.commissionEntry.create).not.toHaveBeenCalled();
  });

  it('pays nothing before delivery', async () => {
    db.order.findFirst.mockResolvedValue({ ...delivered, shippingStatus: 'SHIPPED' });
    db.commissionRule.findMany.mockResolvedValue([rule()]);
    expect((await accrueForOrder(db as never, { companyId: 'c1', orderId: 'o1', minorUnit: 3 })).skipped).toBe('NOT_DELIVERED');
  });

  it('never pays twice for the same order and person', async () => {
    db.order.findFirst.mockResolvedValue(delivered);
    db.commissionRule.findMany.mockResolvedValue([rule()]);
    db.commissionEntry.findFirst.mockResolvedValue({ id: 'existing' });

    const result = await accrueForOrder(db as never, { companyId: 'c1', orderId: 'o1', minorUnit: 3 });
    expect(result.created).toBe(0);
    expect(db.commissionEntry.create).not.toHaveBeenCalled();
  });

  it('does not invent a commission when no rule covers the person', async () => {
    db.order.findFirst.mockResolvedValue(delivered);
    db.commissionRule.findMany.mockResolvedValue([rule({ appliesToRole: 'ACCOUNTANT' })]);
    expect((await accrueForOrder(db as never, { companyId: 'c1', orderId: 'o1', minorUnit: 3 })).skipped).toBe('NO_RULE');
  });
});

describe('reverseForOrder', () => {
  it('writes a negative entry in the CURRENT period, leaving the closed one alone', async () => {
    db.commissionEntry.findMany.mockResolvedValue([
      { id: 'e1', companyId: 'c1', orderId: 'o1', userId: 'u1', role: 'MODERATOR', ruleId: 'r1', amount: 5, currencyCode: 'JOD', periodMonth: '2026-06' },
    ]);

    const reversed = await reverseForOrder(db as never, { companyId: 'c1', orderId: 'o1', reason: 'مرتجع بعد التسليم' });
    expect(reversed).toBe(1);
    const data = db.commissionEntry.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ amount: -5, status: 'REVERSED', reversalOfId: 'e1' });
    expect(data.periodMonth).toBe(periodOf(new Date()));
  });

  it('does not reverse the same entry twice', async () => {
    db.commissionEntry.findMany.mockResolvedValue([{ id: 'e1', companyId: 'c1', orderId: 'o1', userId: 'u1', role: 'M', ruleId: null, amount: 5, currencyCode: 'JOD', periodMonth: '2026-06' }]);
    db.commissionEntry.findUnique.mockResolvedValue({ id: 'already' });
    expect(await reverseForOrder(db as never, { companyId: 'c1', orderId: 'o1', reason: 'x' })).toBe(0);
  });
});
