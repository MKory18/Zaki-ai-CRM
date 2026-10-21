// How a legacy «صحة بلس» row reads in this system — statuses, prices, phones.
//
// Pure functions, no database: the suite that gates every merge holds these
// (src/lib/legacy-map.test.ts), not only the person who runs the tool.
//
// Two of them are PORTS of app code, because this tool runs under plain
// `node` on the server and cannot import TypeScript: `canonicalPhone`
// (src/lib/phone-rules.ts) and `allocateDiscount` (src/lib/money.ts). The
// test runs both copies over the same inputs, so a change to the original
// that is not carried here fails CI instead of drifting quietly.

// ─────────────────────────── statuses ───────────────────────────
//
// The owner's ruling (2026-10-21): every order in the dump was confirmed.
// Only `status_id` is read — the old `status_order` / `delivery_status` /
// `payment_status` columns are ignored. «مغلق» is not stored; it is what
// `closingStages` reads off these fields: cash SETTLED, or a return receipt.
//
//   كل الطلبات مؤكدة
//   مطلوب تجهيزه      = مؤكد وتم شحنه
//   قيد التوصيل        = تم استلام الطلب الملغي بدون رسوم = مغلق
//   تم توصيله          = مثل تم استلام المبلغ
//   تم استلام المبلغ   = تم الاستلام + تم التحصيل = مغلق
//   تم استلام الطلب الملغي = تم استلام الطلب الملغي بدون رسوم = مغلق
//   ملغي / مفقود / ملغي من الشركة = ملغي قبل الشحن
//   مؤجل              = مؤجل
//   مكرر              = ملغي مكرر

const SHIPPED = { status: 'SHIPPED', confirmationStatus: 'CONFIRMED', shippingStatus: 'SHIPPED', settlementStatus: 'PENDING' };
const SETTLED = { status: 'DELIVERED', confirmationStatus: 'CONFIRMED', shippingStatus: 'DELIVERED', settlementStatus: 'SETTLED', collected: true };
// NOT_APPLICABLE is what the live returns desk writes (api/ops/returns).
const RETURN_RECEIVED = { status: 'RETURNED', confirmationStatus: 'CONFIRMED', shippingStatus: 'RETURNED', settlementStatus: 'NOT_APPLICABLE', returnReceipt: true };
const CANCELLED_BEFORE_SHIPPING = { status: 'CANCELLED', confirmationStatus: 'CONFIRMED', shippingStatus: 'CANCELLED', settlementStatus: 'CANCELLED' };

export const LEGACY_STATUS = {
  2:  { ...SHIPPED, label: 'مؤكد وتم شحنه' },
  4:  { ...RETURN_RECEIVED, label: 'تم استلام الطلب الملغي بدون رسوم' },
  5:  { ...SETTLED, label: 'تم الاستلام + تم التحصيل' },
  6:  { ...CANCELLED_BEFORE_SHIPPING, label: 'ملغي قبل الشحن' },
  8:  { status: 'POSTPONED', confirmationStatus: 'POSTPONED', shippingStatus: 'NOT_READY', settlementStatus: 'NOT_APPLICABLE', label: 'مؤجل' },
  9:  { ...CANCELLED_BEFORE_SHIPPING, rejectionReason: 'DUPLICATE_ORDER', label: 'ملغي مكرر' },
  12: { ...SETTLED, label: 'تم الاستلام + تم التحصيل' },
  13: { ...RETURN_RECEIVED, label: 'تم استلام الطلب الملغي بدون رسوم' },
  15: { ...CANCELLED_BEFORE_SHIPPING, label: 'ملغي قبل الشحن' },
  16: { ...CANCELLED_BEFORE_SHIPPING, label: 'ملغي قبل الشحن' },
};

/**
 * The fields one legacy status_id becomes. An id not in the table THROWS:
 * the old tool fell back to «مطلوب تجهيزه» for anything it did not know,
 * which would have shipped an order nobody confirmed.
 */
export function mapLegacyStatus(statusId) {
  const m = LEGACY_STATUS[parseInt(statusId, 10)];
  if (!m) throw new Error(`unknown legacy status_id ${statusId} — add it to LEGACY_STATUS, never guess`);
  return {
    status: m.status,
    confirmationStatus: m.confirmationStatus,
    shippingStatus: m.shippingStatus,
    settlementStatus: m.settlementStatus,
    rejectionReason: m.rejectionReason ?? null,
    collected: m.collected === true,
    returnReceipt: m.returnReceipt === true,
    label: m.label,
  };
}

/**
 * The timestamps a status implies. The dump records when a row was made and
 * when it last changed — nothing finer — so the order was confirmed (and,
 * if it left, shipped) when it was made, and reached its end when it last
 * changed.
 */
export function legacyTimestamps(mapped, createdAt, updatedAt) {
  const end = updatedAt || createdAt;
  const left = ['SHIPPED', 'DELIVERED', 'RETURNED'].includes(mapped.shippingStatus);
  return {
    confirmedAt: mapped.confirmationStatus === 'CONFIRMED' ? createdAt : null,
    shippedAt: left ? createdAt : null,
    deliveredAt: mapped.shippingStatus === 'DELIVERED' ? end : null,
    returnedAt: mapped.shippingStatus === 'RETURNED' ? end : null,
  };
}

// ─────────────────────────── prices ───────────────────────────

const r2 = (x) => Math.round(x * 100) / 100;
const num = (v) => (v === null || v === undefined || v === '' ? null : parseFloat(v));

/**
 * The price a line sold at. The line's own price is the sale price — 12,784
 * of the 17,056 lines differ from the variant's list price because they
 * sold in a bundle — so the variant only stands in when the line has NO
 * price at all.
 *
 * A recorded 0 is kept. In the dump all 13 zero lines are one-line orders
 * whose total is the shipping alone (free replacements, by the look of
 * them): giving them the list price would book revenue the door never
 * asked for. The price check flags them instead.
 */
