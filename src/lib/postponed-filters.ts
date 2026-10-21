import type { Prisma } from '@prisma/client';
import { orderSearchOr } from './order-filters';

/**
 * WHAT A SUPERVISOR ASKS OF THE POSTPONED LIST, AS ONE SET OF DEFINITIONS.
 *
 * «الطلبات المؤجلة — اعملو صفحات + فلاتر + بحث». The list used to be the first
 * three hundred rows in date order, drawn whole: no pages, nothing to narrow it
 * with, and a supervisor looking for «who has been postponed twice» or «what is
 * late» scrolled and counted by eye.
 *
 * The questions are four, and each one is a word the screen already prints:
 *
 *   · `when`  — the MOMENT: «متأخر», «يحين خلال N يوم»… cut by the same
 *               `daysRemaining` the «المتبقي» column prints, so a row labelled
 *               «متأخر 3 يوم» is in «متأخر» and nowhere else;
 *   · `kind`  — why it is here: promised to the customer, or needs a call;
 *   · `times` — how often it has been postponed (the «مرات التأجيل» column);
 *   · `agent` — whose hands it is in (a supervisor's question; an agent sees
 *               only her own and is asked nothing).
 *
 * Each is read TWICE and the two readings must agree, which is the only way
 * «متأخر (3)» stays a promise that three rows will appear:
 *
 *   · `whenWhere` — the database's reading (the list and the counts);
 *   · `whenOf`    — the same word read on a row in memory (the label, the alert).
 *
 * `postponed-filters.test.ts` runs both over the same dates, at every boundary,
 * and fails the day they disagree.
 *
 * NO NEW COLUMN, NO MIGRATION. «The date» is the one the screen has always used:
 * `postponedUntil`, and `nextFollowUpAt` for an order that has only that.
 *
 * This module imports nothing from the server: the screen reads it too. The
 * lead days are a parameter, because the number belongs to the confirmation
 * queue and a copy of it here would drift.
 */

const DAY = 86_400_000;
/** «هذا الأسبوع» — the horizon past the lead days. */
export const WEEK_DAYS = 7;

export const WHENS = ['now', 'overdue', 'soon', 'week', 'later'] as const;
export type When = (typeof WHENS)[number];

/** The words, where they exist on the screen. `soon` needs the lead days, so it is a function. */
export const whenLabel = (when: When, leadDays: number): string =>
  ({
    now: 'قابل للعمل عليه',
    overdue: 'متأخر',
    soon: `يحين خلال ${leadDays} يوم`,
    week: `بعدها حتى ${WEEK_DAYS} أيام`,
    later: `بعد أكثر من ${WEEK_DAYS} أيام`,
  })[when];

export const KINDS = ['postponed', 'followup'] as const;
export type Kind = (typeof KINDS)[number];
export const KIND_AR: Record<Kind, string> = { postponed: 'مؤجَّل بطلب العميل', followup: 'بحاجة متابعة' };
/** The workflow's own word for each — a postponed order and an order awaiting a callback are one idea to the agent. */
export const KIND_STATUS: Record<Kind, 'POSTPONED' | 'FOLLOW_UP_REQUIRED'> = { postponed: 'POSTPONED', followup: 'FOLLOW_UP_REQUIRED' };

export const TIMES = ['once', 'many'] as const;
export type Times = (typeof TIMES)[number];
export const TIMES_AR: Record<Times, string> = { once: 'مرّة واحدة', many: 'مرّتين فأكثر' };

/** An agent filter's «nobody» — an order handed back to the pool keeps its date and has no holder. */
export const NO_AGENT = 'none';
export const NO_AGENT_AR = 'في الطابور — بلا موظف';

export const isWhen = (v: unknown): v is When => typeof v === 'string' && (WHENS as readonly string[]).includes(v);
export const isKind = (v: unknown): v is Kind => typeof v === 'string' && (KINDS as readonly string[]).includes(v);
export const isTimes = (v: unknown): v is Times => typeof v === 'string' && (TIMES as readonly string[]).includes(v);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const isAgentFilter = (v: unknown): v is string => typeof v === 'string' && (v === NO_AGENT || UUID.test(v));

/** A typed word is capped: a search box is not a place to paste a document. */
export const MAX_SEARCH_LENGTH = 100;

// ───────────────────────── the moment ─────────────────────────

/**
 * Days until it is due, as the «المتبقي» column counts them: a day started is a
 * day left. `ceil`, so an order due in an hour has «1», one due an hour ago has
 * «-0» (not yet late), and one due 25 hours ago has «-1» (late by a day).
 */
export function daysRemainingOf(due: Date | string | null | undefined, now: Date): number | null {
  if (!due) return null;
  return Math.ceil((new Date(due).getTime() - now.getTime()) / DAY);
}

/**
 * The same word, read on a row in memory — what the label and the alert do.
 *
 * `now` («قابل للعمل عليه») is every row inside the lead days, late ones
 * included — the server's own word for «can be worked on», which was always
 * `due <= now + leadDays`. The other four partition by `daysRemaining` and
 * never overlap; a row with no date is in none of them.
 */
export function whenOf(daysRemaining: number | null, leadDays: number): Exclude<When, 'now'> | null {
  if (daysRemaining === null) return null;
  if (daysRemaining < 0) return 'overdue';
  if (daysRemaining <= leadDays) return 'soon';
  if (daysRemaining <= WEEK_DAYS) return 'week';
  return 'later';
}

