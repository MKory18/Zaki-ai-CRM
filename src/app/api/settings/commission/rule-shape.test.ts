import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * WHAT A RULE MAY SAY BEFORE IT IS SAVED.
 *
 * A commission rule is money. A rule that can be read two ways pays two
 * different amounts depending on which the code checks first, and nobody
 * finds out until a payslip is wrong — so the shape is refused at the door,
 * in the service, not hidden behind a disabled button.
 */

const { db, requireContext, requirePermission } = vi.hoisted(() => ({
  db: { commissionRule: { create: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() }, user: { findMany: vi.fn() } },
  requireContext: vi.fn(),
  requirePermission: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ db }));
vi.mock('@/lib/geo-context', () => ({ requireContext: (...a: unknown[]) => requireContext(...a) }));
vi.mock('@/lib/authorization', () => ({ requirePermission: (...a: unknown[]) => requirePermission(...a) }));
vi.mock('@/lib/audit', () => ({ logAudit: vi.fn() }));

import { GET, POST } from './route';

const post = (body: unknown) =>
  POST(new Request('http://localhost/x', { method: 'POST', body: JSON.stringify(body) }));

const base = {
  name: 'شرائح التأكيد اليومي',
  appliesToRole: 'CONFIRMATION_AGENT',
  type: 'PER_ORDER',
  metric: 'CONFIRMED_COUNT',
  period: 'DAILY',
  effectiveFrom: '2026-10-01',
};

beforeEach(() => {
  vi.resetAllMocks();
  requireContext.mockResolvedValue({ user: { id: 'u1' }, companyId: 'c1', storeId: 's1' });
  requirePermission.mockResolvedValue(undefined);
  db.commissionRule.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'r1', ...data, value: 0 }));
  db.commissionRule.findMany.mockResolvedValue([]);
  db.user.findMany.mockResolvedValue([]);
});

describe('bands', () => {
  it('are saved with the rule, and belong to THIS store', async () => {
    const tiers = [{ from: 100, to: 149, value: 0.5 }, { from: 150, to: null, value: 1 }];
    const res = await post({ ...base, tiers });
    expect(res.status).toBe(201);
    const data = db.commissionRule.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ storeId: 's1', metric: 'CONFIRMED_COUNT', period: 'DAILY', tiers });
  });

  it('are refused when they overlap — the answer would depend on their order', async () => {
    const res = await post({ ...base, tiers: [{ from: 100, to: 200, value: 1 }, { from: 150, to: 250, value: 2 }] });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('متداخلة');
    expect(db.commissionRule.create).not.toHaveBeenCalled();
  });

  it('are refused when "and upwards" is not last', async () => {
    const res = await post({ ...base, tiers: [{ from: 100, to: null, value: 1 }, { from: 200, to: 300, value: 2 }] });
    expect(res.status).toBe(400);
    expect(db.commissionRule.create).not.toHaveBeenCalled();
  });

  it('a delivery-rate band above 100 is refused — it could never be reached', async () => {
    const res = await post({
      ...base, metric: 'DELIVERY_RATE', tiers: [{ from: 150, to: null, value: 1 }],
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('100');
  });
});

describe('a rule with no bands', () => {
  it('keeps its single value, the way every older rule works', async () => {
    const res = await post({ ...base, metric: 'ORDER_DELIVERED', period: 'PER_ORDER', type: 'PERCENT', value: 5 });
    expect(res.status).toBe(201);
    expect(db.commissionRule.create.mock.calls[0][0].data).toMatchObject({ value: 5, tiers: undefined });
  });

  it('is refused when it has no value either — it would pay nothing, silently', async () => {
    const res = await post({ ...base, metric: 'ORDER_DELIVERED', period: 'PER_ORDER', value: 0 });
    expect(res.status).toBe(400);
    expect(db.commissionRule.create).not.toHaveBeenCalled();
  });
});

describe('the metric and its span must agree', () => {
  it('refuses a daily count accrued per order — a day is not a fact about one order', async () => {
    const res = await post({ ...base, metric: 'CONFIRMED_COUNT', period: 'PER_ORDER', value: 1 });
    expect(res.status).toBe(400);
    expect(db.commissionRule.create).not.toHaveBeenCalled();
  });

  it('refuses a per-order metric given a span nobody closes it on', async () => {
    const res = await post({ ...base, metric: 'ORDER_DELIVERED', period: 'MONTHLY', value: 1 });
    expect(res.status).toBe(400);
  });
});

describe('a store with no rule in force', () => {
  it('is reported, so a silent zero is not read as a quiet month', async () => {
    db.commissionRule.findMany.mockResolvedValue([
      { id: 'old', value: 1, isActive: false, effectiveFrom: new Date('2026-01-01'), effectiveTo: new Date('2026-09-21'), appliesToUserId: null, tiers: null },
    ]);
    const body = await (await GET()).json();
    expect(body.noRuleInForce).toBe(true);
    expect(body.rules[0].inForce).toBe(false);
  });

  it('is not reported when one really is in force', async () => {
    db.commissionRule.findMany.mockResolvedValue([
      { id: 'live', value: 1, isActive: true, effectiveFrom: new Date('2026-01-01'), effectiveTo: null, appliesToUserId: null, tiers: null },
    ]);
    const body = await (await GET()).json();
    expect(body.noRuleInForce).toBe(false);
    expect(body.rules[0].inForce).toBe(true);
  });
});