export function resolveLinePrice(linePrice, variantPrice) {
  const p = num(linePrice);
  if (p !== null && Number.isFinite(p)) return { price: p, fromVariant: false };
  const v = num(variantPrice);
  return { price: v !== null && Number.isFinite(v) ? v : 0, fromVariant: v !== null && Number.isFinite(v) };
}

/**
 * Every way an order's recorded money disagrees with itself. Nothing is
 * corrected: the recorded total is what the door was asked for, so it is
 * imported as-is and these go in the report for a person to read.
 *
 *   order: { sub_total, discount, shipping_price, total }
 *   lines: [{ price, quantity }]   (prices already resolved)
 *   tableFee: the shipping_prices fee for this courier × region, or null
 *
 * @param {{ sub_total?: string|null, discount?: string|null, shipping_price?: string|null, total?: string|null }} order
 * @param {Array<{ price: string|number|null, quantity: string|number }>} lines
 * @param {number|null} [tableFee]
 */
export function checkOrderPrices(order, lines, tableFee = null) {
  const issues = [];
  const sub = num(order.sub_total) ?? 0;
  const discount = num(order.discount) ?? 0;
  const ship = num(order.shipping_price);
  const total = num(order.total) ?? 0;

  const linesSum = r2(lines.reduce((s, l) => s + (num(l.price) ?? 0) * parseInt(l.quantity, 10), 0));
  if (linesSum !== r2(sub)) issues.push({ code: 'LINES_NE_SUBTOTAL', expected: r2(sub), actual: linesSum });

  const expectedTotal = r2(sub - discount + (ship ?? 0));
  if (expectedTotal !== r2(total)) issues.push({ code: 'TOTAL_NE_FORMULA', expected: expectedTotal, actual: r2(total) });

  if (lines.some((l) => !(num(l.price) > 0))) issues.push({ code: 'LINE_PRICE_ZERO' });
  if (r2(total) < 0) issues.push({ code: 'NEGATIVE_TOTAL', actual: r2(total) });

  if (ship === null) issues.push({ code: 'SHIPPING_MISSING', expected: tableFee });
  else if (tableFee !== null && r2(ship) !== r2(tableFee)) {
    issues.push({ code: 'SHIPPING_NE_TABLE', expected: r2(tableFee), actual: r2(ship) });
  }
  return issues;
}

// ─────────────────────────── sheet orders ───────────────────────────

/**
 * The order's lines, priced so they add up to what the door asks for.
 *
 * A sheet gives one total per order. One line takes all of it. Several lines
 * share it in proportion to their list value (basePrice × quantity), the
 * remainder on the largest so the parts sum to the total exactly — the
 * delivery-inclusive reading of the manual door, where a line's price is
 * what the customer pays for that line.
 *
 * @template {{ basePrice: number, quantity: number }} L
 * @param {number} total
 * @param {L[]} lines
 * @param {number} minorUnit
 * @returns {Array<L & { lineTotal: number, unitPrice: number }>}
 */
export function priceLines(total, lines, minorUnit) {
  const values = lines.map((l) => Math.max(0, l.basePrice) * l.quantity);
  const sum = values.reduce((a, b) => a + b, 0);
  const totals = values.map((v) => roundMinor(sum > 0 ? (v / sum) * total : total / lines.length, minorUnit));
  const drift = roundMinor(total - totals.reduce((a, b) => a + b, 0), minorUnit);
  if (drift !== 0) {
    let largest = 0;
    for (let i = 1; i < values.length; i++) if (values[i] > values[largest]) largest = i;
    totals[largest] = roundMinor(totals[largest] + drift, minorUnit);
  }
  return lines.map((l, i) => ({ ...l, lineTotal: totals[i], unitPrice: roundMinor(totals[i] / l.quantity, 3) }));
}

// ─── PORT of src/lib/money.ts — roundMinor + allocateDiscount ───

export function roundMinor(value, minorUnit) {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** Math.max(0, Math.min(6, Math.trunc(minorUnit)));
  const scaled = value * factor;
  const rounded = Math.round(Math.abs(scaled) + Number.EPSILON * Math.abs(scaled));
  return (scaled < 0 ? -rounded : rounded) / factor;
}

export function allocateDiscount(lines, discount, minorUnit) {
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

// ─────────────────────────── phones ───────────────────────────
// PORT of src/lib/phone-rules.ts `canonicalPhone` (with latin-digits). The
// old `normPhone` here kept the 963 of «00963…», so a customer already in
// the store under «9…» came back as a second customer.

const DIAL_CODES = ['963', '962', '966', '971', '964', '20'].sort((a, b) => b.length - a.length);

function toLatinDigits(s) {
  return s
    .replace(/[٠-٩]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0x0660 + 0x30))
    .replace(/[۰-۹]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0x06f0 + 0x30));
}

export function canonicalPhone(raw) {
  const text = toLatinDigits(String(raw ?? '')).trim();
  if (!text) return '';
  const digits = text.replace(/\D/g, '');
  if (!digits) return '';
  const international = text.startsWith('+') || digits.startsWith('00');
  let rest = digits.startsWith('00') ? digits.slice(2) : digits;
  if (international) {
    for (const code of DIAL_CODES) {
      if (rest.startsWith(code) && rest.length - code.length >= 6) {
        rest = rest.slice(code.length);
        break;
      }
    }
  }
  return rest.replace(/^0+/, '');
}

/** The tool's phone key: canonical, or null when there are no digits. */
export function normPhone(raw) {
  return canonicalPhone(raw) || null;
}
