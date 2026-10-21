import { describe, expect, it } from 'vitest';
import type { Prisma } from '@prisma/client';
import { REJECTION_REASONS } from './confirmation-workflow';
import {
  DEFAULT_VIEW,
  PERIODS,
  PERIOD_AR,
  VIEWS,
  VIEW_AR,
  WINBACK_ORDER_BY,
  baseWhere,
  isPeriod,
  isReason,
  isView,
  periodWhere,
  productWhere,
  reasonWhere,
  viewWhere,
  winbackFilters,
  type View,
} from './winback-filters';
import {
  DEFAULT_WINBACK_RULE,
  LOST_STATUSES,
  SELECTABLE_WINBACK_REASONS,
  winbackVerdict,
  type WinbackRule,
  type WinbackSource,
} from './winback';
import { repoFile, stripComments } from './guard-source';

/**
 * «جاهز (23)» IS A PROMISE THAT TWENTY-THREE ROWS WILL APPEAR.
 *
 * The lost orders used to be read five hundred at a time and judged in memory.
 * The judgement moved into the query, which means there are now TWO writings of
 * the one rule — `winbackVerdict` (JS, for a row, with its reason in words) and
 * `viewWhere` (Prisma, for the list and the counts) — and what is held here is
 * that they never disagree: the same orders, evaluated both ways, at every line
 * a rule draws.
 */

const NOW = new Date('2026-10-21T12:00:00.000Z');
const DAY = 86_400_000;
const ago = (days: number, extraMs = 0) => new Date(NOW.getTime() - days * DAY - extraMs);
const RULE = DEFAULT_WINBACK_RULE;

// ───────────────────────── a tiny Prisma `where` evaluator ─────────────────────────
//
// Only what the module writes: AND / OR / NOT, equality (null included), in,
// gt / gte / lte, and a relation's `some`. A condition it does not know THROWS,
// so the day the module writes one the evaluator cannot read, this fails loudly
// instead of agreeing with itself.

interface Log {
  statusType: string;
  newValue: string | null;
  createdAt: Date;
}
interface OrderRow {
  companyId: string;
  storeId: string;
  confirmationStatus: string;
  createdAt: Date;
  shippedAt: Date | null;
  replacedBy: { orderNumber: string } | null;
  replacesOrderId: string | null;
  rejectionReason: string | null;
  productNameSnapshot: string | null;
  statusLogs: Log[];
}

type Any = Record<string, any>;

function matches(where: Any, row: Any): boolean {
  return Object.entries(where).every(([key, cond]) => {
    if (key === 'AND') return (cond as Any[]).every((w) => matches(w, row));
    if (key === 'OR') return (cond as Any[]).some((w) => matches(w, row));
    if (key === 'NOT') return !matches(cond as Any, row);
    const value = row[key];
    if (cond === null) return value === null;
    if (cond instanceof Date || typeof cond !== 'object') {
      return cond instanceof Date ? value instanceof Date && value.getTime() === cond.getTime() : value === cond;
    }
    return Object.entries(cond as Any).every(([op, arg]) => {
      if (op === 'some') return (value as Any[]).some((child) => matches(arg as Any, child));
      if (op === 'in') return (arg as unknown[]).includes(value);
      if (!(value instanceof Date)) return false; // a comparison on null is never true
      const a = value.getTime();
      const b = (arg as Date).getTime();
      if (op === 'gt') return a > b;
      if (op === 'gte') return a >= b;
      if (op === 'lte') return a <= b;
      if (op === 'lt') return a < b;
      throw new Error(`the evaluator does not know «${op}»`);
    });
  });
}

const lost = (createdAt: Date, newValue = 'REJECTED'): Log => ({ statusType: 'CONFIRMATION', newValue, createdAt });

const order = (over: Partial<OrderRow> = {}): OrderRow => ({
  companyId: 'c1',
  storeId: 's1',
  confirmationStatus: 'REJECTED',
  createdAt: ago(40),
  shippedAt: null,
  replacedBy: null,
  replacesOrderId: null,
  rejectionReason: 'PRICE_TOO_HIGH',
  productNameSnapshot: 'منتج',
  statusLogs: [lost(ago(30))],
  ...over,
});

