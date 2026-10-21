import type { Prisma } from '@prisma/client';
import type { db as Db } from './db';
import {
  KINDS,
  NO_AGENT,
  NO_AGENT_AR,
  POSTPONED_ORDER_BY,
  TIMES,
  WHENS,
  kindWhere,
  timesWhere,
  whenWhere,
  type Kind,
  type Times,
  type When,
} from './postponed-filters';

/**
 * THE POSTPONED LIST'S QUERIES — THE PAGE, AND THE NUMBERS BESIDE THE OPTIONS.
 *
 * Kept out of the route file because a route may export nothing but its
 * handlers, and because the two halves are worth testing without a request:
 * a fake client is enough to hold «the scope is always in the question».
 *
 * ── THE SCOPE IS NEVER A FILTER ──
 *
 * `scope` is who the person may see — the company, the store, the orders that
 * wait on a date, and for an agent only the ones she holds. Every clause the
 * reader chose is ANDed onto it, and the counts beside the options are asked of
 * the scope alone, so no choice can widen the list and no number can describe
 * somebody else's work.
 *
 * The numbers describe the scope, not the intersection with whatever else is
 * chosen: «متأخر (3)» is how many of THEIR orders are late. With nothing else
 * chosen — the state the list opens in — it is exactly how many rows will
 * appear, which is the promise a number beside a word makes.
 */

type Where = Prisma.OrderWhereInput;
type Client = Pick<typeof Db, 'order' | 'user'>;

/** Orders waiting on a date: the postponed state, and the one an agent sets before she has called. */
export const WAITING_STATUSES = ['POSTPONED', 'FOLLOW_UP_REQUIRED'] as const;

export function postponedScope(input: { companyId: string; storeId: string; ownOnly?: string }): Where {
  return {
    companyId: input.companyId,
    storeId: input.storeId,
    // Everything waiting on a date, not only the POSTPONED state — see the route.
    confirmationStatus: { in: [...WAITING_STATUSES] },
    ...(input.ownOnly ? { claimedById: input.ownOnly } : {}),
  };
}

export interface PostponedPage<Row> {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  rows: Row[];
}

/**
 * One page, with the total the pager needs.
 *
 * A page past the end is answered with the LAST page, and `page` says which:
 * a reader whose list shrank under them (an order handed back to the pool while
 * they were on page 7) is shown where the list now ends, not an empty page and
 * not a refusal. Every order ends in its id, so a page is a place — the next
 * page never repeats a row or skips one.
 */
export async function readPostponedPage<Row>(
  db: Client,
  input: { scope: Where; clauses: Where[]; page: number; limit: number; select: Prisma.OrderSelect }
): Promise<PostponedPage<Row>> {
  // The scope stays at the TOP of the question — spread, never nested — and what the reader chose is ANDed onto it.
  const where: Where = { ...input.scope, AND: input.clauses };
  const total = await db.order.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / input.limit));
  const page = Math.min(Math.max(input.page, 1), totalPages);
  const rows = (await db.order.findMany({
    where,
    orderBy: POSTPONED_ORDER_BY,
    skip: (page - 1) * input.limit,
    take: input.limit,
    select: input.select,
  })) as unknown as Row[];
  return { total, page, limit: input.limit, totalPages, rows };
}

export interface PostponedFacts {
  total: number;
  whens: Record<When, number>;
  kinds: Record<Kind, number>;
  times: Record<Times, number>;
  /** A supervisor's question: whose hands. Null for an agent — her list is her own. */
  agents: { id: string; name: string; count: number }[] | null;
}

/** The numbers beside the options, over the scope — ten small questions asked together. */
export async function postponedFacts(
  db: Client,
  input: { scope: Where; supervisor: boolean; now: Date; leadDays: number }
): Promise<PostponedFacts> {
  const count = (where: Where = {}) => db.order.count({ where: { ...input.scope, AND: [where] } });

  const [total, whens, kinds, times, agents] = await Promise.all([
    count(),
    Promise.all(WHENS.map((w) => count(whenWhere(w, input.now, input.leadDays)))),
    Promise.all(KINDS.map((k) => count(kindWhere(k)))),
    Promise.all(TIMES.map((t) => count(timesWhere(t)))),
    input.supervisor ? agentsOf(db, input.scope) : Promise.resolve(null),
  ]);

  return {
    total,
    whens: Object.fromEntries(WHENS.map((w, i) => [w, whens[i]])) as Record<When, number>,
    kinds: Object.fromEntries(KINDS.map((k, i) => [k, kinds[i]])) as Record<Kind, number>,
    times: Object.fromEntries(TIMES.map((t, i) => [t, times[i]])) as Record<Times, number>,
    agents,
  };
}

/** Who holds the waiting orders, biggest first; the ones handed back to the pool are «nobody». */
async function agentsOf(db: Client, scope: Where) {
  const held = await db.order.groupBy({ by: ['claimedById'], where: scope, _count: { _all: true } });
  const ids = held.map((h) => h.claimedById).filter((id): id is string => !!id);
  const names = new Map(
    (ids.length > 0 ? await db.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }) : []).map((u) => [u.id, u.name])
  );
  return held
    .map((h) => ({
      id: h.claimedById ?? NO_AGENT,
      name: h.claimedById ? (names.get(h.claimedById) ?? '—') : NO_AGENT_AR,
      count: h._count._all,
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'ar'));
}
