import type { Prisma } from '@prisma/client';
import { REJECTION_REASONS } from './confirmation-workflow';
import { orderSearchOr } from './order-filters';
import { typed } from './text-search';
import { LOST_STATUSES, type WinbackRule } from './winback';

/**
 * WHAT A SUPERVISOR ASKS OF THE LOST ORDERS, WRITTEN AS THE QUESTION THE DATABASE ANSWERS.
 *
 * «استرجاع الملغى — اعملو صفحات + فلاتر + بحث». The list used to read the last
 * five hundred lost orders from the last 120 days, ask «is this one eligible?»
 * of each in memory, and show what was left — so the five hundred was cut
 * BEFORE the question, a month with six hundred lost orders silently lost the
 * oldest hundred, and there was no way to page, narrow or search what remained.
 *
 * Eligibility now lives in the query. `winbackVerdict` is still the one rule —
 * written in JS, for the row, with its reason in words — and `viewWhere` is the
 * same rule written for the database. `winback-filters.test.ts` runs the two
 * over the same orders, at every boundary, and fails the day they disagree:
 * that is the only way «جاهز (23)» stays a promise that twenty-three rows will
 * appear.
 *
 * ── THE THREE VIEWS PARTITION THE LOST ORDERS ──
 *
 *   ready   — passes everything, and the cooling is over: the work;
 *   cooling — passes everything but the cooling: would be work in a few days;
 *   skipped — fails something else: shipped, already offered, itself a second
 *             chance, a reason the rule does not call for, or no closing date.
 *
 * Disjoint and exhaustive within the look-back — an order is in exactly one,
 * and the row says which rule put it there.
 *
 * NO NEW COLUMN. The closing date is what it always was: the LAST confirmation
 * log row whose new value is a lost status («an order rejected, re-opened and
 * rejected again cools from the second time»), written as «there is such a row,
 * and none newer than the cooling cutoff».
 *
 * This module imports nothing from the server: the screen reads it too.
 */

const DAY = 86_400_000;

export const VIEWS = ['ready', 'cooling', 'skipped'] as const;
export type View = (typeof VIEWS)[number];
/** Where the screen has always opened: the orders worth a call today. */
export const DEFAULT_VIEW: View = 'ready';
export const VIEW_AR: Record<View, string> = {
  ready: 'جاهز للاتصال',
  cooling: 'ما زال في المهلة',
  skipped: 'مستثنى من القاعدة',
};

/** «آخر N يوماً» — how long ago it was cancelled. */
export const PERIODS = ['7', '30', '90'] as const;
export type Period = (typeof PERIODS)[number];
export const PERIOD_AR: Record<Period, string> = { '7': 'آخر 7 أيام', '30': 'آخر 30 يوماً', '90': 'آخر 90 يوماً' };

export const isView = (v: unknown): v is View => typeof v === 'string' && (VIEWS as readonly string[]).includes(v);
export const isPeriod = (v: unknown): v is Period => typeof v === 'string' && (PERIODS as readonly string[]).includes(v);
export const isReason = (v: unknown): v is string => typeof v === 'string' && (REJECTION_REASONS as readonly string[]).includes(v);
export const MAX_PRODUCT_LENGTH = 120;
export const MAX_SEARCH_LENGTH = 100;

type Where = Prisma.OrderWhereInput;

/** A confirmation-log row recording a loss — the only rows whose date is «when it was cancelled». */
const lostLog = (extra: Prisma.OrderStatusLogWhereInput = {}): Prisma.OrderStatusLogWhereInput => ({
  statusType: 'CONFIRMATION',
  newValue: { in: [...LOST_STATUSES] },
  ...extra,
});

export interface WinbackScope {
  companyId: string;
  storeId?: string | null;
}

/**
 * EVERY LOST ORDER THE RULE READS — and nothing wider.
 *
 * The company and store are the person's; the two lost words and the look-back
 * are the rule's. An order made longer ago than the look-back is not in any
 * view, which is also what the offer's verdict says of it (`TOO_OLD`).
 */
export function baseWhere(scope: WinbackScope, rule: WinbackRule, now: Date): Where {
  return {
    companyId: scope.companyId,
    ...(scope.storeId ? { storeId: scope.storeId } : {}),
    confirmationStatus: { in: [...LOST_STATUSES] },
    createdAt: { gte: new Date(now.getTime() - rule.lookbackDays * DAY) },
  };
}

/** Passes every refusal in `winbackVerdict` except the cooling — written for the database. */
const candidate = (rule: WinbackRule): Where => ({
  shippedAt: null,
  replacedBy: null,
  replacesOrderId: null,
  rejectionReason: { in: [...rule.reasons] },
  // It HAS a closing date: at least one loss was logged. No row, no date, no call.
  statusLogs: { some: lostLog() },
});

