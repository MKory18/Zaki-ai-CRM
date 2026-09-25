import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * COMMISSION A CLOSED SPAN EARNED.
 *
 * "150 confirmed in a day pays more per order" cannot be answered while the
 * day is running — the hundred and fiftieth order is what makes the first
 * one worth more. So these rules are accrued afterwards, against the span,
 * and the entry carries what it was earned on because no order did.
 */

const { db } = vi.hoisted(() => ({
  db: {
    commissionRule: { findMany: vi.fn() },
    commissionEntry: { findFirst: vi.fn(), create: vi.fn() },
    user: { findMany: vi.fn(), findFirst: vi.fn() },
    order: { findMany: vi.fn(), count: vi.fn() },
    orderItem: { findMany: vi.fn() },
  },
}));
vi.mock('./db', () => ({ db }));

import { accrueForPeriod, lastClosedSpan } from './commission-period';

const AT = new Date('2026-09-25T10:00:00');
const span = { start: new Date('2026-09-24T00:00:00'), end: new Date('2026-09-25T00:00:00') };

const rule = (over: Record<string, unknown> = {}) => ({
  id: 'r1', storeId: 's1', appliesToRole: 'CONFIRMATION_AGENT', appliesToUserId: null,
  type: 'PER_ORDER', value: 0, metric: 'CONFIRMED_COUNT', period: 'DAILY',
  tiers: [{ from: 100, to: 149, value: 0.5 }, { from: 150, to: null, value: 1 }],
  minOrders: null, productId: null,
  effectiveFrom: new Date('2026-01-01'), effectiveTo: null, isActive: true,
  ...over,
});

/** N confirmed orders in the span, each worth 10. */
const confirmed = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `o${i}`, totalAmount: 12, deliveryFee: 2 }));

const accrue = () =>
  accrueForPeriod(db as never, {
    companyId: 'c1', storeId: 's1', span: 'DAILY',
    start: span.start, end: span.end, minorUnit: 2, currencyCode: 'JOD',
  });

beforeEach(() => {
  vi.resetAllMocks();
  db.commissionRule.findMany.mockResolvedValue([rule()]);
  db.user.findMany.mockResolvedValue([{ id: 'u1', role: 'CONFIRMATION_AGENT' }]);
  db.commissionEntry.findFirst.mockResolvedValue(null);
  db.commissionEntry.create.mockResolvedValue({});
  db.order.findMany.mockResolvedValue(confirmed(160));
  db.order.count.mockResolvedValue(160);
  db.orderItem.findMany.mockResolvedValue([]);
});

describe('what the span earned', () => {
  it('pays the band the count lands in, and records what it was earned on', async () => {
    const r = await accrue();
    expect(r.created).toBe(1);
    expect(r.amount).toBe(160); // 160 orders in the 150+ band, at 1 each

    const entry = db.commissionEntry.create.mock.calls[0][0].data;
    expect(entry).toMatchObject({
      userId: 'u1', ruleId: 'r1', amount: 160, counted: 160,
      periodStart: span.start, periodEnd: span.end, status: 'ACCRUED',
    });
    // No order earned it, so it carries none — and says so rather than
    // pointing at whichever order happened to be last.
    expect(entry.orderId).toBeNull();
    expect(entry.tierLabel).toBe('150+');
    // The month the span ENDED in: that is when the work was finished.
    expect(entry.periodMonth).toBe('2026-09');
  });

  it('pays the lower band on a quieter day', async () => {
    db.order.findMany.mockResolvedValue(confirmed(120));
    const r = await accrue();
    expect(r.amount).toBe(60); // 120 × 0.5
  });

  it('pays nothing below the first band, and says why', async () => {
    db.order.findMany.mockResolvedValue(confirmed(40));
    const r = await accrue();
    expect(r.created).toBe(0);
    expect(r.skipped.NO_TIER).toBe(1);
    expect(db.commissionEntry.create).not.toHaveBeenCalled();
  });
});

