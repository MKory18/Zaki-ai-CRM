import type { Prisma } from '@prisma/client';
import { db } from './db';
import { measure } from './commission-metrics';
import { moderatorPerformance } from './attribution-performance';
import { teamPerformance, type EmployeeRow } from './team-performance';
import type { BusinessCalendar } from './business-calendar';
import { bandsForRole, scoreOf, type ScoreInput, type ScoreResult } from './performance-score';
import { rateOf } from './order-state';

type Tx = Prisma.TransactionClient | typeof db;

/**
 * THE NUMBERS THE SCORE IS BUILT FROM — read from where they already live.
 *
 * Not one figure here is computed twice. The delivery rate comes from the
 * same `measure()` a commission rule is paid on, the response time from the
 * same `teamPerformance()` the team screen draws, the moderator's delivery
 * rate from the same `moderatorPerformance()` the attribution tables use. A
 * score that disagreed with the screen beside it would be worse than no
 * score: two numbers for one week, and an argument nobody can settle.
 *
 * Two readings did not exist anywhere and are written here: how often a
 * person's entries come back as an entry problem, and how heavily they
 * discount compared with the shop's own habit.
 *
 * This is deliberately a per-person loop over `measure()` rather than one
 * clever query. A report screen loaded a few times a day can afford the
 * round trips; a second set of definitions drifting from the first cannot
 * be afforded at all.
 */

export interface TeamScope {
  companyId: string;
  storeId: string;
  start: Date;
  /** Exclusive: the first moment AFTER the window. */
  end: Date;
  calendar: BusinessCalendar;
}

/**
 * Who granted a discount.
 *
 * Whoever confirmed the order is who granted it; the moderator is the
 * fallback for an order that never reached a confirmation agent. Named once
 * here because the discount alerts screen answers the same question, and
 * two answers to it would put a habit on two different people's records.
 */
export function discountGrantedBy(order: {
  confirmedById: string | null;
  moderatorId: string | null;
}): string | null {
  return order.confirmedById ?? order.moderatorId;
}

export interface DiscountUse {
  /** Given away, over what the orders would have been without it. */
  share: number;
  discount: number;
  gross: number;
}

/**
 * How heavily each person discounts, and how heavily the shop does.
 *
 * Read over the orders they are accountable for in the window, not over the
 * discounted ones alone: an agent who discounted twice out of two hundred
 * orders and one who discounted twice out of four are not the same person,
 * and a denominator of "orders carrying a discount" makes them identical.
 *
 * The team figure is POOLED — all the money given away over all the money —
 * rather than an average of the individual shares, so one agent with four
 * orders cannot move the shop's own habit.
 */
export async function discountUse(
  tx: Tx,
  scope: TeamScope
): Promise<{ byUser: Map<string, DiscountUse>; team: DiscountUse }> {
  const orders = await tx.order.findMany({
    where: { companyId: scope.companyId, storeId: scope.storeId, createdAt: { gte: scope.start, lt: scope.end } },
    select: { discountAmount: true, totalAmount: true, confirmedById: true, moderatorId: true },
  });

  const byUser = new Map<string, DiscountUse>();
  let teamDiscount = 0;
  let teamGross = 0;

  for (const o of orders) {
    const by = discountGrantedBy(o);
    const discount = Number(o.discountAmount);
    // Against what the order would have been before the discount — the same
    // basis the discount alerts screen uses.
    const gross = Number(o.totalAmount) + discount;
    teamDiscount += discount;
    teamGross += gross;
    if (!by) continue;
    const row = byUser.get(by) ?? { share: 0, discount: 0, gross: 0 };
    row.discount += discount;
    row.gross += gross;
    byUser.set(by, row);
  }

  for (const row of byUser.values()) row.share = row.gross > 0 ? row.discount / row.gross : 0;

  return {
    byUser,
    team: { discount: teamDiscount, gross: teamGross, share: teamGross > 0 ? teamDiscount / teamGross : 0 },
  };
}

export interface IssuesUse {
  issues: number;
  orders: number;
  /** Null when they entered nothing — not zero, which would read as perfect. */
  rate: number | null;
}

/**
 * How often a moderator's entries come back as an entry problem.
 *
 * A VOIDED issue is one somebody raised and was wrong about. It is left out
 * entirely: counting it would mean an agent could damage a colleague's
 * record by raising issues that were then thrown out, which is the one way
 * to make an honest measurement into a weapon.
 *
 * The denominator is what they ENTERED in the window, so somebody who
 * entered nothing has no rate rather than a perfect one.
 */
export async function issuesRate(tx: Tx, scope: TeamScope): Promise<Map<string, IssuesUse>> {
  const orders = await tx.order.findMany({
    where: {
      companyId: scope.companyId,
      storeId: scope.storeId,
      createdAt: { gte: scope.start, lt: scope.end },
      moderatorId: { not: null },
    },
    select: { moderatorId: true, issues: { where: { status: { not: 'VOIDED' } }, select: { id: true } } },
  });

  const byUser = new Map<string, IssuesUse>();
  for (const o of orders) {
    const id = o.moderatorId!;
    const row = byUser.get(id) ?? { issues: 0, orders: 0, rate: null };
    row.orders++;
    row.issues += o.issues.length;
    byUser.set(id, row);
  }
  for (const row of byUser.values()) {
    row.rate = row.orders > 0 ? row.issues / row.orders : null;
  }
  return byUser;
}

