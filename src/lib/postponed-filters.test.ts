import { describe, expect, it } from 'vitest';
import type { Prisma } from '@prisma/client';
import {
  KINDS,
  KIND_AR,
  NO_AGENT,
  POSTPONED_ORDER_BY,
  TIMES,
  TIMES_AR,
  WEEK_DAYS,
  WHENS,
  actionableOf,
  agentWhere,
  daysRemainingOf,
  isAgentFilter,
  kindWhere,
  postponedFilters,
  timesWhere,
  whenLabel,
  whenOf,
  whenWhere,
  type When,
} from './postponed-filters';
import { repoFile, stripComments } from './guard-source';

/**
 * THE POSTPONED LIST'S WORDS, EACH READ TWICE — AND THE TWO READINGS AGREE.
 *
 * «الطلبات المؤجلة — اعملو صفحات + فلاتر + بحث». «متأخر (3)» beside a word is a
 * promise that three rows will appear when it is chosen; the number is asked of
 * the database (`whenWhere`) and the label on each row is read in memory
 * (`whenOf`). They are written side by side so they cannot drift, and what is
 * held here is that they never do — at every boundary, not at the comfortable
 * middle of each window.
 */

const NOW = new Date('2026-10-21T12:00:00.000Z');
const LEAD = 2;
const DAY = 86_400_000;
const at = (ms: number) => new Date(NOW.getTime() + ms);

// ───────────────────────── a tiny Prisma `where` evaluator ─────────────────────────
//
// Only the operators the module writes: AND / OR, equality (null included),
// lte / lt / gte / gt, `in`. A condition it does not know THROWS, so the day the
// module starts writing one the evaluator cannot read, this fails loudly
// instead of agreeing with itself.

type Row = Record<string, unknown>;

function matches(where: Prisma.OrderWhereInput, row: Row): boolean {
  return Object.entries(where).every(([key, cond]) => {
    if (key === 'AND') return (cond as Prisma.OrderWhereInput[]).every((w) => matches(w, row));
    if (key === 'OR') return (cond as Prisma.OrderWhereInput[]).some((w) => matches(w, row));
    const value = row[key];
    if (cond === null) return value === null;
    if (cond instanceof Date || typeof cond !== 'object') return value === cond || (cond instanceof Date && value instanceof Date && value.getTime() === cond.getTime());
    return Object.entries(cond as Record<string, unknown>).every(([op, arg]) => {
      if (op === 'in') return (arg as unknown[]).includes(value);
      if (!(value instanceof Date) && typeof value !== 'number') return false; // a comparison on null is never true
      const a = value instanceof Date ? value.getTime() : value;
      const b = arg instanceof Date ? arg.getTime() : (arg as number);
      if (op === 'lte') return a <= b;
      if (op === 'lt') return a < b;
      if (op === 'gte') return a >= b;
      if (op === 'gt') return a > b;
      throw new Error(`the evaluator does not know «${op}»`);
    });
  });
}

const row = (postponedUntil: Date | null, nextFollowUpAt: Date | null = null, extra: Row = {}): Row => ({
  postponedUntil,
  nextFollowUpAt,
  confirmationStatus: 'POSTPONED',
  postponeCount: 1,
  claimedById: 'u1',
  ...extra,
});

/** Every instant that sits on a line: each boundary, one millisecond either side, and the middle of each window. */
const OFFSETS = [
  -8 * DAY, -2 * DAY, -DAY - 1, -DAY, -DAY + 1, -3_600_000, -1, 0, 1, 3_600_000, DAY, LEAD * DAY - 1, LEAD * DAY, LEAD * DAY + 1,
  3 * DAY, WEEK_DAYS * DAY - 1, WEEK_DAYS * DAY, WEEK_DAYS * DAY + 1, 30 * DAY,
];

