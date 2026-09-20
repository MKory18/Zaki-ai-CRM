import crypto from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { db } from './db';
import { roundMinor } from './money';
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

function toNumber(value: unknown): number | null {
  const cleaned = String(value ?? '').replace(/[^\d.-]/g, '');
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** "15132 - العميل طلب التأجيل" → "15132". */
export function refFromNotes(notes: string | null | undefined): string | null {
  const match = /^\s*([A-Za-z0-9][A-Za-z0-9_\/-]{2,})/.exec(String(notes ?? ''));
  return match ? match[1] : null;
}

function splitCsvLine(line: string): string[] {
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
  for (const cells of dataRows) {
    if (!cells.some((c) => String(c ?? '').trim())) continue;

    const collected = toNumber(at(cells, idx.collected));
    const fee = toNumber(at(cells, idx.fee));
    const net = toNumber(at(cells, idx.net));

    // The net is what the courier hands over. When the file gives only the
    // COD and the fee, derive it rather than treating the COD as received.
    const amount = net ?? (collected !== null && fee !== null ? collected - fee : collected);
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

/**
 * What we expect the courier to hand over for one order. A partially
 * delivered order is compared against the POST-EVENT amount (what was
 * actually delivered and collected), never the original total.
 */
export function expectedAmountFor(order: {
  shippingStatus: string;
  totalAmount: number | Prisma.Decimal;
  // Set once partial delivery ships (Stage 9); until then it is null.
  collectedAmount?: number | Prisma.Decimal | null;
  /**
   * The courier keeps this out of what they collected. Pass it to compare
   * against a statement stated in NET terms — which is how a courier states
   * what they are actually handing over.
   */
  deliveryFee?: number | Prisma.Decimal | null;
}): number {
  if (order.shippingStatus === 'RETURNED' || order.shippingStatus === 'RETURN_REQUESTED') return 0;

  const collected =
    order.collectedAmount !== null && order.collectedAmount !== undefined
      ? Number(order.collectedAmount)
      : Number(order.totalAmount);

  return collected - Number(order.deliveryFee ?? 0);
}

export interface MatchOutcome {
  matched: number;
  mismatched: number;
  /** Of the mismatched, how many are a delivery-fee difference. */
  feeMismatched: number;
  missingInSystem: number;
  missingInStatement: number;
}

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
    const byBarcode = line.barcode
      ? await tx.order.findFirst({
          where: { companyId, storeId, trackingNumber: line.barcode },
          select: { id: true, shippingStatus: true, totalAmount: true, deliveryFee: true },
        })
      : null;
    const matchedByBarcode = byBarcode !== null;

    const order =
      byBarcode ??
      (line.merchantRef
        ? await tx.order.findFirst({
            where: { companyId, storeId, merchantRef: line.merchantRef },
            select: { id: true, shippingStatus: true, totalAmount: true, deliveryFee: true },
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
    const expected = roundMinor(expectedAmountFor(order), minorUnit);
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
  const delivered = await tx.order.findMany({
    where: {
      companyId,
      storeId,
      deliveryProviderId: statement.deliveryProviderId,
      shippingStatus: 'DELIVERED',
      ...(statement.periodFrom || statement.periodTo
        ? {
            deliveredAt: {
              ...(statement.periodFrom ? { gte: statement.periodFrom } : {}),
              ...(statement.periodTo ? { lte: statement.periodTo } : {}),
            },
          }
        : {}),
    },
    select: { id: true, shippingStatus: true, totalAmount: true, deliveryFee: true },
    take: 1000,
  });

  for (const order of delivered) {
    if (matchedOrderIds.has(order.id)) continue;
    await tx.settlementMatch.create({
      data: {
        companyId, statementId, orderId: order.id,
        result: 'MISSING_IN_STATEMENT',
        expectedAmount: roundMinor(expectedAmountFor(order), minorUnit),
        note: 'طلب مسلَّم لم يرد في كشف الشركة',
      },
    });
    outcome.missingInStatement++;
  }

  return outcome;
}

/** Receipts total vs the statement total, and the gap that needs explaining. */
export async function receiptGap(tx: Tx, statementId: string, minorUnit: number) {
  const statement = await tx.courierStatement.findUnique({
    where: { id: statementId },
    select: { totalAmount: true, gapExplanation: true },
  });
  if (!statement) throw new Error('Statement not found');

  const sum = await tx.statementReceipt.aggregate({ where: { statementId }, _sum: { amount: true } });
  const received = roundMinor(Number(sum._sum.amount ?? 0), minorUnit);
  const claimed = roundMinor(Number(statement.totalAmount), minorUnit);
  const gap = roundMinor(received - claimed, minorUnit);

  return {
    claimed,
    received,
    gap,
    needsExplanation: gap !== 0,
    explained: !!statement.gapExplanation,
  };
}
