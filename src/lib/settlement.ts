import crypto from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { db } from './db';
// The ONE money function, reached through the helper that already takes an
// order's add-ons. The expectation is not allowed a formula of its own.
import { codForOrder, type OrderLineLike } from './delivery-fees';
import { roundMinor } from './money';
// The ONE reader for a figure that arrived in a file. A courier's money
// column is read through it, brackets and Arabic digits and all.
import { readStatementFigure } from './numeric-input';
import { receiptsInStatementCurrency } from './receipt-conversion';
import { looksLikeXlsx, readXlsxRows } from './xlsx-reader';

type Tx = Prisma.TransactionClient | typeof db;

/**
 * SETTLEMENT — three sequential entities, never merged:
 *
 *   Statement : what the courier SAYS it owes (file hash, no duplicate import)
 *   Receipt   : what ACTUALLY arrived (many lines, each with its own wallet)
 *   Matching  : runs on demand AFTER the receipt
 *
 * Matching keys on the SHIPMENT BARCODE. The courier assigns it when the
 * parcel is handed over — over the API for an integrated company — and it is
 * stored on the order as their reference, separate from our own order
 * number. Their statement is written in their identifier, so that is what
 * matching reads. Our merchant reference is the fallback.
 *
 * NEVER the phone — two customers share a phone often enough to settle the
 * wrong order, and a wrong match is money moved against the wrong order.
 *
 * A مندوب and any company without an API have no barcode coming back, so
 * they are settled BY HAND from the tracking screen, not by importing a
 * statement. See src/lib/couriers/README.md.
 */

export function fileHash(content: string | Buffer): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

export interface ParsedStatementRow {
  merchantRef: string | null;
  barcode: string | null;
  /**
   * What the courier actually hands over for this line — their net, after
   * they keep their delivery fee. This is the figure a receipt is measured
   * against, so it is the one stored as the amount.
   */
  amount: number;
  /** What the courier says they collected from the customer (COD). */
  collected: number | null;
  /** The delivery fee they deducted. */
  fee: number | null;
  status: string | null;
  rawRow: string;
}

type HeaderField = 'merchantRef' | 'barcode' | 'net' | 'collected' | 'fee' | 'status' | 'notes';

const HEADER_ALIASES: Record<HeaderField, string[]> = {
  merchantRef: ['merchant_ref', 'merchantref', 'reference', 'ref', 'order_number', 'ordernumber', 'invoice', 'invoicenumber', 'invoice_number', 'المرجع', 'رقم الطلب', 'رقم الفاتورة', 'رقم الإرسالية', 'رقم الارسالية'],
  barcode: ['barcode', 'tracking', 'tracking_number', 'awb', 'الباركود', 'رقم البوليصة', 'باركود الشحنة'],
  // The net is what arrives; prefer it over the COD when both are present.
  net: ['net', 'net_amount', 'الصافي', 'صافي', 'المستحق'],
  collected: ['amount', 'cod', 'cod_amount', 'collected', 'total', 'المبلغ', 'التحصيل'],
  fee: ['fee', 'delivery_fee', 'shipping_fee', 'cost', 'السعر', 'أجرة التوصيل', 'اجرة التوصيل', 'التوصيل'],
  status: ['status', 'state', 'الحالة'],
  // Couriers who have no reference column put the merchant's order number at
  // the start of the notes; that is where it is read from.
  notes: ['notes', 'note', 'remarks', 'الملاحظات', 'ملاحظات'],
};

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/^﻿/, '').replace(/\s+/g, ' ');
}

function columnIndex(header: string[], field: HeaderField): number {
  const names = HEADER_ALIASES[field].map(normalizeHeader);
  return header.findIndex((h) => names.includes(normalizeHeader(h)));
}

/**
 * A MONEY CELL OF A COURIER STATEMENT — READ, ABSENT, OR REFUSED BY NAME.
 *
 * What stood here was `String(value).replace(/[^\d.-]/g, '')` and then
 * `Number()` of the remains, which is the SAME defect the order importer
 * carried at `97530a6` — and this is the path that has run on real money.
 * Measured on the function as it stood, on the `net`, `collected` and `fee`
 * columns this reads:
 *
 *     '(50)'    -> 50      AN ACCOUNTING NEGATIVE LOST ITS SIGN. `(50)` is
 *                          how Excel and every accounting export write −50,
 *                          so a DEDUCTION on a courier's statement became a
 *                          CREDIT of the same size — and the statement
 *                          total, which is summed from these, moved by a
 *                          hundred on a fifty-unit deduction.
 *     '3,5'     -> 35      ten times
 *     '3,500'   -> 3500    right, by accident of the same strip
 *     '1.234,56'-> 1.23456 a European-formatted figure, destroyed
 *     '1e400'   -> 1400       '0x10' -> 10       '12abc' -> 12
 *     '12 345'  -> 12345      '50 ر.س' -> 50
 *     '٣٥٠٠'    -> null    refused — the one guard the importer lacked
 *
 * A STRIP DOES NOT REFUSE, IT REWRITES. Every line above is a different
 * number that then passes every check after it, is written to
 * `StatementLine`, is summed into `CourierStatement.totalAmount`, and is
 * what `runMatching` reconciles an order against. Nothing downstream can
 * tell that a character was thrown away.
 *
 * So the reading is `readStatementFigure`, in `numeric-input.ts` with the
 * other readers — `readTypedFigure`'s grammar plus the one notation a
 * courier's accounting export adds, the bracketed negative. It is a
 * fourteenth call site of ONE reader, not a fourteenth reader.
 *
 * AND THE THREE ANSWERS ARE KEPT APART, because two of them used to be one.
 * `toNumber` returned `null` both for «the column is not in this file» and
 * for «the cell is there and I cannot read it», and `parseStatementRows`
 * then did `if (amount === null) continue` — so an unreadable cell DROPPED
 * THE WHOLE LINE in silence. A courier's parcel then simply was not in the
 * statement, and the sweep reported it as one they never mentioned.
 *
 *   ''            → `null`         absent. The column is not in the file, or
 *                                  the courier said nothing about this
 *                                  figure. Nothing was lost, so nothing is
 *                                  refused.
 *   a figure      → the number     including a negative one.
 *   anything else → `UNREADABLE`   named, and the caller refuses.
 */