describe('one word, two readings — over every boundary', () => {
  it.each(OFFSETS)('— a date %i ms from now is in exactly the window the label says, by postponedUntil alone', (offset) => {
    const r = row(at(offset));
    const remaining = daysRemainingOf(at(offset), NOW);
    const label = whenOf(remaining, LEAD);
    for (const w of WHENS.filter((x): x is Exclude<When, 'now'> => x !== 'now')) {
      expect(matches(whenWhere(w, NOW, LEAD), r), `${w} @ ${offset}`).toBe(label === w);
    }
    expect(matches(whenWhere('now', NOW, LEAD), r), `now @ ${offset}`).toBe(actionableOf(remaining, LEAD));
  });

  it.each(OFFSETS)('— and a date %i ms from now read from nextFollowUpAt, when there is no postponedUntil, lands the same', (offset) => {
    const viaFollowUp = row(null, at(offset));
    const viaPostponed = row(at(offset));
    for (const w of WHENS) {
      expect(matches(whenWhere(w, NOW, LEAD), viaFollowUp), `${w} @ ${offset}`).toBe(matches(whenWhere(w, NOW, LEAD), viaPostponed));
    }
  });

  it('and when both dates are set it is postponedUntil that counts — as the «المتبقي» column has always read it', () => {
    // Postponed far off, follow-up soon: the column says «بعد 30 يوم», so that is where it is.
    const r = row(at(30 * DAY), at(DAY));
    expect(matches(whenWhere('later', NOW, LEAD), r)).toBe(true);
    expect(matches(whenWhere('soon', NOW, LEAD), r)).toBe(false);
    expect(matches(whenWhere('now', NOW, LEAD), r)).toBe(false);
  });

  it('and a postponedUntil that has PASSED is not rescued by a later follow-up date — overdue stays overdue, in no later window', () => {
    const r = row(at(-2 * DAY), at(30 * DAY));
    expect(matches(whenWhere('overdue', NOW, LEAD), r)).toBe(true);
    expect(matches(whenWhere('now', NOW, LEAD), r)).toBe(true);
    for (const w of ['soon', 'week', 'later'] as const) expect(matches(whenWhere(w, NOW, LEAD), r), w).toBe(false);
  });

  it('and an order with no date at all is in no window — it is not «late» and it is not «soon»', () => {
    const none = row(null, null);
    for (const w of WHENS) expect(matches(whenWhere(w, NOW, LEAD), none), w).toBe(false);
    expect(daysRemainingOf(null, NOW)).toBeNull();
    expect(whenOf(null, LEAD)).toBeNull();
    expect(actionableOf(null, LEAD)).toBe(false);
  });

  it('and the four windows PARTITION the dated orders — one each, never two, never none', () => {
    for (const offset of OFFSETS) {
      const r = row(at(offset));
      const inside = (['overdue', 'soon', 'week', 'later'] as const).filter((w) => matches(whenWhere(w, NOW, LEAD), r));
      expect(inside, `@ ${offset}`).toHaveLength(1);
    }
  });

  it('and «قابل للعمل عليه» is the late and the soon together — the server’s own word for «can be worked on»', () => {
    for (const offset of OFFSETS) {
      const r = row(at(offset));
      const either = matches(whenWhere('overdue', NOW, LEAD), r) || matches(whenWhere('soon', NOW, LEAD), r);
      expect(matches(whenWhere('now', NOW, LEAD), r), `@ ${offset}`).toBe(either);
    }
  });

  it('and it follows the lead days it is given — it does not know the number', () => {
    const r = row(at(4 * DAY));
    expect(matches(whenWhere('now', NOW, 2), r)).toBe(false);
    expect(matches(whenWhere('now', NOW, 5), r)).toBe(true);
    expect(matches(whenWhere('soon', NOW, 5), r)).toBe(true);
    expect(whenOf(daysRemainingOf(at(4 * DAY), NOW), 5)).toBe('soon');
  });
});