/** What the route does for each row: the closing date is the LAST loss row, and the verdict is taken with it. */
function verdictOf(o: OrderRow, rule: WinbackRule = RULE) {
  const last = o.statusLogs
    .filter((l) => l.statusType === 'CONFIRMATION' && (LOST_STATUSES as readonly string[]).includes(l.newValue ?? ''))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
  const source: WinbackSource = {
    confirmationStatus: o.confirmationStatus,
    rejectionReason: o.rejectionReason,
    rejectedAt: last?.createdAt ?? null,
    shippedAt: o.shippedAt,
    replacedByOrderNumber: o.replacedBy?.orderNumber ?? null,
    replacesOrderNumber: o.replacesOrderId ? 'ORD-X' : null,
    sellingPrice: 100,
    discountAmount: 0,
    createdAt: o.createdAt,
  };
  return winbackVerdict(source, NOW, rule);
}

const scope = { companyId: 'c1', storeId: 's1' };
const inBase = (o: OrderRow, rule: WinbackRule = RULE) => matches(baseWhere(scope, rule, NOW), o as unknown as Any);
const viewsOf = (o: OrderRow, rule: WinbackRule = RULE): View[] =>
  VIEWS.filter((v) => matches(viewWhere(v, rule, NOW), o as unknown as Any));

/** The view the VERDICT puts an order in, or null when the order is outside what the rule reads at all. */
function viewByVerdict(o: OrderRow, rule: WinbackRule = RULE): View | null {
  if (!inBase(o, rule)) return null;
  const v = verdictOf(o, rule);
  if (v.eligible) return 'ready';
  return v.code === 'COOLING' ? 'cooling' : 'skipped';
}

// ───────────────────────── the matrix ─────────────────────────

/** Every line a rule draws, one millisecond either side, and what a person would call ordinary. */
const COOLING_EDGES = [ago(0), ago(1), ago(13, -1), ago(14, 1), ago(14), ago(14, -1), ago(15), ago(60)];
const CREATED_EDGES = [ago(1), ago(119), ago(120, -1), ago(120), ago(120, 1), ago(400)];

function matrix(): { name: string; row: OrderRow }[] {
  const out: { name: string; row: OrderRow }[] = [];
  let i = 0;
  const add = (what: string, row: OrderRow) => out.push({ name: `${++i}. ${what}`, row });

  for (const closed of COOLING_EDGES) add(`closed ${((NOW.getTime() - closed.getTime()) / DAY).toFixed(6)} days ago`, order({ statusLogs: [lost(closed)] }));
  for (const made of CREATED_EDGES) add(`made ${((NOW.getTime() - made.getTime()) / DAY).toFixed(6)} days ago`, order({ createdAt: made, statusLogs: [lost(ago(30))] }));
  for (const status of ['REJECTED', 'CANCELLED', 'CONFIRMED', 'NEW', 'POSTPONED']) add(`status ${status}`, order({ confirmationStatus: status }));
  for (const reason of [...SELECTABLE_WINBACK_REASONS, 'DUPLICATE_ORDER', 'WRONG_NUMBER', 'FAKE_ORDER', 'MODERATOR_DATA_ERROR', null]) {
    add(`reason ${reason}`, order({ rejectionReason: reason }));
  }
  add('shipped', order({ shippedAt: ago(35) }));
  add('already offered', order({ replacedBy: { orderNumber: 'ORD-9' } }));
  add('itself a second chance', order({ replacesOrderId: 'o0' }));
  add('no log at all — no closing date', order({ statusLogs: [] }));
  add('only a non-lost log', order({ statusLogs: [{ statusType: 'CONFIRMATION', newValue: 'CONFIRMED', createdAt: ago(30) }] }));
  add('only a log of another kind', order({ statusLogs: [{ statusType: 'SHIPPING', newValue: 'REJECTED', createdAt: ago(30) }] }));
  add('lost twice, the last long ago', order({ statusLogs: [lost(ago(90)), lost(ago(40))] }));
  add('lost twice, the last just now — cooling from the second time', order({ statusLogs: [lost(ago(90)), lost(ago(2))] }));
  add('re-opened and lost again at the edge', order({ statusLogs: [lost(ago(60)), lost(ago(14, 1))] }));
  add('re-opened and lost again just inside', order({ statusLogs: [lost(ago(60)), lost(ago(14, -1))] }));
  add('cancelled by the no-answer rule', order({ confirmationStatus: 'CANCELLED', rejectionReason: 'NO_ANSWER_3_ATTEMPTS', statusLogs: [lost(ago(20), 'CANCELLED')] }));
  add('shipped AND cooling', order({ shippedAt: ago(1), statusLogs: [lost(ago(2))] }));
  add('wrong reason AND cooling', order({ rejectionReason: 'FAKE_ORDER', statusLogs: [lost(ago(2))] }));
  add('too old AND shipped', order({ createdAt: ago(400), shippedAt: ago(390) }));
  return out;
}