const UNREADABLE = Symbol('خانة مال لا تُقرأ');

function readMoneyCell(text: string): number | null | typeof UNREADABLE {
  if (text === '') return null;
  const value = readStatementFigure(text);
  return value === null ? UNREADABLE : value;
}

/** What to call a money column to an operator holding the file. */
const MONEY_COLUMN_NAME: Record<'net' | 'collected' | 'fee', string> = {
  net: 'الصافي',
  collected: 'التحصيل',
  fee: 'أجرة التوصيل',
};

/** "15132 - العميل طلب التأجيل" → "15132". */
export function refFromNotes(notes: string | null | undefined): string | null {
  const match = /^\s*([A-Za-z0-9][A-Za-z0-9_\/-]{2,})/.exec(String(notes ?? ''));
  return match ? match[1] : null;
}

/**
 * One CSV line into cells, tolerant of quotes and of comma, semicolon or
 * tab — which is what a spreadsheet exported in a different locale gives.
 *
 * Exported because the order importer reads the same kinds of file from the
 * same kinds of hand, and a second splitter would be a second set of quoting
 * bugs to find.
 */
export function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',' || ch === ';' || ch === '\t') {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

/** Turns a header row plus data rows into statement lines. */
export function parseStatementRows(
  header: string[],
  dataRows: string[][]
): { rows: ParsedStatementRow[]; total: number; error?: string } {
  const idx = {
    merchantRef: columnIndex(header, 'merchantRef'),
    barcode: columnIndex(header, 'barcode'),
    net: columnIndex(header, 'net'),
    collected: columnIndex(header, 'collected'),
    fee: columnIndex(header, 'fee'),
    status: columnIndex(header, 'status'),
    notes: columnIndex(header, 'notes'),
  };

  if (idx.net < 0 && idx.collected < 0) {
    return { rows: [], total: 0, error: 'لا يوجد عمود للمبلغ في الملف' };
  }
  if (idx.merchantRef < 0 && idx.barcode < 0 && idx.notes < 0) {
    return { rows: [], total: 0, error: 'الملف بلا مرجع تجاري ولا باركود — لا يمكن المطابقة' };
  }

  const at = (cells: string[], i: number) => (i >= 0 ? (cells[i] ?? '').toString().trim() : '');

  const rows: ParsedStatementRow[] = [];
  for (const [rowIndex, cells] of dataRows.entries()) {
    if (!cells.some((c) => String(c ?? '').trim())) continue;

    /**
     * ONE UNREADABLE MONEY CELL REFUSES THE WHOLE FILE, NAMED.
     *
     * The order importer refuses the ROW and lets the other rows through,
     * because it hands back rows for a person to look at one at a time and
     * each one is its own order. A STATEMENT IS NOT A LIST OF ROWS. It is
     * one claim — «this is what I owe you» — carried by
     * `CourierStatement.totalAmount`, which is the sum of these lines and is
     * what `receiptGap` measures the money that actually arrived against.
     * Import it with one line quietly left out and the claim is wrong by
     * that line, the gap is wrong by that line, and the operator is made to
     * write a `gapExplanation` for money nobody ever owed.
     *
     * AND THERE IS NOWHERE TO PUT A REFUSED LINE. `SettlementMatch.result`
     * has four words — MATCHED, MISMATCHED, MISSING_IN_STATEMENT,
     * MISSING_IN_SYSTEM — pinned to the schema's own comment by
     * `the-settlement-invariants.test.ts` §6, and not one of them means «the
     * courier wrote a figure we could not read». A fifth would be a column
     * comment, a migration, and four screens.
     *
     * So the refusal goes where this file already has a door: the
     * file-level `error`, which `POST /api/finance/statements` answers as
     * 400 `UNREADABLE_FILE` with this sentence in it. All or nothing is also
     * honest about what a statement is, and the operator can fix the cell
     * and upload again — the file hash changes with it, so the
     * duplicate-import guard does not stand in the way.
     *
     * The sentence names the row as the SHEET numbers it (the header is row
     * 1, so the first data row is 2) and quotes the cell back verbatim,
     * which is `97530a6`'s ruling and the only part of a refusal that lets
     * somebody act on it.
     */
    const money: Record<'net' | 'collected' | 'fee', number | null> = { net: null, collected: null, fee: null };
    for (const field of ['net', 'collected', 'fee'] as const) {
      const text = at(cells, idx[field]);
      const value = readMoneyCell(text);
      if (value === UNREADABLE) {
        return {
          rows: [],
          total: 0,
          error:
            `السطر ${rowIndex + 2}: خانة «${MONEY_COLUMN_NAME[field]}» تحمل «${text}» ولا تُقرأ رقماً. ` +
            'اكتب الرقم بالأرقام وحدها — والسالب بين قوسين مثل (50) أو بإشارة ناقص. ' +
            'الفاصلة غير مقبولة لأنّ «3,500» قد تكون 3500 وقد تكون 3.5.',
        };
      }
      money[field] = value;
    }
    const { collected, fee, net } = money;

    // The net is what the courier hands over. When the file gives only the
    // COD and the fee, derive it rather than treating the COD as received.
    //
    // A NEGATIVE NET SURVIVES THIS. `(50)` is −50 and stays −50: the courier
    // is deducting, so this parcel is money WE owe THEM, and `amount` is a
    // signed `Decimal(14,3)` that holds it. `runMatching` then reconciles
    // `stated − expected` with the sign intact, and `expectedAmountFor`
    // already states in words that it returns a negative expectation as it
    // stands rather than flooring it at zero. Clamping here would be the
    // same silence the strip had, wearing a `Math.max`.
    const amount = net ?? (collected !== null && fee !== null ? collected - fee : collected);
    // Null is ABSENT, never unreadable — an unreadable cell refused the file
    // above. A line the courier wrote no money against carries none, and the
    // sweep's MISSING_IN_STATEMENT is the word for a parcel no line names.
    if (amount === null) continue;

    const explicitRef = at(cells, idx.merchantRef);
    rows.push({
      merchantRef: explicitRef || refFromNotes(at(cells, idx.notes)),
      barcode: at(cells, idx.barcode) || null,
      amount,
      collected,
      fee,
      status: at(cells, idx.status) || null,
      rawRow: cells.join(' | ').slice(0, 500),
    });
  }

  const total = rows.reduce((sum, r) => sum + r.amount, 0);
  return { rows, total };
}

/**
 * Parse a courier statement, CSV or .xlsx.
 *
 * Unknown columns are ignored, but a file with no amount at all is rejected:
 * a statement that settles nothing is not a statement. Likewise a file with
 * no reference, barcode or notes to read a reference from — there would be
 * nothing to match against.
 */
export function parseStatement(
  content: string | Buffer | Uint8Array
): { rows: ParsedStatementRow[]; total: number; error?: string } {
  if (typeof content !== 'string' && looksLikeXlsx(content)) {
    let sheet: string[][];
    try {
      sheet = readXlsxRows(content);
    } catch (e) {
      return { rows: [], total: 0, error: e instanceof Error ? e.message : 'تعذّر قراءة ملف الإكسل' };
    }
    if (sheet.length < 2) return { rows: [], total: 0, error: 'الملف فارغ أو بلا صفوف' };
    return parseStatementRows(sheet[0], sheet.slice(1));
  }

  const text = typeof content === 'string' ? content : Buffer.from(content).toString('utf8');
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return { rows: [], total: 0, error: 'الملف فارغ أو بلا صفوف' };

  return parseStatementRows(splitCsvLine(lines[0]), lines.slice(1).map(splitCsvLine));
}

/** @deprecated Use parseStatement — it reads .xlsx too. */
export const parseStatementCsv = parseStatement;

/* ─────────────────────────────────────────────────────────────────────
 * WHAT THE COURIER OWES US FOR ONE ORDER.
 *
 * Measured end to end on a real order on 2026-10-02, and it was wrong on
 * every partial delivery in the database.
 *
 * The rule was `(collectedAmount ?? totalAmount) − deliveryFee`, and
 * `collectedAmount` is NULL on every partial delivery that exists.
 * `partial-delivery.ts` leaves it null deliberately, and its reason is
 * correct and written at length at the top of that file: the money is the
 * courier's statement's to write, and a figure typed at the door used to
 * remove the order from the very set the statement sweeps. The only writer
 * of that column is the statement import.
 *
 * So the `??` fell through to the FULL total of a parcel the customer only
 * partly took. Three units at 12 with a 2.5 fee, two taken:
 *
 *   paid at the door   24 goods + 2.5 fee  = 26.5
 *   the courier owes   26.5 − 2.5          = 24
 *   the system expected 38.5 − 2.5         = 36
 *
 * Twelve dinars the courier never had, demanded on the collection screen,
 * and a false MISMATCHED on every partial in the matching queues. Two
 * files, each right on its own — `partial-delivery.ts`'s own comment
 * already CLAIMED this function «reads the delivered lines rather than the
 * original total» — and the gap between them was the defect.
 *
 * So it reads the delivered lines, which is the fact the door DOES record:
 * `OrderItem.deliveredQty`, per line, written in the same transaction as
 * the status. And it subtracts the courier's RETURN fee when a return
 * receipt charged one — `ReturnReceipt.courierFeeAmount` was written by the
 * returns desk and read by nothing, while the courier deducts it in reality.
 *
 * AND THE WRONG CALL CANNOT BE WRITTEN. Every field is REQUIRED, including
 * `items` and `returnReceipt`: a caller that selected neither does not
 * compile, instead of silently getting the old total-based answer. An empty
 * `items` is the same mistake with the compiler talked round, so it throws.
 * `SETTLEMENT_ORDER_SELECT` is the one select that satisfies the shape, and
 * all three doors spread it rather than listing columns.
 *
 * AND READING THE LINES BROKE THE WHOLE DELIVERY, measured on 2026-10-02.
 *
 * `Order.totalAmount` is not the sum of the lines: the thank-you-page
 * upsell increments it and writes an `OrderAddOn` row with NO `OrderItem`
 * row at all. So the fix above, which stopped reading the total, dropped
 * the upsell money — on a FULL delivery, where the old rule had been right.
 *
 *   3 × 12 = 36 goods, fee 2.5, upsell accepted at 5 → total 43.5
 *   the customer pays 43.5, the courier keeps 2.5   → he owes 41
 *   the lines alone gave 36 + 2.5 − 2.5             → 36
 *
 * Five dinars short, `difference: 0`, the order marked SETTLED, nothing on
 * any screen, and an honest statement of 41 reported MISMATCHED. The same
 * defect had already been found and fixed one door down — see
 * `src/app/api/ops/shipment-cod-addons.test.ts:3-12`. So the reconstruction
 * goes through `codForOrder`, which already takes an order's add-ons, and
 * the add-ons are part of the required facts and of the one select.
 *
 * AND A LOST FILS, which the old rule did not have because it read
 * `totalAmount` at full precision. `OrderItem.unitPrice` is
 * `Decimal(12,2)`; JOD has minorUnit 3; `orders/route.ts:446` writes
 * `unitPrice = lineTotal / quantity`. A line of 3 for 10.000 stores 3.33,
 * and 3 × 3.33 is 9.990. `OrderItem.lineTotal` — the figure `computeCod`
 * itself wrote — was in the same row and unselected, so the rule reads that
 * and divides it per unit instead.
 * ───────────────────────────────────────────────────────────────────── */

/** One order line, as the settlement rule reads it. Any OrderItem row fits. */
export interface SettlementLine {
  /** Paid units shipped on this line. */
  quantity: number;
  /** Gift units: real stock, zero price — never part of the money. */
  freeQuantity: number;
  unitPrice: number | Prisma.Decimal;
  /** This line's share of the order discount, allocated at creation. */
  discountShare: number | Prisma.Decimal;
  /**
   * `quantity × unitPrice − discountShare`, AS `computeCod` WROTE IT.
   *
   * Read in preference to multiplying `unitPrice` back out, and the reason
   * is a lost fils. `OrderItem.unitPrice` is `Decimal(12,2)` while JOD has
   * minorUnit **3**, and `orders/route.ts` writes `unitPrice = lineTotal /
   * quantity`. Measured: one line of 3 units for 10.000 JOD stores
   * `unitPrice` 3.33, and `3 × 3.33` is 9.990 — ten fils under what the
   * customer was quoted, on every line whose total does not divide by its
   * quantity, plus a false MISMATCHED for exactly that gap. `lineTotal`
   * was in the same row, holding 10.00, and was not being selected.
   *
   * `lineTotal` is `Decimal(12,2)` too, so it is still two places — but
   * 10.00 and 10.000 are the same number. The loss came from DIVIDING a
   * 2-place figure and multiplying it back, which this does not do.
   */
  lineTotal: number | Prisma.Decimal;
  /**
   * Units the customer kept at the door. NULL until the door spoke — and
   * null on every line is what separates «the customer took two of three»
   * from «a status feed said DELIVERED and nobody counted anything».
   */
  deliveredQty: number | null;
}

/**
 * ONE THANK-YOU-PAGE UPSELL — money on the order with NO `OrderItem` row.
 *
 * See `addOns` on `SettlementFacts` for why this had to become part of the
 * rule. `price` is the unit price snapshotted when the customer accepted it.
 */
export interface SettlementAddOn {
  quantity: number;
  price: number | Prisma.Decimal;
}

/**
 * Everything the expectation is computed from. No field is optional: the
 * caller must have asked the database for all of it.
 */
export interface SettlementFacts {
  shippingStatus: string;
  /**
   * The COD: goods less discount, PLUS THE ADD-ONS, plus the fee unless it
   * is in the price. It is not the sum of the lines — see `addOns`.
   */
  totalAmount: number | Prisma.Decimal;
  /** What the courier's STATEMENT said they collected. Null until it lands. */
  collectedAmount: number | Prisma.Decimal | null;
  /** The fee the courier keeps out of what they collected. */
  deliveryFee: number | Prisma.Decimal | null;
  /** When true the fee is already inside the line prices. */
  priceIncludesDelivery: boolean;
  items: SettlementLine[];
  /**
   * THE UPSELL MONEY, WHICH IS NOT A LINE — and the regression that reading
   * the lines introduced, in FULL delivery rather than partial.
   *
   * The thank-you-page upsell does `totalAmount: { increment: addTotal }`,
   * creates an `OrderAddOn` row and creates **zero `OrderItem` rows**. So
   * the moment this rule stopped reading `totalAmount` and started reading
   * the lines, the upsell money left the expectation entirely.
   *
   * Measured, JOD (minorUnit 3): 3 units × 12 = 36, fee 2.5, upsell
   * accepted at 5 → `totalAmount` 43.5. The customer pays 43.5, the courier
   * keeps the 2.5, so he owes **41**. The lines alone gave
   * 36 + 2.5 − 2.5 = **36**: five dinars written off in silence on a WHOLE
   * delivery, with `difference: 0`, the order marked SETTLED, and an honest
   * statement of 41 reported MISMATCHED.
   *
   * The same defect was found and fixed one door down — see
   * `src/app/api/ops/shipment-cod-addons.test.ts:3-12`, «12 of 32 on every
   * upsold order, 37%». One order's money with two readers, so it is read
   * through `codForOrder`, which already takes add-ons and says in words
   * what omitting them does.
   */
  addOns: SettlementAddOn[];
  /** The returns desk's receipt, when the refused units have come back. */
  returnReceipt: { courierFeeAmount: number | Prisma.Decimal } | null;
}

/**
 * THE ONE SELECT THAT SATISFIES `SettlementFacts`.
 *
 * Spread into every `order.findMany`/`findFirst` whose rows are handed to
 * `expectedAmountFor` — and into the door's own select in
 * `partial-delivery.ts`, so the two cannot drift by a column. Listing the
 * columns by hand is how `items` came to be missing from all three doors at
 * once, and then how `addOns` and `lineTotal` came to be missing from the
 * select written to replace them.
 */
export const SETTLEMENT_ORDER_SELECT = {
  shippingStatus: true,
  totalAmount: true,
  collectedAmount: true,
  deliveryFee: true,
  priceIncludesDelivery: true,
  items: {
    select: {
      quantity: true,
      freeQuantity: true,
      unitPrice: true,
      discountShare: true,
      // The figure `computeCod` wrote. Recomputing it from `unitPrice`
      // loses a fils per indivisible line — see `SettlementLine.lineTotal`.
      lineTotal: true,
      deliveredQty: true,
    },
  },
  // Money on the order with no line of its own. Without it a WHOLE delivery
  // of an upsold order was five dinars short, written off on no screen.
  addOns: { select: { quantity: true, price: true } },
  returnReceipt: { select: { courierFeeAmount: true } },
} as const satisfies Prisma.OrderSelect;

/** What the door's money is built from: the lines it settled, and the order. */
export interface DoorFacts {
  items: SettlementLine[];
  addOns: SettlementAddOn[];
  priceIncludesDelivery: boolean;
  deliveryFee: number | Prisma.Decimal | null;
}

export interface DoorMoney {
  /** The order's own lines, delivered units only, discount already out. */
  goods: number;
  /** The upsell, which has no line and so cannot be refused at the door. */
  addOns: number;
  /** The fee charged: in full whatever was taken, zero when nothing was. */
  fee: number;
  /** Goods + add-ons + fee, as `computeCod` assembles them. */
  collected: number;
  /** Did the customer keep anything at all — a gift unit counts. */
  anythingTaken: boolean;
  /** Did the door speak at all? Null on every line means it did not. */
  recorded: boolean;
}

/**
 * This line's value per PAID unit, at full precision.
 *
 * `lineTotal` is the figure `computeCod` wrote for the whole line, so the
 * per-unit price is that figure divided by the line's quantity rather than
 * the 2-place `unitPrice` column — see `SettlementLine.lineTotal` for the
 * ten fils that costs.
 *
 * THERE IS NO FALLBACK, DELIBERATELY. One stood here for a day, reading
 * `quantity × unitPrice − discountShare` when the column was absent — the
 * schema's own definition of `lineTotal`, and the only honest reconstruction
 * available. It was removed because it was also the arithmetic that loses
 * the fils: a branch that silently returns the WRONG answer for a row that
 * forgot one column is not a floor, it is the defect this function exists to
 * fix, waiting behind an `if`. The type makes a real caller's omission a
 * compile error, and the two test doubles that lacked the column were given
 * it instead of being accommodated.
 */
function perUnit(item: SettlementLine): number {
  return Number(item.lineTotal) / item.quantity;
}

/**
 * WHAT THE CUSTOMER HANDED OVER AT THE DOOR, from the lines the door wrote.
 *
 * ONE function, called by both sides. `partial-delivery.ts` returns this as
 * `collectedAmount` for the screen to show as what we expect to be paid;
 * this file measures the courier's statement against it. They were the same
 * arithmetic written twice, which is how the first gap opened — each file
 * right on its own — so the second copy is gone and the door calls this.
 *
 * The assembly is `codForOrder`, which is `computeCod`: goods less discount,
 * PLUS THE ADD-ONS, plus the fee unless the price already contains it. A
 * third copy of that sum is precisely what left the upsell money on no
 * screen and five dinars written off per upsold order.
 *
 * The rules it keeps:
 *   · gift units are stock at zero price — `Math.min(delivered, quantity)`;
 *   · the fee is charged IN FULL whatever was taken, because the courier
 *     travelled to that door, and waived only when nothing was taken at all;
 *   · a fee already inside the line prices is not added a second time;
 *   · the add-ons ride with the parcel. They have no line, so nobody at the
 *     door can refuse one — they are collected when anything was.
 */
export function doorMoney(order: DoorFacts, minorUnit: number): DoorMoney {
  const fee = roundMinor(Number(order.deliveryFee ?? 0), minorUnit);
  const recorded = order.items.some((i) => i.deliveredQty != null);

  const delivered: OrderLineLike[] = [];
  let anythingTaken = false;
  for (const item of order.items) {
    const taken = item.deliveredQty ?? 0;
    if (taken <= 0) continue;
    // A unit left in the customer's hands is a delivery even when it is a
    // gift worth nothing: the courier travelled, and still holds the fee.
    anythingTaken = true;
    // Charge for paid units only; gift units are real stock at zero price.
    const paid = Math.min(taken, item.quantity);
    if (paid <= 0) continue;
    delivered.push({ quantity: paid, unitPrice: perUnit(item), discountShare: 0 });
  }

  const breakdown = codForOrder({
    lines: delivered,
    addOns: anythingTaken ? order.addOns ?? [] : [],
    deliveryFee: anythingTaken ? fee : 0,
    priceIncludesDelivery: order.priceIncludesDelivery,
    minorUnit,
  });

  return {
    // The discount is already out of `perUnit`, so the subtotal IS the net
    // goods and nothing is discounted twice.
    goods: breakdown.subtotal,
    addOns: breakdown.addOns,
    fee: anythingTaken ? fee : 0,
    collected: breakdown.cod,
    anythingTaken,
    recorded,
  };
}
/**
 * What we expect the courier to hand over for one order, NET — rounded by
 * the order's own currency minor unit, never a global rule.
 *
 * The statement's own figure wins when it exists; until then the expectation
 * is built from what the door recorded. A negative answer is returned as it
 * stands: a return fee larger than the goods the customer kept means we owe
 * the courier, and rounding that up to zero would hide a real debt.
 */
export function expectedAmountFor(order: SettlementFacts, minorUnit: number): number {
  if (order.shippingStatus === 'RETURNED' || order.shippingStatus === 'RETURN_REQUESTED') return 0;

  // An order has lines by construction. An empty array here is a caller who
  // satisfied the compiler without asking the database — the one way left to
  // get the old total-based answer by accident, so it is not available.
  if (order.items.length === 0) {
    throw new Error(
      'expectedAmountFor: order has no lines — spread SETTLEMENT_ORDER_SELECT so `items` is selected'
    );
  }

  const fee = roundMinor(Number(order.deliveryFee ?? 0), minorUnit);
  /**
   * THE RETURN LEG. The returns desk records what the courier charged to
   * carry the refused units back, and the courier deducts it from what they
   * remit. Nothing read this column, so a statement stated net of a return
   * fee read as short by exactly that fee.
   */
  const returnFee = roundMinor(Number(order.returnReceipt?.courierFeeAmount ?? 0), minorUnit);

  /**
   * THE DOOR'S OWN FIGURE, or the order's total when the door never spoke.
   *
   * Null `deliveredQty` on every line is a courier feed or a manual
   * transition that wrote DELIVERED and counted nothing. The order's total
   * is then the only fact there is — and it carries the add-on money, which
   * is why that branch was never the short one.
   */
  const door = doorMoney(order, minorUnit);
  const collected =
    order.collectedAmount !== null && order.collectedAmount !== undefined
      ? roundMinor(Number(order.collectedAmount), minorUnit)
      : door.recorded
        ? door.collected
        : roundMinor(Number(order.totalAmount), minorUnit);

  return roundMinor(collected - fee - returnFee, minorUnit);
}

export interface MatchOutcome {
  matched: number;
  mismatched: number;
  /** Of the mismatched, how many are a delivery-fee difference. */
  feeMismatched: number;
  missingInSystem: number;
  missingInStatement: number;
  /** The sweep hit its cap, so «not listed» is not the whole answer. */
  sweepTruncated?: boolean;
}

/**
 * How many delivered orders the «did the courier leave one out» sweep will
 * read. A cap is necessary — a busy month is a lot of rows — but a SILENT
 * one turns «none are missing» into «none of the first thousand», which
 * reads the same and is not. When it is hit, the outcome says so.
 */
export const SWEEP_LIMIT = 5000;

/**
 * Run matching for one statement. Called on demand, and only after a
 * receipt exists — the caller enforces that order.
 */
export async function runMatching(
  tx: Tx,
  params: { companyId: string; storeId: string; statementId: string; minorUnit: number }
): Promise<MatchOutcome> {
  const { companyId, storeId, statementId, minorUnit } = params;

  const lines = await tx.statementLine.findMany({ where: { statementId } });
  const statement = await tx.courierStatement.findFirst({
    where: { id: statementId, companyId },
    select: { id: true, deliveryProviderId: true, periodFrom: true, periodTo: true },
  });
  if (!statement) throw new Error('Statement not found');

  // Start clean: matching may be re-run after the operator fixes data.
  await tx.settlementMatch.deleteMany({ where: { statementId } });

  const outcome: MatchOutcome = { matched: 0, mismatched: 0, feeMismatched: 0, missingInSystem: 0, missingInStatement: 0 };
  const matchedOrderIds = new Set<string>();

  for (const line of lines) {
    // The key is the SHIPMENT BARCODE: the courier assigns it when the order
    // is handed to them — over the API for an integrated company — and it is
    // stored on the order as their reference, separate from our own order
    // number. It is their identifier for the parcel, so it is the identifier
    // their statement is written in.
    //
    // Our merchant reference is the fallback, for a courier who echoes it
    // back (or writes it in the notes) but whose barcode we never recorded.
    // Never the phone: two customers share one often enough to settle the
    // wrong order, and a wrong match is money moved against the wrong order.
    /*
     * SCOPED TO THE COURIER WHOSE STATEMENT THIS IS.
     *
     * A barcode is the COURIER's identifier, not ours — and there is no
     * unique index on `trackingNumber`, nor could there be one that means
     * anything across couriers: two companies issuing numeric sequences
     * collide as a matter of course. Unscoped, a statement from one courier
     * could attach a line to an order shipped with another whose barcode
     * happened to equal it, and the money was then compared and resolved
     * against the wrong order — silently, because `findFirst` has no
     * `orderBy` and simply returns one of them.
     *
     * The sweep below already asks the question this way
     * (`deliveryProviderId: statement.deliveryProviderId`); this half did
     * not, in the same function.
     *
     * The merchant-reference fallback stays company-wide ON PURPOSE: that
     * reference is OURS and `@@unique([companyId, merchantRef])` holds it, so
     * it names one order whoever is carrying the parcel. Scoping it would
     * break the match for an order that changed couriers after we sent it.
     */
    const byBarcode = line.barcode
      ? await tx.order.findFirst({
          where: {
            companyId,
            storeId,
            deliveryProviderId: statement.deliveryProviderId,
            trackingNumber: line.barcode,
          },
          select: { id: true, ...SETTLEMENT_ORDER_SELECT },
        })
      : null;
    const matchedByBarcode = byBarcode !== null;

    const order =
      byBarcode ??
      (line.merchantRef
        ? await tx.order.findFirst({
            where: { companyId, storeId, merchantRef: line.merchantRef },
            select: { id: true, ...SETTLEMENT_ORDER_SELECT },
          })
        : null);

    if (!order) {
      await tx.settlementMatch.create({
        data: {
          companyId, statementId, statementLineId: line.id,
          result: 'MISSING_IN_SYSTEM', statementAmount: line.amount,
          note: 'لا يوجد طلب بهذا الباركود أو المرجع',
        },
      });
      outcome.missingInSystem++;
      continue;
    }

    matchedOrderIds.add(order.id);
    // Rounded by the minor unit inside the rule itself, so the matcher and
    // the screen cannot round the same figure two different ways.
    const expected = expectedAmountFor(order, minorUnit);
    const stated = roundMinor(Number(line.amount), minorUnit);
    const difference = roundMinor(stated - expected, minorUnit);

    // The delivery fee is checked in its own right. With the price INCLUDING
    // delivery the customer pays one figure and the fee comes out of it, so a
    // fee higher than agreed does not look like an error — the money still
    // arrives, just less of it. Comparing both quantities names the cause.
    const expectedFee = roundMinor(Number(order.deliveryFee ?? 0), minorUnit);
    const statedFee = line.fee === null || line.fee === undefined ? null : roundMinor(Number(line.fee), minorUnit);
    const feeDifference = statedFee === null ? null : roundMinor(statedFee - expectedFee, minorUnit);

    // A returned parcel is charged no fee, so its fee is not compared.
    const feeWrong = feeDifference !== null && feeDifference !== 0 && expected > 0;

    await tx.settlementMatch.create({
      data: {
        companyId, statementId, statementLineId: line.id, orderId: order.id,
        result: difference === 0 && !feeWrong ? 'MATCHED' : 'MISMATCHED',
        // Record which key actually found it, not which one the line carries.
        matchedBy: matchedByBarcode ? 'BARCODE' : 'MERCHANT_REF',
        expectedAmount: expected,
        statementAmount: stated,
        difference,
        expectedFee,
        statementFee: statedFee,
        feeDifference,
        note: feeWrong && difference === 0
          ? `أجرة التوصيل ${statedFee} بدل ${expectedFee}`
          : null,
      },
    });
    if (difference === 0 && !feeWrong) outcome.matched++;
    else {
      outcome.mismatched++;
      if (feeWrong) outcome.feeMismatched++;
    }
  }

  // Orders we delivered in the period that the courier did not list at all.
  //
  // PARTIALLY_DELIVERED counts as delivered here. It is money: the customer
  // took some lines and paid for them, and the delivered lines say exactly
  // what was handed over. Sweeping only the full deliveries meant a courier
  // could leave every partial off their statement and nothing would say so
  // — the one check whose whole job is to catch what they did not mention.
  const delivered = await tx.order.findMany({
    where: {
      companyId,
      storeId,
      deliveryProviderId: statement.deliveryProviderId,
      shippingStatus: { in: ['DELIVERED', 'PARTIALLY_DELIVERED'] },
      ...(statement.periodFrom || statement.periodTo
        ? {
            deliveredAt: {
              ...(statement.periodFrom ? { gte: statement.periodFrom } : {}),
              ...(statement.periodTo ? { lte: statement.periodTo } : {}),
            },
          }
        : {}),
    },
    select: {
      id: true,
      ...SETTLEMENT_ORDER_SELECT,
      // How a courier names this parcel — needed to ask whether ANY of their
      // statements mentions it.
      trackingNumber: true, merchantRef: true,
    },
    take: SWEEP_LIMIT,
  });
  if (delivered.length === SWEEP_LIMIT) outcome.sweepTruncated = true;

  /**
   * «MISSING» MEANS NO STATEMENT MENTIONS IT — NOT «THIS ONE DOES NOT».
   *
   * A courier issues a statement every day or two, each covering parcels
   * delivered over an overlapping window. Sweeping the period and flagging
   * everything this statement did not match therefore flags the parcels that
   * belong to the courier's OTHER statements — which is most of the shop.
   *
   * Measured on the real record the day this was found: 28 statements over
   * five weeks, and a single statement of 120 lines produced **940 rows,
   * 1754 of them «طلب مسلَّم لم يرد في كشف الشركة»**. Every one of those was
   * listed — on another statement. The screen was unreadable, and the one
   * check whose whole job is to catch a parcel the courier quietly left out
   * was buried under its own false alarms.
   *
   * So the question is asked of the whole record: does any line, on any
   * statement, name this parcel? Asked that way the answer does not depend
   * on which statement happens to be matched first — the old sweep gave a
   * different result for the same data depending on the order the operator
   * pressed the buttons in.
   */
  const refs = delivered.flatMap((o) => [o.trackingNumber, o.merchantRef].filter(Boolean) as string[]);
  const mentioned = new Set(
    (
      await tx.statementLine.findMany({
        where: {
          statement: { companyId },
          OR: [{ barcode: { in: refs } }, { merchantRef: { in: refs } }],
        },
        select: { barcode: true, merchantRef: true },
      })
    ).flatMap((l) => [l.barcode, l.merchantRef].filter(Boolean) as string[])
  );

  for (const order of delivered) {
    if (matchedOrderIds.has(order.id)) continue;
    if (
      (order.trackingNumber && mentioned.has(order.trackingNumber)) ||
      (order.merchantRef && mentioned.has(order.merchantRef))
    ) {
      continue;
    }
    await tx.settlementMatch.create({
      data: {
        companyId, statementId, orderId: order.id,
        result: 'MISSING_IN_STATEMENT',
        expectedAmount: expectedAmountFor(order, minorUnit),
        note: 'طلب مسلَّم لم يرد في كشف الشركة',
      },
    });
    outcome.missingInStatement++;
  }

  return outcome;
}

/**
 * Receipts total vs the statement total, and the gap that needs explaining.
 *
 * The receipts are converted into the STATEMENT's currency first. They are
 * stored in the currency of the wallet each one landed in, and this used to
 * `SUM(amount)` across all of them and print the answer under the statement's
 * currency code — dinars added to dollars and the total labelled dollars. See
 * lib/receipt-conversion. A receipt that cannot be expressed in the
 * statement's currency at all is counted apart and named, never dropped
 * silently into a total that then looks short for an invented reason.
 */
export async function receiptGap(tx: Tx, statementId: string, minorUnit: number) {
  const statement = await tx.courierStatement.findUnique({
    where: { id: statementId },
    select: { totalAmount: true, currencyCode: true, gapExplanation: true },
  });
  if (!statement) throw new Error('Statement not found');

  const rows = await tx.statementReceipt.findMany({
    where: { statementId },
    select: { amount: true, currencyCode: true, exchangeRate: true },
  });
  const { received, unconvertible } = receiptsInStatementCurrency(
    rows.map((r) => ({
      amount: Number(r.amount),
      currencyCode: r.currencyCode,
      exchangeRate: r.exchangeRate === null ? null : Number(r.exchangeRate),
    })),
    statement.currencyCode,
    minorUnit
  );
  const claimed = roundMinor(Number(statement.totalAmount), minorUnit);
  const gap = roundMinor(received - claimed, minorUnit);

  return {
    claimed,
    received,
    gap,
    /** Receipts whose money is in neither figure, because no rate says how. */
    unconvertible,
    needsExplanation: gap !== 0,
    explained: !!statement.gapExplanation,
  };
}