/** The latest loss is newer than the cutoff ⟺ some loss row is. */
const stillCooling = (rule: WinbackRule, now: Date): Where => ({
  statusLogs: { some: lostLog({ createdAt: { gt: new Date(now.getTime() - rule.coolingDays * DAY) } }) },
});

/**
 * THE DATABASE'S READING OF EACH VIEW.
 *
 * `ready` is «a candidate, and not cooling»; `cooling` is «a candidate, and
 * cooling»; `skipped` is «not a candidate». The cutoff is `gt`, strictly, the
 * same line `winbackVerdict` draws: cooling is `now < closed + days`, which is
 * `closed > now - days`.
 */
export function viewWhere(view: View, rule: WinbackRule, now: Date): Where {
  switch (view) {
    case 'ready':
      return { AND: [candidate(rule), { NOT: stillCooling(rule, now) }] };
    case 'cooling':
      return { AND: [candidate(rule), stillCooling(rule, now)] };
    case 'skipped':
      return { NOT: candidate(rule) };
  }
}

export const reasonWhere = (reason: string): Where => ({ rejectionReason: reason });
export const productWhere = (name: string): Where => ({ productNameSnapshot: name });
/** Cancelled within the last N days — by the date of a loss row, not by when the order was made. */
export const periodWhere = (period: Period, now: Date): Where => ({
  statusLogs: { some: lostLog({ createdAt: { gte: new Date(now.getTime() - Number(period) * DAY) } }) },
});

export interface WinbackFilterInput {
  now: Date;
  rule: WinbackRule;
}

export interface WinbackApplied {
  view: View;
  reason: string | null;
  product: string | null;
  period: Period | null;
  q: string | null;
}

export type WinbackFilterResult =
  | { ok: true; view: View; viewClause: Where; clauses: Where[]; applied: WinbackApplied }
  | { ok: false; error: string; errorAr: string };

/**
 * THE URL'S FILTERS, READ ONCE, IN ONE PLACE.
 *
 * `all` and an absent value mean «no filter» — except the view, which is never
 * «all»: a list that mixed the work with the refused would be the screen it
 * replaced. A value this module does not know is REFUSED, in Arabic, rather
 * than ignored, because ignoring one answers a question nobody asked with a
 * list nobody filtered.
 */
export function winbackFilters(params: URLSearchParams, input: WinbackFilterInput): WinbackFilterResult {
  const refuse = (what: string, arabic: string, value: string): WinbackFilterResult => ({
    ok: false,
    error: `Unknown ${what}: ${value}`,
    errorAr: `${arabic} غير معروف: ${value}`,
  });
  const word = (name: string) => {
    const raw = params.get(name)?.trim();
    return raw && raw !== 'all' ? raw : undefined;
  };

  const rawView = word('view');
  if (rawView && !isView(rawView)) return refuse('winback view', 'العرض', rawView);
  const view: View = (rawView as View | undefined) ?? DEFAULT_VIEW;

  const applied: WinbackApplied = { view, reason: null, product: null, period: null, q: null };
  const clauses: Where[] = [];

  const reason = word('reason');
  if (reason) {
    if (!isReason(reason)) return refuse('rejection reason', 'سبب الإلغاء', reason);
    applied.reason = reason;
    clauses.push(reasonWhere(reason));
  }

  const product = word('product')?.slice(0, MAX_PRODUCT_LENGTH);
  if (product) {
    applied.product = product;
    clauses.push(productWhere(product));
  }

  const period = word('period');
  if (period) {
    if (!isPeriod(period)) return refuse('period', 'المدّة', period);
    applied.period = period;
    clauses.push(periodWhere(period, input.now));
  }

  const q = params.get('q')?.trim().slice(0, MAX_SEARCH_LENGTH);
  if (q) {
    applied.q = q;
    clauses.push({ OR: [...(orderSearchOr(q) as Where[]), { productNameSnapshot: typed(q) }] });
  }

  return { ok: true, view, viewClause: viewWhere(view, input.rule, input.now), clauses, applied };
}

/**
 * Oldest ORDER first, then the id: the ones closest to falling out of the look-back are the ones to call
 * while they still can be. (Ordering by the closing date would be the better word, and a database can only
 * order by a related row's date with a raw query; the order's age is the same ordering for every order closed
 * once, which is nearly all of them.)
 */
export const WINBACK_ORDER_BY: Prisma.OrderOrderByWithRelationInput[] = [{ createdAt: 'asc' }, { id: 'asc' }];