describe('days remaining, as the column prints them', () => {
  it('— a day begun is a day left: ceil, so an hour ago is not yet late and a day and an hour ago is', () => {
    expect(daysRemainingOf(at(3_600_000), NOW)).toBe(1);
    expect(daysRemainingOf(at(-3_600_000), NOW)).toBe(-0);
    expect(whenOf(daysRemainingOf(at(-3_600_000), NOW), LEAD)).toBe('soon'); // «0 يوم», not «متأخر»
    expect(daysRemainingOf(at(-DAY - 3_600_000), NOW)).toBe(-1);
    expect(whenOf(-1, LEAD)).toBe('overdue');
  });

  it('and a string date reads the same as a Date — the route hands over whatever Prisma returned', () => {
    expect(daysRemainingOf(at(2 * DAY).toISOString(), NOW)).toBe(2);
  });
});

describe('the labels', () => {
  it('— say the lead days they were given, and every moment has its own words', () => {
    expect(whenLabel('soon', 2)).toBe('يحين خلال 2 يوم');
    expect(whenLabel('soon', 3)).toBe('يحين خلال 3 يوم');
    expect(new Set(WHENS.map((w) => whenLabel(w, LEAD))).size).toBe(WHENS.length);
    expect(whenLabel('now', LEAD)).toBe('قابل للعمل عليه');
    expect(whenLabel('later', LEAD)).toContain(String(WEEK_DAYS));
  });

  it('and every kind and every count has a word', () => {
    for (const k of KINDS) expect(KIND_AR[k].length).toBeGreaterThan(3);
    for (const t of TIMES) expect(TIMES_AR[t].length).toBeGreaterThan(3);
  });
});

describe('what the other filters mean', () => {
  it('— a kind is the workflow’s own state; a count is the column', () => {
    expect(kindWhere('postponed')).toEqual({ confirmationStatus: 'POSTPONED' });
    expect(kindWhere('followup')).toEqual({ confirmationStatus: 'FOLLOW_UP_REQUIRED' });
    expect(matches(timesWhere('once'), row(null, null, { postponeCount: 1 }))).toBe(true);
    expect(matches(timesWhere('once'), row(null, null, { postponeCount: 2 }))).toBe(false);
    expect(matches(timesWhere('many'), row(null, null, { postponeCount: 2 }))).toBe(true);
    expect(matches(timesWhere('many'), row(null, null, { postponeCount: 1 }))).toBe(false);
    // An order awaiting a callback that was never postponed is neither «once» nor «many».
    expect(matches(timesWhere('once'), row(null, null, { postponeCount: 0 }))).toBe(false);
    expect(matches(timesWhere('many'), row(null, null, { postponeCount: 0 }))).toBe(false);
  });

  it('and «nobody» is an order handed back to the pool; anybody else is their id', () => {
    expect(agentWhere(NO_AGENT)).toEqual({ claimedById: null });
    expect(agentWhere('3d0e4a28-5c2f-4a4b-9a45-0f9f4b6c1d21')).toEqual({ claimedById: '3d0e4a28-5c2f-4a4b-9a45-0f9f4b6c1d21' });
  });
});

// ───────────────────────── the address ─────────────────────────

const ask = (query: string, over: Partial<{ supervisor: boolean }> = {}) =>
  postponedFilters(new URLSearchParams(query), { supervisor: true, now: NOW, leadDays: LEAD, ...over });
const AGENT = '3d0e4a28-5c2f-4a4b-9a45-0f9f4b6c1d21';