describe('one rule, two writings — over every boundary', () => {
  const cases = matrix();

  it.each(cases.map((c) => [c.name, c.row] as const))('— %s', (_name, row) => {
    const byQuery = viewsOf(row);
    const byVerdict = viewByVerdict(row);
    if (byVerdict === null) {
      // Outside what the rule reads: not in the base, so in no view the list can draw. The verdict agrees it is no work.
      expect(inBase(row)).toBe(false);
      const v = verdictOf(row);
      expect(v.eligible).toBe(false);
      if (!v.eligible) expect(v.code).not.toBe('COOLING');
    } else {
      expect(byQuery, 'exactly one view').toEqual([byVerdict]);
    }
  });

  it('and the matrix is not a toy: it reaches every view and every kind of refusal', () => {
    const seen = new Set(cases.map((c) => viewByVerdict(c.row)));
    expect(seen).toContain('ready');
    expect(seen).toContain('cooling');
    expect(seen).toContain('skipped');
    expect(seen).toContain(null);
    const codes = new Set(cases.map((c) => { const v = verdictOf(c.row); return v.eligible ? 'ELIGIBLE' : v.code; }));
    for (const code of ['ELIGIBLE', 'COOLING', 'NOT_REJECTED', 'ALREADY_SHIPPED', 'ALREADY_OFFERED', 'ALREADY_A_SECOND_CHANCE', 'REASON_NOT_WINBACK', 'NO_DATE', 'TOO_OLD']) {
      expect(codes, code).toContain(code);
    }
  });

  it('and the three views PARTITION what the rule reads — every order in the base is in one, never two, never none', () => {
    for (const { name, row } of cases) {
      if (inBase(row)) expect(viewsOf(row), name).toHaveLength(1);
    }
  });
});

describe('the same agreement under a rule the owner changed', () => {
  const rules: [string, WinbackRule][] = [
    ['thirty days of cooling', { ...RULE, coolingDays: 30 }],
    ['one day of cooling', { ...RULE, coolingDays: 1 }],
    ['a short look-back', { ...RULE, lookbackDays: 45 }],
    ['every selectable reason', { ...RULE, reasons: SELECTABLE_WINBACK_REASONS }],
    ['one reason only', { ...RULE, reasons: ['OTHER'] }],
  ];

  it.each(rules)('— %s', (_what, rule) => {
    for (const { name, row } of matrix()) {
      const byVerdict = viewByVerdict(row, rule);
      if (byVerdict === null) expect(inBase(row, rule), name).toBe(false);
      else expect(viewsOf(row, rule), name).toEqual([byVerdict]);
    }
  });

  it('and a reason the owner switched on moves an order from «مستثنى» to the work', () => {
    const refusal = order({ rejectionReason: 'OTHER' });
    expect(viewsOf(refusal)).toEqual(['skipped']);
    expect(viewsOf(refusal, { ...RULE, reasons: [...RULE.reasons, 'OTHER'] })).toEqual(['ready']);
  });

  it('and a longer cooling moves an order from the work to «ما زال في المهلة»', () => {
    const o = order({ statusLogs: [lost(ago(20))] });
    expect(viewsOf(o)).toEqual(['ready']);
    expect(viewsOf(o, { ...RULE, coolingDays: 30 })).toEqual(['cooling']);
  });

  it('and a shorter look-back takes an order out of every view — the list is the base AND the view, and the base is the look-back', () => {
    const o = order({ createdAt: ago(100) });
    const listed = (rule: WinbackRule) => (inBase(o, rule) ? viewsOf(o, rule) : []);
    expect(listed(RULE)).toEqual(['ready']);
    expect(listed({ ...RULE, lookbackDays: 60 })).toEqual([]);
  });
});

