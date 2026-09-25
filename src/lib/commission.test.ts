import { beforeEach, describe, expect, it, vi } from 'vitest';

/** Commission: rules as data with effective dates, accrual, reversal. */

const { db } = vi.hoisted(() => ({
  db: {
    order: { findFirst: vi.fn() },
    commissionRule: { findMany: vi.fn() },
    commissionEntry: {
      findFirst: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(),
      updateMany: vi.fn(), aggregate: vi.fn(), groupBy: vi.fn(),
    },
  },
}));
vi.mock('./db', () => ({ db }));

import {
  accrueForOrder,
  commissionAmount,
  commissionByUserForOrders,
  commissionCostForOrders,
  periodOf,
  reverseForOrder,
  ruleFor,
  type RuleLike,
} from './commission';

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
    id: 'o1', storeId: 's1', shippingStatus: 'DELIVERED', deliveredAt: new Date('2026-06-10'), currency: 'JOD',
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

  it('earns on the sale and not on the courier fee, under both pricing modes', async () => {
    db.commissionRule.findMany.mockResolvedValue([rule({ type: 'PERCENT', value: 10 })]);

    // totalAmount holds the COD figure. Fee added on top: COD 110 = net 100 + 10.
    db.order.findFirst.mockResolvedValue({ ...delivered, totalAmount: 110, deliveryFee: 10, priceIncludesDelivery: false });
    expect((await accrueForOrder(db as never, { companyId: 'c1', orderId: 'o1', minorUnit: 3 })).amount).toBe(10);

    // Fee included: COD 110 is the net, so the sale itself is 100.
    vi.clearAllMocks();
    db.commissionEntry.create.mockImplementation(async ({ data }: any) => ({ id: 'e1', ...data }));
    db.commissionEntry.findFirst.mockResolvedValue(null);
    db.commissionRule.findMany.mockResolvedValue([rule({ type: 'PERCENT', value: 10 })]);
    db.order.findFirst.mockResolvedValue({ ...delivered, totalAmount: 110, deliveryFee: 10, priceIncludesDelivery: true });
    expect((await accrueForOrder(db as never, { companyId: 'c1', orderId: 'o1', minorUnit: 3 })).amount).toBe(10);
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


/**
 * A commission rule is a store's agreement with its own people.
 *
 * The rules were company-wide, so one store's arrangement paid out on
 * another store's deliveries — money leaving the wrong books, and nobody
 * notices until the month closes.
 */
describe("a rule pays only on its own store's deliveries", () => {
  const delivered = {
    id: 'o1', storeId: 's1', shippingStatus: 'DELIVERED', deliveredAt: new Date('2026-06-10'),
    currency: 'JOD', totalAmount: 100, deliveryFee: 0, priceIncludesDelivery: false,
    moderatorId: 'u1', claimedById: 'u1', confirmedById: null,
    moderator: { id: 'u1', role: 'MODERATOR' }, confirmer: null,
  };

  it("asks only for the order's store", async () => {
    db.order.findFirst.mockResolvedValue(delivered);
    db.commissionRule.findMany.mockResolvedValue([]);
    await accrueForOrder(db as never, { companyId: 'c1', orderId: 'o1', minorUnit: 3 });
    expect(db.commissionRule.findMany).toHaveBeenCalledWith({
      where: { companyId: 'c1', storeId: 's1', isActive: true },
    });
  });

  it('accrues nothing when this store has no rule of its own', async () => {
    db.order.findFirst.mockResolvedValue(delivered);
    db.commissionRule.findMany.mockResolvedValue([]); // another store's rules do not reach here
    const result = await accrueForOrder(db as never, { companyId: 'c1', orderId: 'o1', minorUnit: 3 });
    expect(result.created).toBe(0);
    expect(db.commissionEntry.create).not.toHaveBeenCalled();
  });
});

/**
 * WHAT THE PROFIT LINE IS ALLOWED TO SUBTRACT.
 *
 * These two are the only doors between the ledger and the rest of the app.
 * Both are scoped by the ORDERS asked about rather than by the entry's
 * period, because profit is asked about a window of orders and an entry
 * belongs to the order that generated it — an order delivered on the 31st
 * and reversed on the 2nd belongs to the same question both times.
 */
describe('commissionCostForOrders', () => {
  beforeEach(() => {
    db.commissionEntry.aggregate.mockResolvedValue({ _sum: { amount: null } });
  });

  it('sums the ledger for the orders asked about, not for a period', async () => {
    db.commissionEntry.aggregate.mockResolvedValue({ _sum: { amount: 42.5 } });
    expect(await commissionCostForOrders({ companyId: 'c1', status: 'DELIVERED' })).toBe(42.5);
    // The where nests under `order`, so the caller's order filter — country,
    // store, date window — carries through untouched.
    expect(db.commissionEntry.aggregate.mock.calls[0][0].where).toEqual({
      order: { companyId: 'c1', status: 'DELIVERED' },
    });
  });

  it('counts REVERSED entries too, because a reversal is a NEGATIVE entry', async () => {
    // Filtering them out is the bug this guards: the profit line would carry
    // commission on an order whose goods are back on the shelf. The accrual
    // and its reversal are both in the sum and cancel.
    await commissionCostForOrders({ companyId: 'c1' });
    const where = db.commissionEntry.aggregate.mock.calls[0][0].where;
    expect(JSON.stringify(where)).not.toContain('status');
  });

  it('no entries is zero, not null — the profit line subtracts a number', async () => {
    expect(await commissionCostForOrders({ companyId: 'c1' })).toBe(0);
  });

  it('turns a Prisma Decimal into a number', async () => {
    // A Decimal reaches JSON as a string and the profit arithmetic would
    // silently concatenate instead of subtracting.
    db.commissionEntry.aggregate.mockResolvedValue({ _sum: { amount: { toString: () => '7.25' } } });
    expect(await commissionCostForOrders({ companyId: 'c1' })).toBe(7.25);
  });
});

describe('commissionByUserForOrders', () => {
  beforeEach(() => {
    db.commissionEntry.groupBy.mockResolvedValue([]);
  });

  it('keys on the ENTRY’s userId, not on the order’s moderator', async () => {
    // An order can earn commission for somebody who is not its moderator of
    // record. The money belongs to whoever the RULE named.
    db.commissionEntry.groupBy.mockResolvedValue([
      { userId: 'u1', _sum: { amount: 10 } },
      { userId: 'u2', _sum: { amount: 4 } },
    ]);
    const map = await commissionByUserForOrders({ companyId: 'c1' });
    expect(map.get('u1')).toBe(10);
    expect(map.get('u2')).toBe(4);
    expect(db.commissionEntry.groupBy.mock.calls[0][0].by).toEqual(['userId']);
  });

  it('a person with no entries is absent, so the caller decides what zero looks like', async () => {
    expect((await commissionByUserForOrders({ companyId: 'c1' })).get('nobody')).toBeUndefined();
  });

  it('is one grouped read, not a query per person', async () => {
    await commissionByUserForOrders({ companyId: 'c1' });
    expect(db.commissionEntry.groupBy).toHaveBeenCalledTimes(1);
  });
});