describe('a target beside its tiers', () => {
  it('pays ON TOP of them — a target is a one-band rule, not a replacement', async () => {
    // The owner's words: every target has a bonus INDEPENDENT of the tier
    // rules. A target needed no engine of its own: it is a rule whose single
    // band starts at the goal, and the accrual walks every matching rule.
    db.commissionRule.findMany.mockResolvedValue([
      rule(),
      rule({
        id: 'target', name: 'هدف المئة والخمسين', type: 'FIXED',
        tiers: [{ from: 150, to: null, value: 50, label: 'هدف ١٥٠' }],
      }),
    ]);
    const r = await accrue();
    expect(r.created).toBe(2);
    expect(r.amount).toBe(210); // 160 from the bands, 50 for reaching the goal

    const entries = db.commissionEntry.create.mock.calls.map((c) => c[0].data);
    expect(entries.map((e) => e.amount).sort((a, b) => a - b)).toEqual([50, 160]);
    // Each entry names the rule that earned it, so a payslip can be read.
    expect(entries.find((e) => e.amount === 50)?.tierLabel).toBe('هدف ١٥٠');
  });

  it('pays nothing for a goal that was not reached, while the bands still pay', async () => {
    db.order.findMany.mockResolvedValue(confirmed(120));
    db.commissionRule.findMany.mockResolvedValue([
      rule(),
      rule({ id: 'target', type: 'FIXED', tiers: [{ from: 150, to: null, value: 50 }] }),
    ]);
    const r = await accrue();
    expect(r.created).toBe(1);
    expect(r.amount).toBe(60); // 120 × 0.5, and no bonus
    expect(r.skipped.NO_TIER).toBe(1);
  });
});

describe('running the job twice', () => {
  it('does not pay twice — the second run finds the entry', async () => {
    db.commissionEntry.findFirst.mockResolvedValue({ id: 'existing' });
    const r = await accrue();
    expect(r.created).toBe(0);
    expect(r.skipped.ALREADY_ACCRUED).toBe(1);
    expect(db.commissionEntry.create).not.toHaveBeenCalled();
    // Looked up by person, rule and span — not by order, which there is none of.
    expect(db.commissionEntry.findFirst.mock.calls[0][0].where).toMatchObject({
      userId: 'u1', ruleId: 'r1', periodStart: span.start,
    });
  });
});

describe('which rules the span may use', () => {
  it('asks only for rules of this span that covered the WHOLE of it', async () => {
    await accrue();
    const where = db.commissionRule.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ companyId: 'c1', storeId: 's1', isActive: true, period: 'DAILY' });
    // A rule that began mid-span did not govern the days before it.
    expect(where.effectiveFrom).toEqual({ lte: span.start });
    expect(where.OR).toEqual([{ effectiveTo: null }, { effectiveTo: { gte: span.end } }]);
  });

  it('a rule for one named person applies to them alone', async () => {
    db.commissionRule.findMany.mockResolvedValue([rule({ appliesToUserId: 'u9', appliesToRole: null })]);
    db.user.findFirst.mockResolvedValue({ id: 'u9', role: 'CONFIRMATION_AGENT' });
    await accrue();
    expect(db.user.findMany).not.toHaveBeenCalled();
    expect(db.commissionEntry.create.mock.calls[0][0].data.userId).toBe('u9');
  });
});

describe('a minimum number of orders', () => {
  it('refuses a rate earned on too small a sample', async () => {
    // 100% delivery, out of two orders.
    db.commissionRule.findMany.mockResolvedValue([
      rule({ metric: 'DELIVERY_RATE', minOrders: 30, tiers: [{ from: 70, to: 100, value: 5 }], type: 'FIXED' }),
    ]);
    db.order.findMany.mockResolvedValue([
      { id: 'a', shippingStatus: 'DELIVERED', totalAmount: 12, deliveryFee: 2 },
      { id: 'b', shippingStatus: 'DELIVERED', totalAmount: 12, deliveryFee: 2 },
    ]);
    db.order.count.mockResolvedValue(2);

    const r = await accrue();
    expect(r.created).toBe(0);
    expect(r.skipped.BELOW_MINIMUM).toBe(1);
  });
});

describe('which span has closed', () => {
  it('is always the previous one — never the day being worked', () => {
    const { start, end } = lastClosedSpan('DAILY', AT);
    expect(start.toDateString()).toBe(new Date('2026-09-24').toDateString());
    expect(end.toDateString()).toBe(new Date('2026-09-25').toDateString());
    expect(end.getTime()).toBeLessThanOrEqual(AT.getTime());
  });

  it('a week runs Saturday to Saturday, like the business calendar', () => {
    const { start, end } = lastClosedSpan('WEEKLY', AT); // a Friday
    expect(start.getDay()).toBe(6); // Saturday
    expect(end.getDay()).toBe(6);
    expect((end.getTime() - start.getTime()) / 86_400_000).toBe(7);
  });

  it('a month is the previous calendar month', () => {
    const { start, end } = lastClosedSpan('MONTHLY', AT);
    expect(start.getMonth()).toBe(7); // August
    expect(end.getMonth()).toBe(8); // September 1st
    expect(start.getDate()).toBe(1);
  });
});
