import { roundMinor } from './money';

/**
 * WHAT AN AGENT IS HOLDING — the arithmetic, with nothing invented.
 *
 * Pure: it is handed rows and returns figures. No database, so the rule can be
 * tested against the case that actually broke it, and no screen can compute
 * its own version of a courier's balance beside this one.
 *
 * ── WHY IT WAS SPLIT OUT ──
 *
 * The custody screen used to read an order's money as
 * `collectedAmount ?? totalAmount`, and print the result under «حصّله» — "he
 * collected". On this database that is a claim about money nobody recorded:
 * all 119 delivered orders have `collectedAmount = null`, because the DOOR no
 * longer writes it — the courier's STATEMENT does, on approval. So the screen
 * announced «حصّل 20» and «صافي عليه 17» about an order whose collected amount
 * has never been established by anything. A reassurance that is not true is
 * worse than no reassurance, and this one was a demand on a person.
 *
 * So there are now two kinds of delivered order, and they never mix:
 *
 *   CONFIRMED — an amount was recorded. It is cash he owes us, it nets his
 *               fee off, and it is what the balance is made of.
 *   AWAITING  — delivered, and no amount recorded by anybody. Its value is
 *               reported as the value of the ORDERS, never as cash collected,
 *               and it is kept out of the balance entirely. The screen prints
 *               why in words.
 *
 * Goods still out with him are a third thing again: they are the order's own
 * value, and they are not money at all.
 */

/** Statuses that mean the parcel is still out with him. */
export const CUSTODY_IN_HAND = ['SHIPPED', 'OUT_FOR_DELIVERY', 'FAILED_DELIVERY', 'RETURN_REQUESTED'] as const;

/** Statuses that mean he stood at the door and the customer took the goods. */
export const CUSTODY_DELIVERED = ['DELIVERED', 'PARTIALLY_DELIVERED'] as const;

/** Settlement states that mean the cash has NOT reached us yet. */
export const CUSTODY_UNSETTLED = ['PENDING', 'PENDING_COLLECTION', 'COLLECTED'] as const;

/** True when this parcel is still out with him rather than delivered. */
export function isStillOut(shippingStatus: string): boolean {
  return (CUSTODY_IN_HAND as readonly string[]).includes(shippingStatus);
}

/** True when he has been to the door — whatever we know about the money. */
export function wasDelivered(shippingStatus: string): boolean {
  return (CUSTODY_DELIVERED as readonly string[]).includes(shippingStatus);
}

export interface CustodyRow {
  shippingStatus: string;
  /** What the order is worth. Always known. */
  orderValue: number;
  /** What he actually took at the door — null until something records it. */
  collected: number | null;
  /** His fee for that door. */
  fee: number;
}

export interface CustodyTotals {
  /** Parcels still out with him. */
  inHandCount: number;
  /** Value of the goods still out with him. Goods, not money. */
  inHandValue: number;
  /** Cash he has taken and not handed over — ONLY where an amount was recorded. */
  collected: number;
  /** His fees on those same confirmed orders. */
  fees: number;
  /** collected − fees. Positive means he owes us. Payable as it stands. */
  balance: number;
  /** Delivered orders for which NOBODY has recorded a collected amount. */
  awaitingCount: number;
  /** What those orders are worth. An expectation, never cash in hand. */
  awaitingValue: number;
  /** His fees on those same unconfirmed orders, also unsettled. */
  awaitingFees: number;
  /**
   * True when there is a delivered order with no recorded amount. The screen
   * must then not call the balance settled, matched or balanced.
   */
  hasUnconfirmed: boolean;
}

/**
 * Add up one agent's custody.
 *
 * `minorUnit` comes from the country's currency, because a balance that is not
 * expressible in the money it will be paid in is not a balance.
 */
export function custodyTotals(rows: CustodyRow[], minorUnit: number): CustodyTotals {
  const round = (n: number) => roundMinor(n, minorUnit);

  let inHandCount = 0;
  let inHandValue = 0;
  let collected = 0;
  let fees = 0;
  let awaitingCount = 0;
  let awaitingValue = 0;
  let awaitingFees = 0;

  for (const row of rows) {
    if (!wasDelivered(row.shippingStatus)) {
      // Still out with him: the goods' value, and not a single unit of money.
      inHandCount += 1;
      inHandValue += row.orderValue;
      continue;
    }
    if (row.collected === null) {
      // He went to the door and nothing has said what he took. Naming this
      // separately is the whole point of the file.
      awaitingCount += 1;
      awaitingValue += row.orderValue;
      awaitingFees += row.fee;
      continue;
    }
    collected += row.collected;
    fees += row.fee;
  }

  const collectedR = round(collected);
  const feesR = round(fees);

  return {
    inHandCount,
    inHandValue: round(inHandValue),
    collected: collectedR,
    fees: feesR,
    balance: round(collectedR - feesR),
    awaitingCount,
    awaitingValue: round(awaitingValue),
    awaitingFees: round(awaitingFees),
    hasUnconfirmed: awaitingCount > 0,
  };
}
