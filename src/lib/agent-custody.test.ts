import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./db', () => ({ db: {} }));

import { agentCustody } from './agent-custody';

/**
 * What the agent is holding.
 *
 * A shipping company sends a statement; an agent sends nothing. Between
 * taking the parcels and handing back the cash, the company's goods and the
 * company's money are in one man's hands, and the system had no number for
 * either. So it is derived from the orders themselves — and the two ways
 * that derivation can lie both cost money:
 *
 *   Counting an order as still out after it was delivered says goods are
 *   missing that are not.
 *   Counting cash he has already handed over says he owes what he does not.
 */

const AGENT = { id: 'ag1', name: 'أبو علي', code: 'AGENT-1', kind: 'AGENT' };
const scope = { companyId: 'c1', storeId: 's1', minorUnit: 2, currencyCode: 'USD' };

const order = (over: Record<string, unknown> = {}) => ({
  id: Math.random().toString(36).slice(2),
  orderNumber: 'SY-1',
  merchantRef: null,
  shippingStatus: 'SHIPPED',
  shippedAt: new Date('2026-09-01'),
  deliveredAt: null,
  totalAmount: 20,
  collectedAmount: null,
  deliveryFee: 3,
  customer: { fullName: 'زبون' },
  region: { name: 'دمشق' },
  ...over,
});

const db = {
  deliveryProvider: { findFirst: vi.fn() },
  order: { findMany: vi.fn() },
} as never;

beforeEach(() => {
  vi.clearAllMocks();
  (db as any).deliveryProvider.findFirst.mockResolvedValue(AGENT);
  (db as any).order.findMany.mockResolvedValue([]);
});

describe('an agent’s custody', () => {
  it('separates what is still out from what he has collected', async () => {
    (db as any).order.findMany.mockResolvedValue([
      order({ shippingStatus: 'SHIPPED' }),
      order({ shippingStatus: 'OUT_FOR_DELIVERY' }),
      order({ shippingStatus: 'DELIVERED', collectedAmount: 23, deliveredAt: new Date() }),
    ]);

    const custody = (await agentCustody(db, 'ag1', scope))!;
    expect(custody.inHand).toHaveLength(2);
    expect(custody.owing).toHaveLength(1);
    expect(custody.totals.inHandCount).toBe(2);
  });

  it('owes us what he took at the door, not what the order was worth', async () => {
    // Partial delivery: the customer took less than was shipped.
    (db as any).order.findMany.mockResolvedValue([
      order({ shippingStatus: 'PARTIALLY_DELIVERED', totalAmount: 40, collectedAmount: 23, deliveryFee: 4 }),
    ]);

    const custody = (await agentCustody(db, 'ag1', scope))!;
    expect(custody.totals.collected).toBe(23);
    expect(custody.totals.fees).toBe(4);
    expect(custody.totals.balance).toBe(19);
  });

  it('nets his fees off what he owes', async () => {
    (db as any).order.findMany.mockResolvedValue([
      order({ shippingStatus: 'DELIVERED', collectedAmount: 20, deliveryFee: 3 }),
      order({ shippingStatus: 'DELIVERED', collectedAmount: 30, deliveryFee: 3 }),
    ]);

    const custody = (await agentCustody(db, 'ag1', scope))!;
    expect(custody.totals.collected).toBe(50);
    expect(custody.totals.fees).toBe(6);
    expect(custody.totals.balance).toBe(44);
  });

  it('can owe HIM money when the fees exceed what he collected', async () => {
    // Every door refused: he drove, he collected nothing, the fee still
    // stands for the trips that were made.
    (db as any).order.findMany.mockResolvedValue([
      order({ shippingStatus: 'PARTIALLY_DELIVERED', collectedAmount: 0, deliveryFee: 4 }),
    ]);

    const custody = (await agentCustody(db, 'ag1', scope))!;
    expect(custody.totals.balance).toBe(-4);
  });

  it('counts a failed delivery as still in his hands, not as money', async () => {
    (db as any).order.findMany.mockResolvedValue([
      order({ shippingStatus: 'FAILED_DELIVERY', totalAmount: 25 }),
      order({ shippingStatus: 'RETURN_REQUESTED', totalAmount: 15 }),
    ]);

    const custody = (await agentCustody(db, 'ag1', scope))!;
    expect(custody.totals.inHandCount).toBe(2);
    expect(custody.totals.collected).toBe(0);
    expect(custody.totals.inHandValue).toBe(40);
  });

  it('asks only for what is unsettled and still out', async () => {
    await agentCustody(db, 'ag1', scope);
    const where = (db as any).order.findMany.mock.calls[0][0].where;

    expect(where.companyId).toBe('c1');
    expect(where.storeId).toBe('s1');
    expect(where.deliveryProviderId).toBe('ag1');
    // Settled cash is gone from custody: it reached us.
    const settledBranch = where.OR.find((b: any) => b.settlementStatus);
    expect(settledBranch.settlementStatus.in).not.toContain('SETTLED');
  });

  it('is zero for an agent holding nothing, not missing', async () => {
    const custody = (await agentCustody(db, 'ag1', scope))!;
    expect(custody.totals).toMatchObject({ inHandCount: 0, collected: 0, fees: 0, balance: 0 });
  });

  it('refuses a provider that is not ours', async () => {
    (db as any).deliveryProvider.findFirst.mockResolvedValue(null);
    expect(await agentCustody(db, 'someone-elses', scope)).toBeNull();
  });

  it('rounds to the currency, so the balance is payable', async () => {
    (db as any).order.findMany.mockResolvedValue([
      order({ shippingStatus: 'DELIVERED', collectedAmount: 10.005, deliveryFee: 3.333 }),
    ]);

    const custody = (await agentCustody(db, 'ag1', scope))!;
    expect(custody.totals.balance).toBe(Number(custody.totals.balance.toFixed(2)));
  });
});