describe('the address', () => {
  it('— nothing chosen is no filter at all, and «all» is nothing chosen', () => {
    for (const q of ['', 'when=all&kind=all&times=all&agent=all', 'when=&q=']) {
      const r = ask(q);
      expect(r).toEqual({ ok: true, clauses: [], applied: { when: null, kind: null, times: null, agent: null, q: null } });
    }
  });

  it('and each chosen word becomes one clause, in the order they are read', () => {
    const r = ask(`when=overdue&kind=followup&times=many&agent=${AGENT}&q=سارة`);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.clauses).toHaveLength(5);
    expect(r.applied).toEqual({ when: 'overdue', kind: 'followup', times: 'many', agent: AGENT, q: 'سارة' });
    expect(r.clauses[0]).toEqual(whenWhere('overdue', NOW, LEAD));
    expect(r.clauses[1]).toEqual(kindWhere('followup'));
    expect(r.clauses[2]).toEqual(timesWhere('many'));
    expect(r.clauses[3]).toEqual(agentWhere(AGENT));
  });

  it.each([
    ['when=yesterday', 'الموعد غير معروف: yesterday'],
    ['kind=urgent', 'النوع غير معروف: urgent'],
    ['times=thrice', 'عدد التأجيلات غير معروف: thrice'],
    ['agent=not-an-id', 'الموظف غير معروف: not-an-id'],
  ])('— %s is refused in Arabic, never read as «everything»', (query, arabic) => {
    const r = ask(query);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errorAr).toBe(arabic);
      expect(r.error).toMatch(/^Unknown /);
    }
  });

  it('and an agent is asked nothing about whose hands — her list is hers, and a value that names somebody else is not obeyed', () => {
    const r = ask(`agent=${AGENT}&when=soon`, { supervisor: false });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.applied.agent).toBeNull();
      expect(r.clauses).toEqual([whenWhere('soon', NOW, LEAD)]);
    }
    // Not even validated: it is none of her list's business.
    expect(ask('agent=garbage', { supervisor: false }).ok).toBe(true);
  });

  it('and «nobody» is a valid agent, a uuid is, and nothing else', () => {
    expect(isAgentFilter(NO_AGENT)).toBe(true);
    expect(isAgentFilter(AGENT)).toBe(true);
    for (const bad of ['', 'all', "1' OR '1'='1", `${AGENT}x`, undefined, 7]) expect(isAgentFilter(bad), String(bad)).toBe(false);
  });

  it('and the search is trimmed, capped, and asks every way a parcel is known — the same builder the orders list uses', () => {
    const r = ask(`q=${encodeURIComponent('  ' + 'س'.repeat(300) + '  ')}`);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // Trimmed, THEN capped: the cap alone would give the same length with two spaces inside it.
    expect(r.applied.q).toBe('س'.repeat(100));
    const or = (r.clauses[0] as { OR: Record<string, unknown>[] }).OR;
    const keys = or.map((c) => Object.keys(c)[0]);
    expect(keys).toEqual(['orderNumber', 'merchantRef', 'trackingNumber', 'customer', 'customer', 'customer']);
    // A typed phone is matched as typed and normalised — the customer's number, not a different search.
    expect(JSON.stringify(or)).toContain('"fullName"');
    expect(JSON.stringify(or)).toContain('"phone"');
  });

  it('and the order of the parameters is no part of the question', () => {
    // The clauses come out in the module's reading order, whichever way the address spelled them.
    expect(JSON.stringify(ask('when=soon&kind=postponed'))).toBe(JSON.stringify(ask('kind=postponed&when=soon')));
  });
});

describe('the page is a place', () => {
  it('— every order ends in its id, so equal dates are still two rows and a page never repeats one', () => {
    expect(POSTPONED_ORDER_BY.at(-1)).toEqual({ id: 'asc' });
    expect(POSTPONED_ORDER_BY.slice(0, 2)).toEqual([{ postponedUntil: 'asc' }, { nextFollowUpAt: 'asc' }]);
  });
});

describe('the module is safe for the screen to import', () => {
  it('— it reaches no server module: no database, no session, no queue', () => {
    const src = stripComments(repoFile('src/lib/postponed-filters.ts'));
    const imports = [...src.matchAll(/^import .*? from '([^']+)'/gm)].map((m) => m[1]);
    expect(imports.sort()).toEqual(['./order-filters', '@prisma/client']);
    expect(src).toMatch(/import type \{ Prisma \} from '@prisma\/client'/);
  });
});