describe('the scope', () => {
  it('— is this company, this store, the two lost words and the look-back', () => {
    const where = baseWhere(scope, RULE, NOW) as Any;
    expect(where.companyId).toBe('c1');
    expect(where.storeId).toBe('s1');
    expect(where.confirmationStatus).toEqual({ in: ['REJECTED', 'CANCELLED'] });
    expect((where.createdAt as Any).gte.getTime()).toBe(ago(120).getTime());
  });

  it('and a company without a store selected has no store line — the list has always been company-wide then', () => {
    expect(baseWhere({ companyId: 'c1', storeId: null }, RULE, NOW)).not.toHaveProperty('storeId');
    expect(baseWhere({ companyId: 'c1' }, RULE, NOW)).not.toHaveProperty('storeId');
  });

  it('and another company’s or another store’s order is in no view', () => {
    expect(inBase(order({ companyId: 'c2' }))).toBe(false);
    expect(inBase(order({ storeId: 's2' }))).toBe(false);
  });
});

describe('the other filters', () => {
  it('— a reason, a product and a period each narrow, by what they say', () => {
    const o = order({ rejectionReason: 'PRICE_TOO_HIGH', productNameSnapshot: 'قطرة', statusLogs: [lost(ago(5))] });
    const m = (w: Prisma.OrderWhereInput) => matches(w as Any, o as unknown as Any);
    expect(m(reasonWhere('PRICE_TOO_HIGH'))).toBe(true);
    expect(m(reasonWhere('OTHER'))).toBe(false);
    expect(m(productWhere('قطرة'))).toBe(true);
    expect(m(productWhere('قطرة أخرى'))).toBe(false);
    expect(m(periodWhere('7', NOW))).toBe(true);
    expect(m(periodWhere('30', NOW))).toBe(true);
    const old = order({ statusLogs: [lost(ago(20))] });
    expect(matches(periodWhere('7', NOW) as Any, old as unknown as Any)).toBe(false);
    expect(matches(periodWhere('30', NOW) as Any, old as unknown as Any)).toBe(true);
  });

  it('and «cancelled within N days» is the DATE OF A LOSS ROW, not when the order was made', () => {
    const o = order({ createdAt: ago(100), statusLogs: [lost(ago(3))] });
    expect(matches(periodWhere('7', NOW) as Any, o as unknown as Any)).toBe(true);
    // A log of another kind, however recent, is not a cancellation.
    const other = order({ statusLogs: [{ statusType: 'SHIPPING', newValue: 'REJECTED', createdAt: ago(1) }, lost(ago(60))] });
    expect(matches(periodWhere('7', NOW) as Any, other as unknown as Any)).toBe(false);
  });

  it('and the boundary of a period is inclusive: exactly seven days ago is «آخر 7 أيام»', () => {
    expect(matches(periodWhere('7', NOW) as Any, order({ statusLogs: [lost(ago(7))] }) as unknown as Any)).toBe(true);
    expect(matches(periodWhere('7', NOW) as Any, order({ statusLogs: [lost(ago(7, 1))] }) as unknown as Any)).toBe(false);
  });
});

