/**
 * MONEY — the single COD/discount authority (contract PART 5).
 *
 * COD = price - discount + delivery fee.
 * If the price includes delivery: COD = price - discount, and the fee is
 * deducted from revenue instead of added to the customer's total. If ANY
 * line includes delivery, the whole order does.
 *
 * ONE function computes this, used by every screen and service. Precision
 * comes from the country's currency minor unit — never a global rounding
 * rule. The frontend renders these values; it never recomputes them.
 */

export interface MoneyLine {
  quantity: number;
  unitPrice: number;
  /** Gift units: real stock, zero price — never part of the money maths. */
  freeQuantity?: number;
}

export interface CodInput {
  lines: MoneyLine[];
  /** Order-level discount, allocated across lines proportionally. */
  discount?: number;
  deliveryFee?: number;
  priceIncludesDelivery?: boolean;
  /** Decimal places of the country's currency (JOD 3, SYP 2, ...). */
  minorUnit: number;
  /**
   * Products the customer added after ordering — the upsell on the thank-you
   * page (OrderAddOn). They are money the courier must collect.
   *
   * Kept apart from `lines` on purpose, for two reasons. The order's discount
   * was agreed on the original order, before any add-on existed, so it is
   * not spread over them; and `subtotal` stays the price of the order's own
   * lines, which is what `sellingPrice` records and what a discount may not
   * exceed. An add-on changes what is collected, not what was discounted.
   *
   * Before this existed, the add-on raised the order's total when it was
   * accepted, and the next recompute — creating the shipment — rebuilt the
   * total from the lines alone and wrote it back. The courier collected the
   * order without the add-on.
   */
  addOns?: MoneyLine[];
}

export interface CodBreakdown {
  /** Sum of quantity * unitPrice before discount. */
  subtotal: number;
  discount: number;
  deliveryFee: number;
  /** What the courier collects from the customer. */
  cod: number;
  /** What the business earns from the sale (fee deducted when included). */
  revenue: number;
  /** The add-ons' value, included in cod and revenue, never discounted. */
  addOns: number;
  /** Discount share per line, same order as the input lines. */
  discountShares: number[];
  /** quantity * unitPrice - discountShare per line. */
  lineTotals: number[];
}

/** Round to the currency's minor unit (half away from zero, no float drift). */
export function roundMinor(value: number, minorUnit: number): number {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** Math.max(0, Math.min(6, Math.trunc(minorUnit)));
  const scaled = value * factor;
  // Nudge away from binary-representation edges before rounding (2.675 * 100).
  const rounded = Math.round(Math.abs(scaled) + Number.EPSILON * Math.abs(scaled));
  return (scaled < 0 ? -rounded : rounded) / factor;
}

/**
 * Allocate an order discount across lines proportionally to their value.
 * Stored per line: without it a partial return refunds the wrong amount.
 * Rounding remainders land on the largest line so the shares always sum to
 * the discount exactly.
 */
export function allocateDiscount(lines: MoneyLine[], discount: number, minorUnit: number): number[] {
  const values = lines.map((l) => Math.max(0, l.quantity) * Math.max(0, l.unitPrice));
  const subtotal = values.reduce((a, b) => a + b, 0);
  const total = roundMinor(Math.max(0, Math.min(discount, subtotal)), minorUnit);
  if (total === 0 || subtotal === 0) return lines.map(() => 0);

  const shares = values.map((v) => roundMinor((v / subtotal) * total, minorUnit));
  const drift = roundMinor(total - shares.reduce((a, b) => a + b, 0), minorUnit);
  if (drift !== 0) {
    let largest = 0;
    for (let i = 1; i < values.length; i++) if (values[i] > values[largest]) largest = i;
    shares[largest] = roundMinor(shares[largest] + drift, minorUnit);
  }
  return shares;
}

/** The COD contract. Every screen and service calls this one function. */
export function computeCod(input: CodInput): CodBreakdown {
  const { lines, minorUnit } = input;
  const deliveryFee = roundMinor(Math.max(0, input.deliveryFee ?? 0), minorUnit);
  const values = lines.map((l) => roundMinor(Math.max(0, l.quantity) * Math.max(0, l.unitPrice), minorUnit));
  const subtotal = roundMinor(values.reduce((a, b) => a + b, 0), minorUnit);

  const discountShares = allocateDiscount(lines, input.discount ?? 0, minorUnit);
  const discount = roundMinor(discountShares.reduce((a, b) => a + b, 0), minorUnit);
  const lineTotals = values.map((v, i) => roundMinor(v - discountShares[i], minorUnit));
  const addOns = roundMinor(
    (input.addOns ?? []).reduce(
      (sum, a) => sum + roundMinor(Math.max(0, a.quantity) * Math.max(0, a.unitPrice), minorUnit),
      0
    ),
    minorUnit
  );
  const net = roundMinor(subtotal - discount + addOns, minorUnit);

  const includesDelivery = input.priceIncludesDelivery === true;
  const cod = includesDelivery ? net : roundMinor(net + deliveryFee, minorUnit);
  const revenue = includesDelivery ? roundMinor(net - deliveryFee, minorUnit) : net;

  return { subtotal, discount, deliveryFee, cod, revenue, addOns, discountShares, lineTotals };
}

/** Format for display with the currency's minor unit (tabular Arabic UI). */
export function formatMoney(value: number, currencyCode: string, minorUnit: number): string {
  return `${roundMinor(value, minorUnit).toFixed(minorUnit)} ${currencyCode}`;
}
