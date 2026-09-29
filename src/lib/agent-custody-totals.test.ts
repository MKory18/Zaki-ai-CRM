import { describe, expect, it } from 'vitest';
import { custodyTotals, isStillOut, wasDelivered, type CustodyRow } from './agent-custody-totals';

/**
 * What the agent is holding.
 *
 * The two ways this arithmetic can lie both cost money, and the second one was
 * live on this database:
 *
 *   counting an order as still out after it was delivered says goods are
 *   missing that are not;
 *   counting an order's TOTAL as cash he collected says he owes what nobody
 *   has established he ever took.
 */

const row = (over: Partial<CustodyRow> = {}): CustodyRow => ({
  shippingStatus: 'SHIPPED',
  orderValue: 20,
  collected: null,
  fee: 3,
  ...over,
});

describe('which side of custody a status falls on', () => {
  it('counts a failed delivery and a return request as still out with him', () => {
    expect(isStillOut('FAILED_DELIVERY')).toBe(true);
    expect(isStillOut('RETURN_REQUESTED')).toBe(true);
  });

  it('does not count a delivered parcel as still out', () => {
    expect(isStillOut('DELIVERED')).toBe(false);
    expect(isStillOut('PARTIALLY_DELIVERED')).toBe(false);
  });

  it('counts a partial delivery as a door he stood at', () => {
    expect(wasDelivered('PARTIALLY_DELIVERED')).toBe(true);
    expect(wasDelivered('SHIPPED')).toBe(false);
  });
});

describe('goods still out with him', () => {
  it('are counted at the order value, and add nothing to the money', () => {
    const t = custodyTotals([row({ orderValue: 25 }), row({ shippingStatus: 'FAILED_DELIVERY', orderValue: 15 })], 2);
    expect(t.inHandCount).toBe(2);
    expect(t.inHandValue).toBe(40);
    expect(t.collected).toBe(0);
    expect(t.balance).toBe(0);
  });
});

describe('cash he has taken', () => {
  it('is what was recorded at the door, not what the order was worth', () => {
    // Partial delivery: the customer took less than was shipped.
    const t = custodyTotals(
      [row({ shippingStatus: 'PARTIALLY_DELIVERED', orderValue: 40, collected: 23, fee: 4 })],
      2
    );
    expect(t.collected).toBe(23);
    expect(t.fees).toBe(4);
    expect(t.balance).toBe(19);
  });

  it('nets his fees off what he owes', () => {
    const t = custodyTotals(
      [
        row({ shippingStatus: 'DELIVERED', collected: 20, fee: 3 }),
        row({ shippingStatus: 'DELIVERED', collected: 30, fee: 3 }),
      ],
      2
    );
    expect(t.collected).toBe(50);
    expect(t.fees).toBe(6);
    expect(t.balance).toBe(44);
  });

  it('can leave US owing him when the fees exceed what he collected', () => {
    const t = custodyTotals([row({ shippingStatus: 'PARTIALLY_DELIVERED', collected: 0, fee: 4 })], 2);
    expect(t.balance).toBe(-4);
  });

  it('is rounded to the currency, so the balance is payable', () => {
    const t = custodyTotals([row({ shippingStatus: 'DELIVERED', collected: 10.005, fee: 3.333 })], 2);
    expect(t.balance).toBe(Number(t.balance.toFixed(2)));
  });
});

/**
 * ── THE DEFECT THIS FILE EXISTS FOR ──
 *
 * Measured on the dev database: 119 of 119 delivered orders carry
 * `collectedAmount = null`, because the door does not write it — the courier's
 * statement does, on approval. The screen read `collectedAmount ?? totalAmount`
 * and printed the result as «حصّله».
 */
describe('a delivered order that nobody has recorded an amount for', () => {
  const delivered = row({ shippingStatus: 'DELIVERED', orderValue: 20, collected: null, fee: 3 });

  it('is NOT counted as cash he collected', () => {
    const t = custodyTotals([delivered], 3);
    expect(t.collected, 'مبلغٌ غير مسجَّل ظهر كأنّه محصَّل').toBe(0);
  });

  it('does not put him in debt to us', () => {
    expect(custodyTotals([delivered], 3).balance).toBe(0);
  });

  it('does not count his fee as owed either — nothing about it is settled', () => {
    const t = custodyTotals([delivered], 3);
    expect(t.fees).toBe(0);
    expect(t.awaitingFees).toBe(3);
  });

  it('is reported as an order awaiting an amount, with the ORDER value', () => {
    const t = custodyTotals([delivered], 3);
    expect(t.awaitingCount).toBe(1);
    expect(t.awaitingValue).toBe(20);
    expect(t.hasUnconfirmed).toBe(true);
  });

  it('is not counted as still out with him either — he has been to the door', () => {
    expect(custodyTotals([delivered], 3).inHandCount).toBe(0);
  });

  it('never leaks into the confirmed figures beside a confirmed order', () => {
    const t = custodyTotals(
      [delivered, row({ shippingStatus: 'DELIVERED', orderValue: 50, collected: 50, fee: 5 })],
      3
    );
    expect(t.collected).toBe(50);
    expect(t.fees).toBe(5);
    expect(t.balance).toBe(45);
    expect(t.awaitingCount).toBe(1);
    expect(t.awaitingValue).toBe(20);
  });

  /** A recorded ZERO is a fact — the customer paid nothing — and is not the
   *  same as no record at all. */
  it('is distinguished from an amount recorded as zero', () => {
    const t = custodyTotals([row({ shippingStatus: 'DELIVERED', collected: 0, fee: 3 })], 3);
    expect(t.awaitingCount).toBe(0);
    expect(t.hasUnconfirmed).toBe(false);
    expect(t.fees).toBe(3);
    expect(t.balance).toBe(-3);
  });
});

describe('an agent holding nothing at all', () => {
  it('reports zeros and claims nothing is unconfirmed', () => {
    const t = custodyTotals([], 2);
    expect(t).toMatchObject({ inHandCount: 0, collected: 0, fees: 0, balance: 0, awaitingCount: 0, hasUnconfirmed: false });
  });
});