export const actionableOf = (daysRemaining: number | null, leadDays: number): boolean =>
  daysRemaining !== null && daysRemaining <= leadDays;

type Where = Prisma.OrderWhereInput;

/** «The date» is `postponedUntil`, or `nextFollowUpAt` when there is none — `COALESCE`, in the two columns Prisma can compare. */
const dueAtMost = (at: Date): Where => ({
  OR: [{ postponedUntil: { lte: at } }, { postponedUntil: null, nextFollowUpAt: { lte: at } }],
});
const dueAfter = (at: Date): Where => ({
  OR: [{ postponedUntil: { gt: at } }, { postponedUntil: null, nextFollowUpAt: { gt: at } }],
});

/**
 * THE DATABASE'S READING OF EACH MOMENT.
 *
 * Boundaries written the way `ceil` reads them. «متأخر» is `daysRemaining < 0`,
 * which is `due <= now - 1 day` (an order due an hour ago is not yet late — it
 * says «0 يوم»). «يحين» is the rest of the lead window; «بعدها» the rest of the
 * week; «بعد» everything further. Equal instants fall on the near side of every
 * line, exactly as `ceil` puts them.
 */
export function whenWhere(when: When, now: Date, leadDays: number): Where {
  const lateEnd = new Date(now.getTime() - DAY);
  const leadEnd = new Date(now.getTime() + leadDays * DAY);
  const weekEnd = new Date(now.getTime() + WEEK_DAYS * DAY);
  switch (when) {
    case 'now':
      return dueAtMost(leadEnd);
    case 'overdue':
      return dueAtMost(lateEnd);
    case 'soon':
      return { AND: [dueAfter(lateEnd), dueAtMost(leadEnd)] };
    case 'week':
      return { AND: [dueAfter(leadEnd), dueAtMost(weekEnd)] };
    case 'later':
      return dueAfter(weekEnd);
  }
}

export const kindWhere = (kind: Kind): Where => ({ confirmationStatus: KIND_STATUS[kind] });

export const timesWhere = (times: Times): Where => ({ postponeCount: times === 'once' ? 1 : { gte: 2 } });

export const agentWhere = (agent: string): Where => ({ claimedById: agent === NO_AGENT ? null : agent });

// ───────────────────────── the URL ─────────────────────────

export interface PostponedFilterInput {
  /** `confirmation.supervise`. False is an agent, who sees her own and is asked nothing about whose. */
  supervisor: boolean;
  now: Date;
  leadDays: number;
}

export interface PostponedApplied {
  when: When | null;
  kind: Kind | null;
  times: Times | null;
  agent: string | null;
  q: string | null;
}

export type PostponedFilterResult =
  | { ok: true; clauses: Where[]; applied: PostponedApplied }
  | { ok: false; error: string; errorAr: string };

/**
 * THE URL'S FILTERS, READ ONCE, IN ONE PLACE.
 *
 * `all` and an absent value mean «no filter». A value this module does not
 * know is REFUSED rather than ignored: ignoring it would answer a question
 * nobody asked with a list nobody filtered, which is how «متأخر» became
 * «everything» on a typo.
 *
 * The clauses are returned as a list for the caller to AND onto its own scope
 * — company, store and, for an agent, her own claim — so no filter can widen
 * what the person is allowed to see.
 */
export function postponedFilters(params: URLSearchParams, input: PostponedFilterInput): PostponedFilterResult {
  const applied: PostponedApplied = { when: null, kind: null, times: null, agent: null, q: null };
  const clauses: Where[] = [];

  const word = (name: string) => {
    const raw = params.get(name)?.trim();
    return raw && raw !== 'all' ? raw : undefined;
  };
  const refuse = (what: string, arabic: string, value: string): PostponedFilterResult => ({
    ok: false,
    error: `Unknown ${what}: ${value}`,
    errorAr: `${arabic} غير معروف: ${value}`,
  });

  const when = word('when');
  if (when) {
    if (!isWhen(when)) return refuse('postponed moment', 'الموعد', when);
    applied.when = when;
    clauses.push(whenWhere(when, input.now, input.leadDays));
  }

  const kind = word('kind');
  if (kind) {
    if (!isKind(kind)) return refuse('postponed kind', 'النوع', kind);
    applied.kind = kind;
    clauses.push(kindWhere(kind));
  }

  const times = word('times');
  if (times) {
    if (!isTimes(times)) return refuse('postpone count', 'عدد التأجيلات', times);
    applied.times = times;
    clauses.push(timesWhere(times));
  }

  // Whose hands it is in is a supervisor's question. An agent's list is hers by
  // construction, and a parameter that named somebody else's would be ignored
  // rather than obeyed — the scope is the caller's, not this module's.
  const agent = input.supervisor ? word('agent') : undefined;
  if (agent) {
    if (!isAgentFilter(agent)) return refuse('agent', 'الموظف', agent);
    applied.agent = agent;
    clauses.push(agentWhere(agent));
  }

  const q = params.get('q')?.trim().slice(0, MAX_SEARCH_LENGTH);
  if (q) {
    applied.q = q;
    clauses.push({ OR: orderSearchOr(q) as Where[] });
  }

  return { ok: true, clauses, applied };
}

/** Every sort ends in the id: two orders due the same minute are still two orders, and a page is only a place if equal rows can be told apart. */
export const POSTPONED_ORDER_BY: Prisma.OrderOrderByWithRelationInput[] = [
  { postponedUntil: 'asc' },
  { nextFollowUpAt: 'asc' },
  { id: 'asc' },
];
