import { roundMinor } from './money';

/**
 * WHAT ACTUALLY ARRIVED, EXPRESSED IN THE STATEMENT'S OWN CURRENCY.
 *
 * A statement is stated in one currency. Its receipts are not: the courier
 * pays part in cash into the Syrian box and part by transfer into a dinar
 * account, and each receipt is stored in the currency of the WALLET it landed
 * in, with the rate it changed at.
 *
 * The gap that decides whether a statement may be approved used to be
 * `SUM(amount) − statement.total`, summed straight across those currencies and
 * then printed on the screen under the statement's currency code. Adding
 * dinars to dollars and labelling the answer "dollars" is not a rounding
 * problem: it produces a gap that is nonsense in both directions — a real
 * shortfall that looks explained away, or a full payment that looks short.
 *
 * So each receipt is converted here, by the rate STORED WITH IT. The rate is
 * read the same way the wallet transfer reads it — the amount in the receiving
 * currency is the amount in the source currency times the rate — so going back
 * to the statement's currency divides by it. The rate is never recalculated:
 * the money changed hands once, at one rate, on one day.
 *
 * AND WHAT CANNOT BE CONVERTED IS NOT GUESSED. A receipt in another currency
 * with no rate stored (the route requires one now; rows from before it may not
 * have) is counted apart and reported, so the screen can say that a receipt is
 * missing its rate instead of quietly leaving its money out of the total.
 */

export interface ReceiptLine {
  amount: number;
  currencyCode: string;
  /** Statement currency → this receipt's currency. Null when they match. */
  exchangeRate: number | null;
}

export interface ReceiptConversion {
  /** The convertible receipts, in the statement's currency. */
  received: number;
  /** How many receipts could not be expressed in it at all. */
  unconvertible: number;
}

/** Sum the receipts of one statement in the statement's own currency. */
export function receiptsInStatementCurrency(
  lines: ReceiptLine[],
  statementCurrency: string,
  minorUnit: number
): ReceiptConversion {
  let received = 0;
  let unconvertible = 0;

  for (const line of lines) {
    if (line.currencyCode === statementCurrency) {
      received += line.amount;
      continue;
    }
    // A rate of zero or a negative one is not a rate; treat it as absent
    // rather than dividing by it and producing infinity in a money column.
    if (line.exchangeRate === null || !Number.isFinite(line.exchangeRate) || line.exchangeRate <= 0) {
      unconvertible += 1;
      continue;
    }
    received += line.amount / line.exchangeRate;
  }

  return { received: roundMinor(received, minorUnit), unconvertible };
}
