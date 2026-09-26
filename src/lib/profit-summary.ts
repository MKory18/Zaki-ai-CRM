/**
 * ONE SHAPE FOR THE PROFIT FIGURES.
 *
 * The screen kept its own idea of what a summary looks like, for the moment
 * before the server answers. The server's idea changed — `shippingAndCommissions`
 * was added so the two would be added once, on the side that knows the
 * rules — and the screen's copy was not updated.
 *
 * The screen then read `summary.shippingAndCommissions.toFixed(2)` on a
 * fallback that had no such field. Not a wrong number: a crash. The whole
 * profit screen rendered as "This page couldn't load", every time the
 * server was slow, restarting, or briefly unreachable — which is exactly
 * the moment the fallback existed to survive.
 *
 * So there is one shape, in one file, and both sides use it. A field added
 * on the server is a field the zero has, because it is the same list.
 */

export interface ProfitSummary {
  /** Delivered orders only — never the confirmed ones. */
  totalRevenue: number;
  totalCOGS: number;
  totalShipping: number;
  totalCommissions: number;
  /** The two above, added on the server so the books cannot disagree. */
  shippingAndCommissions: number;
  totalOperationalExpenses: number;
  netProfit: number;
  /** A percentage, not a fraction. Zero when there is no revenue to divide by. */
  profitMargin: number;
}

/**
 * What the screen shows before the first answer, and after a failed one.
 *
 * Zeroes rather than blanks: a figure that has not arrived reads as "no
 * money yet", which is wrong for a moment, where an empty frame reads as
 * "the system is broken", which is wrong until somebody investigates.
 */
export const ZERO_SUMMARY: ProfitSummary = {
  totalRevenue: 0,
  totalCOGS: 0,
  totalShipping: 0,
  totalCommissions: 0,
  shippingAndCommissions: 0,
  totalOperationalExpenses: 0,
  netProfit: 0,
  profitMargin: 0,
};

/** Every field name, for the guard that keeps the two sides in step. */
export const PROFIT_FIELDS = Object.keys(ZERO_SUMMARY) as (keyof ProfitSummary)[];