describe('the address', () => {
  const ask = (query: string, rule: WinbackRule = RULE) => winbackFilters(new URLSearchParams(query), { now: NOW, rule });

  it('— nothing chosen opens on the work, with no other filter', () => {
    const r = ask('');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.view).toBe(DEFAULT_VIEW);
      expect(DEFAULT_VIEW).toBe('ready');
      expect(r.clauses).toEqual([]);
      expect(r.applied).toEqual({ view: 'ready', reason: null, product: null, period: null, q: null });
      expect(r.viewClause).toEqual(viewWhere('ready', RULE, NOW));
    }
  });

  it('and «all» is no filter — and for the view it is the work, never a mix of the work and the refused', () => {
    const r = ask('view=all&reason=all&product=all&period=all');
    expect(r.ok && r.applied).toEqual({ view: 'ready', reason: null, product: null, period: null, q: null });
  });

  it.each([...VIEWS])('— the view «%s» is read as the view', (view) => {
    const r = ask(`view=${view}`);
    expect(r.ok && r.view).toBe(view);
    expect(r.ok && r.viewClause).toEqual(viewWhere(view, RULE, NOW));
  });

  it('and every chosen word is one more clause, in the reading order', () => {
    const r = ask(`reason=PRICE_TOO_HIGH&product=${encodeURIComponent('  قطرة  ')}&period=30&q=سارة`);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.clauses).toHaveLength(4);
    expect(r.clauses[0]).toEqual(reasonWhere('PRICE_TOO_HIGH'));
    expect(r.clauses[1]).toEqual(productWhere('قطرة'));
    expect(r.clauses[2]).toEqual(periodWhere('30', NOW));
    expect(Object.keys(r.clauses[3])).toEqual(['OR']);
    expect(r.applied).toMatchObject({ reason: 'PRICE_TOO_HIGH', product: 'قطرة', period: '30', q: 'سارة' });
  });

  it.each([
    ['view=everything', 'العرض غير معروف: everything'],
    ['reason=BOREDOM', 'سبب الإلغاء غير معروف: BOREDOM'],
    ['period=365', 'المدّة غير معروف: 365'],
  ])('— %s is refused in Arabic, never read as «everything»', (query, arabic) => {
    const r = ask(query);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errorAr).toBe(arabic);
      expect(r.error).toMatch(/^Unknown /);
    }
  });

  it('and the search asks every way an order is known — and the product too', () => {
    const r = ask('q=0790123456');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const or = (r.clauses[0] as { OR: Any[] }).OR;
    expect(or.map((c) => Object.keys(c)[0])).toEqual(['orderNumber', 'merchantRef', 'trackingNumber', 'customer', 'customer', 'customer', 'productNameSnapshot']);
    expect(JSON.stringify(or.at(-1))).toContain('insensitive');
  });

  it('and a long word is cut, a padded one is trimmed, a blank is nothing', () => {
    const long = ask(`q=${'س'.repeat(300)}&product=${'م'.repeat(300)}`);
    expect(long.ok && long.applied.q).toHaveLength(100);
    expect(long.ok && long.applied.product).toHaveLength(120);
    const blank = ask('q=%20%20&product=%20');
    expect(blank.ok && blank.clauses).toEqual([]);
  });

  it('and the known words are exactly the lists the screen draws', () => {
    expect(VIEWS.every((v) => isView(v) && VIEW_AR[v].length > 3)).toBe(true);
    expect(PERIODS.every((p) => isPeriod(p) && PERIOD_AR[p].length > 3)).toBe(true);
    for (const r of REJECTION_REASONS) expect(isReason(r), r).toBe(true);
    expect(isView('all')).toBe(false);
    expect(isReason('ALL')).toBe(false);
  });
});

describe('the page is a place', () => {
  it('— oldest order first (the nearest to falling out of the look-back), every order ending in its id', () => {
    expect(WINBACK_ORDER_BY).toEqual([{ createdAt: 'asc' }, { id: 'asc' }]);
  });
});

describe('the module is safe for the screen to import', () => {
  it('— it reaches no server module: no database, no session', () => {
    const src = stripComments(repoFile('src/lib/winback-filters.ts'));
    const imports = [...src.matchAll(/^import .*? from '([^']+)'/gm)].map((m) => m[1]);
    expect(imports.sort()).toEqual(['./confirmation-workflow', './order-filters', './text-search', './winback', '@prisma/client']);
    expect(src).toMatch(/import type \{ Prisma \} from '@prisma\/client'/);
  });
});