export interface ScoredPerson {
  id: string;
  name: string;
  role: string;
  score: ScoreResult;
  /** Position within this role and store, best first. 1-based. */
  rank: number;
  /** How many people share the role, so a rank means something. */
  of: number;
}

/** The metric each role's volume and cross-sell bands are read from. */
const VOLUME_METRIC: Record<string, string> = {
  CONFIRMATION_AGENT: 'CONFIRMED_COUNT',
  CONFIRMATION_SUPERVISOR: 'CONFIRMED_COUNT',
  MODERATOR: 'SOURCED_COUNT',
};
const CROSS_SELL_METRIC: Record<string, string> = {
  CONFIRMATION_AGENT: 'CROSS_SELL_UNITS',
  CONFIRMATION_SUPERVISOR: 'CROSS_SELL_UNITS',
  MODERATOR: 'MULTI_UNIT_ORDERS',
};

/**
 * Everybody in one role, scored together.
 *
 * Together because a volume has no meaning on its own: twenty confirmed
 * orders is excellent in a slow week and poor in a busy one, and the only
 * honest reference is what the same role managed over the same days in the
 * same store. Which also means the rank comes out of the same pass, instead
 * of a second query that could disagree with the first.
 */
export async function scoreRole(
  scope: TeamScope,
  role: string,
  people: { id: string; name: string }[],
  minSample: number
): Promise<ScoredPerson[]> {
  const bands = new Set(bandsForRole(role));
  if (people.length === 0 || bands.size === 0) return [];

  const [discounts, issues, moderators, team] = await Promise.all([
    discountUse(db, scope),
    bands.has('issues_rate') ? issuesRate(db, scope) : Promise.resolve(new Map<string, IssuesUse>()),
    role === 'MODERATOR'
      ? moderatorPerformance({ companyId: scope.companyId, storeId: scope.storeId, start: scope.start, end: scope.end })
      : Promise.resolve([]),
    bands.has('response_time')
      ? teamPerformance({ companyId: scope.companyId, storeId: scope.storeId, calendar: scope.calendar, start: scope.start, end: scope.end })
      : Promise.resolve({ employees: [] as EmployeeRow[], totals: {} as never }),
  ]);

  const byModerator = new Map(moderators.map((m) => [m.id, m]));
  const byEmployee = new Map(team.employees.map((e) => [e.id, e]));

  // Raw numbers first, references second: the volume bands need the whole
  // role's numbers before any one person's can be turned into points.
  const raw = await Promise.all(
    people.map(async (p) => {
      const metricScope = { companyId: scope.companyId, storeId: scope.storeId, userId: p.id, start: scope.start, end: scope.end };
      const volume = await measure(db, VOLUME_METRIC[role] ?? 'CONFIRMED_COUNT', metricScope);
      const crossSell = bands.has('cross_sell')
        ? await measure(db, CROSS_SELL_METRIC[role] ?? 'CROSS_SELL_UNITS', metricScope)
        : { count: 0, amount: 0, orderIds: [] };

      // A moderator's delivery rate is delivered out of what they BROUGHT,
      // which the attribution tables already compute for the whole role.
      // An agent's is delivered out of what they CONFIRMED, which is what a
      // commission rule is paid on.
      const mod = byModerator.get(p.id);
      const deliveryRate =
        role === 'MODERATOR'
          ? mod?.deliveryRate == null ? null : mod.deliveryRate / 100
          : (await measure(db, 'DELIVERY_RATE', metricScope)).count || null;

      return {
        person: p,
        volume: volume.count,
        crossSell: crossSell.count,
        deliveryRate,
        // The sample is the denominator of the heaviest band: orders
        // CONFIRMED, for either role. It is the number the delivery rate
        // rests on, and a delivery rate is thirty-five of the hundred —
        // gating on anything looser would let the biggest band be noise.
        sample: role === 'MODERATOR' ? mod?.confirmed ?? 0 : volume.count,
        discount: discounts.byUser.get(p.id)?.share ?? 0,
        issues: issues.get(p.id)?.rate ?? null,
        responseMinutes: byEmployee.get(p.id)?.medianFirstActionMinutes ?? null,
      };
    })
  );

  const topVolume = Math.max(0, ...raw.map((r) => r.volume));
  const topCrossSell = Math.max(0, ...raw.map((r) => r.crossSell));

  const scored = raw.map((r) => {
    const input: ScoreInput = {
      delivery_rate: { value: r.deliveryRate },
      confirmed_volume: { value: r.volume, reference: topVolume },
      issues_rate: { value: r.issues },
      discount_use: { value: r.discount, reference: discounts.team.share },
      response_time: { value: r.responseMinutes },
      cross_sell: { value: r.crossSell, reference: topCrossSell },
    };
    return {
      id: r.person.id,
      name: r.person.name,
      role,
      score: scoreOf(role, input, { sample: r.sample, minSample }),
    };
  });

  // Best first. Somebody with no score at all sits at the end rather than at
  // the bottom: they were not measured, which is not the same as last.
  const ordered = [...scored].sort((a, b) => {
    if (a.score.total === null) return b.score.total === null ? 0 : 1;
    if (b.score.total === null) return -1;
    return b.score.total - a.score.total;
  });

  return ordered.map((s, i) => ({ ...s, rank: i + 1, of: ordered.length }));
}

/** The whole-number percentage a rate reads as on a card. */
export const asPercent = (rate: number | null): number | null => rateOf(rate ?? 0, 1);
