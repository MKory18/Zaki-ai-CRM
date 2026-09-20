import crypto from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { db } from './db';
import { roundMinor } from './money';

type Tx = Prisma.TransactionClient | typeof db;

/**
 * SETTLEMENT — three sequential entities, never merged:
 *
 *   Statement : what the courier SAYS it owes (file hash, no duplicate import)
 *   Receipt   : what ACTUALLY arrived (many lines, each with its own wallet)
 *   Matching  : runs on demand AFTER the receipt
 *
 * Matching uses ONE key: the merchant reference, then the courier barcode.
 * NEVER the phone — two customers share a phone often enough to settle the
 * wrong order, and a wrong match is money moved against the wrong order.
 */

export function fileHash(content: string | Buffer): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

export interface ParsedStatementRow {
  merchantRef: string | null;
  barcode: string | null;
  amount: number;
  status: string | null;
  rawRow: string;
}

const HEADER_ALIASES: Record<keyof Omit<ParsedStatementRow, 'rawRow'>, string[]> = {
  merchantRef: ['merchant_ref', 'merchantref', 'reference', 'ref', 'order_number', 'ordernumber', 'المرجع', 'رقم الطلب'],
  barcode: ['barcode', 'tracking', 'tracking_number', 'awb', 'الباركود', 'رقم البوليصة'],
  amount: ['amount', 'cod', 'cod_amount', 'collected', 'total', 'المبلغ', 'التحصيل'],
  status: ['status', 'state', 'الحالة'],
};

function columnIndex(header: string[], field: keyof typeof HEADER_ALIASES): number {
  const names = HEADER_ALIASES[field];
  return header.findIndex((h) => names.includes(h.trim().toLowerCase().replace(/^﻿/, '')));
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

/**
 * Parse a courier CSV. Unknown columns are ignored, but a file without an
 * amount column is rejected: a statement with no amounts settles nothing.
 */
export function parseStatementCsv(content: string): { rows: ParsedStatementRow[]; total: number; error?: string } {
  const lines = content
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return { rows: [], total: 0, error: 'الملف فارغ أو بلا صفوف' };

  const header = splitCsvLine(lines[0]);
  const idx = {
    merchantRef: columnIndex(header, 'merchantRef'),
    barcode: columnIndex(header, 'barcode'),
    amount: columnIndex(header, 'amount'),
    status: columnIndex(header, 'status'),
  };
  if (idx.amount < 0) return { rows: [], total: 0, error: 'لا يوجد عمود للمبلغ في الملف' };
  if (idx.merchantRef < 0 && idx.barcode < 0) {
    return { rows: [], total: 0, error: 'الملف بلا مرجع تجاري ولا باركود — لا يمكن المطابقة' };
  }

  const rows: ParsedStatementRow[] = [];
  for (const line of lines.slice(1)) {
    const cells = splitCsvLine(line);
    const amount = Number(String(cells[idx.amount] ?? '').replace(/[^\d.-]/g, ''));
    if (!Number.isFinite(amount)) continue;
    rows.push({
      merchantRef: idx.merchantRef >= 0 ? cells[idx.merchantRef]?.trim() || null : null,
      barcode: idx.barcode >= 0 ? cells[idx.barcode]?.trim() || null : null,
      amount,
      status: idx.status >= 0 ? cells[idx.status]?.trim() || null : null,
      rawRow: line.slice(0, 500),
    });
  }

  const total = rows.reduce((sum, r) => sum + r.amount, 0);
  return { rows, total };
}

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
}): number {
  if (order.collectedAmount !== null && order.collectedAmount !== undefined) return Number(order.collectedAmount);
  if (order.shippingStatus === 'RETURNED' || order.shippingStatus === 'RETURN_REQUESTED') return 0;
  return Number(order.totalAmount);
}

export interface MatchOutcome {
  matched: number;
  mismatched: number;
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

  const outcome: MatchOutcome = { matched: 0, mismatched: 0, missingInSystem: 0, missingInStatement: 0 };
  const matchedOrderIds = new Set<string>();

  for (const line of lines) {
    // ONE key: merchant reference first, courier barcode second. Never phone.
    const order =
      (line.merchantRef
        ? await tx.order.findFirst({
            where: { companyId, storeId, merchantRef: line.merchantRef },
            select: { id: true, shippingStatus: true, totalAmount: true },
          })
        : null) ??
      (line.barcode
        ? await tx.order.findFirst({
            where: { companyId, storeId, trackingNumber: line.barcode },
            select: { id: true, shippingStatus: true, totalAmount: true },
          })
        : null);

    if (!order) {
      await tx.settlementMatch.create({
        data: {
          companyId, statementId, statementLineId: line.id,
          result: 'MISSING_IN_SYSTEM', statementAmount: line.amount,
          note: 'لا يوجد طلب بهذا المرجع أو الباركود',
        },
      });
      outcome.missingInSystem++;
      continue;
    }

    matchedOrderIds.add(order.id);
    const expected = roundMinor(expectedAmountFor(order), minorUnit);
    const stated = roundMinor(Number(line.amount), minorUnit);
    const difference = roundMinor(stated - expected, minorUnit);

    await tx.settlementMatch.create({
      data: {
        companyId, statementId, statementLineId: line.id, orderId: order.id,
        result: difference === 0 ? 'MATCHED' : 'MISMATCHED',
        matchedBy: line.merchantRef ? 'MERCHANT_REF' : 'BARCODE',
        expectedAmount: expected,
        statementAmount: stated,
        difference,
      },
    });
    if (difference === 0) outcome.matched++;
    else outcome.mismatched++;
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
    select: { id: true, shippingStatus: true, totalAmount: true },
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
