import type { Prisma } from '@prisma/client';
import { db } from './db';
import { businessMinutesBetween, type BusinessCalendar } from './business-calendar';

type Tx = Prisma.TransactionClient | typeof db;

/**
 * CONFIRMATION QUEUE — agents never see a list, they pull the next order.
 *
 * Priority: postponed orders due within the lead days first, then the oldest
 * waiting order. An agent cannot pull while holding an order they have not
 * tried to contact yet, and a claim with no attempt is auto-released after
 * 90 BUSINESS minutes (frozen outside work hours and on weekends).
 */

/** Caps from the contract. */
export const CLAIM_CAPS = { withoutAttempt: 40, total: 120 } as const;
/** A claim with zero logged attempts expires after this many business minutes. */
export const AUTO_RELEASE_BUSINESS_MINUTES = 90;
/** How far ahead a postponed order becomes actionable. */
export const POSTPONE_LEAD_DAYS = 2;

/** Statuses that still belong to the confirmation stage. */
const OPEN_CONFIRMATION = ['NEW', 'IN_PROGRESS', 'NO_ANSWER', 'FOLLOW_UP_REQUIRED', 'POSTPONED'];

export interface QueueScope {
  companyId: string;
  storeId: string;
}

export interface OwnedCounts {
  total: number;
  withoutAttempt: number;
}

/** What this agent currently holds in the confirmation stage. */
export async function ownedCounts(tx: Tx, scope: QueueScope, userId: string): Promise<OwnedCounts> {
  const [total, withoutAttempt] = await Promise.all([
    tx.order.count({
      where: { ...scope, claimedById: userId, confirmationStatus: { in: OPEN_CONFIRMATION } },
    }),
    tx.order.count({
      where: {
        ...scope,
        claimedById: userId,
        confirmationStatus: { in: OPEN_CONFIRMATION },
        contactAttempts: { none: {} },
      },
    }),
  ]);
  return { total, withoutAttempt };
}

export type PullRefusal =
  | { code: 'NOT_YOUR_DESK'; message: string }
  | { code: 'UNTOUCHED_ORDER'; message: string }
  | { code: 'CAP_WITHOUT_ATTEMPT'; message: string }
  | { code: 'CAP_TOTAL'; message: string }
  | { code: 'QUEUE_EMPTY'; message: string };

/**
 * May this agent pull another order?
 *
 * The operational rule is the strict one: finish contacting what you hold
 * before taking more. The two caps are the absolute ceilings that also bound
 * bulk assignment paths.
 */
export function pullRefusal(counts: OwnedCounts): PullRefusal | null {
  if (counts.total >= CLAIM_CAPS.total) {
    return { code: 'CAP_TOTAL', message: `بلغت الحد الأقصى (${CLAIM_CAPS.total} طلب لديك).` };
  }
  if (counts.withoutAttempt >= CLAIM_CAPS.withoutAttempt) {
    return {
      code: 'CAP_WITHOUT_ATTEMPT',
      message: `لديك ${counts.withoutAttempt} طلباً بلا محاولة اتصال — الحد ${CLAIM_CAPS.withoutAttempt}.`,
    };
  }
  if (counts.withoutAttempt > 0) {
    return { code: 'UNTOUCHED_ORDER', message: 'سجّل محاولة اتصال على طلبك الحالي قبل سحب طلب جديد.' };
  }
  return null;
}

/**
 * WHETHER THIS ACCOUNT MAY PULL AT ALL, BEFORE ASKING WHETHER IT MAY PULL NOW.
 *
 * `pullRefusal` answers the operational question — have you finished with
 * what you hold — and it is the whole answer for an agent. It is not the
 * whole answer for a supervisor.
 *
 * Measured on this database: COMPANY_ADMIN, MANAGER and CONFIRMATION_SUPERVISOR
 * hold `confirmation.supervise` and NOT `confirmation.pull` — three of the
 * nineteen accounts. All three reach `/confirmation/queue`, because the route
 * admits either key so a supervisor can watch the pool. The screen then drew
 * «اسحب الطلب التالي» enabled for them, on the strength of a `canPull` that
 * had only ever been asked about caps, and `POST /api/confirmation/pull`
 * answers `confirmation.pull` with a 403. A button whose every press is
 * refused is a broken button, and hiding it in the browser is not the fix
 * either: the server is the one that knows, so the server says so.
 *
 * Pure, and the authority refusal comes FIRST — telling a supervisor to
 * «سجّل محاولة اتصال» before pulling would be advice about a thing she is
 * never going to be allowed to do.
 */
export function pullPermission(mayPull: boolean, counts: OwnedCounts): PullRefusal | null {
  if (!mayPull) {
    return {
      code: 'NOT_YOUR_DESK',
      message: 'السحب من عمل موظّف التأكيد — هذه الشاشة للإشراف على الطابور لا للعمل عليه.',
    };
  }
  return pullRefusal(counts);
}

/**
 * Release claims that were never worked on. Runs before every pull so the
 * pool self-heals even before the scheduler stage ships.
 */
export async function releaseStaleClaims(tx: Tx, scope: QueueScope, cal: BusinessCalendar, now = new Date()) {
  const stale = await tx.order.findMany({
    where: {
      ...scope,
      claimedById: { not: null },
      confirmationStatus: { in: OPEN_CONFIRMATION },
      contactAttempts: { none: {} },
      claimedAt: { not: null },
    },
    select: { id: true, claimedAt: true, claimedById: true, companyId: true },
    take: 200,
  });

  const expired = stale.filter(
    (o) => businessMinutesBetween(new Date(o.claimedAt!), now, cal) >= AUTO_RELEASE_BUSINESS_MINUTES
  );
  for (const order of expired) {
    await tx.order.updateMany({
      where: { id: order.id, claimedById: order.claimedById },
      data: { claimedById: null, claimedAt: null, currentOwnerId: null, signatureStatus: 'UNSIGNED' },
    });
    await tx.orderClaimHistory.create({
      data: {
        companyId: order.companyId,
        orderId: order.id,
        userId: order.claimedById!,
        action: 'RELEASED',
        reason: `AUTO_RELEASE_${AUTO_RELEASE_BUSINESS_MINUTES}_BUSINESS_MINUTES`,
      },
    });
  }
  return expired.length;
}

/** How many orders are waiting to be pulled (the agent's only queue number). */
export async function waitingCount(tx: Tx, scope: QueueScope, now = new Date()) {
  // Exactly the set `pickNextCandidate` draws from — see the note there.
  const [due, ready] = await Promise.all([
    tx.order.count({ where: duePostponedWhere(scope, now) }),
    tx.order.count({ where: readyToPullWhere(scope) }),
  ]);
  return due + ready;
}

/**
 * Waiting on a date that has not arrived — real work, and none of it
 * takeable today. Counted separately so the screen can say so instead of
 * hiding it inside a number that promises a pull.
 */
export async function postponedNotDueCount(tx: Tx, scope: QueueScope, now = new Date()) {
  const leadEnd = new Date(now.getTime() + POSTPONE_LEAD_DAYS * 24 * 60 * 60 * 1000);
  return tx.order.count({
    where: {
      ...claimableWhere(scope),
      confirmationStatus: 'POSTPONED',
      AND: [
        { OR: [{ postponedUntil: { gt: leadEnd } }, { postponedUntil: null }] },
        { OR: [{ nextFollowUpAt: { gt: leadEnd } }, { nextFollowUpAt: null }] },
      ],
    },
  });
}

/**
 * How many of ONE moderator's orders are still waiting to be confirmed.
 *
 * A moderator brings orders in and then has no way to know what became of
 * them without asking somebody. This is the answer as a number — and only a
 * number. The pool itself stays closed to them (confirmation.pull is not
 * theirs, and the queue route refuses them with 403); what they may know is
 * how many of their OWN are still open, never which order is whose to call.
 *
 * "Waiting" means exactly what it means for the pool — the same open states,
 * not yet shipping — whether or not an agent has already picked it up. From
 * the moderator's side an order an agent is on is still not confirmed.
 */
export async function awaitingConfirmationCount(tx: Tx, scope: QueueScope, moderatorId: string) {
  return tx.order.count({
    where: {
      ...scope,
      moderatorId,
      confirmationStatus: { in: OPEN_CONFIRMATION },
      shippingStatus: 'NOT_READY',
    },
  });
}

function claimableWhere(scope: QueueScope) {
  return {
    ...scope,
    claimedById: null,
    confirmationStatus: { in: OPEN_CONFIRMATION },
    shippingStatus: 'NOT_READY',
  };
}

/**
 * THE TWO HALVES OF «TAKEABLE NOW», WRITTEN ONCE.
 *
 * A postponed order that is not yet due is waiting, and must NOT be handed
 * to anybody: the customer asked to be called on Thursday. The picker has
 * always honoured that. The COUNTER did not — it counted every unclaimed
 * open order — so a pool holding nothing but far-off postponements showed
 * «٣ طلبات بانتظار التأكيد» above a live button that answered «لا توجد
 * طلبات» every time it was pressed.
 *
 * That is the shape of «بعدين ببطل أقدر أسحب أي طلب»: a number that
 * promises work and a button that never yields any. Both read these two
 * predicates now, so they cannot disagree.
 */
export function duePostponedWhere(scope: QueueScope, now: Date) {
  const leadEnd = new Date(now.getTime() + POSTPONE_LEAD_DAYS * 24 * 60 * 60 * 1000);
  return {
    ...claimableWhere(scope),
    confirmationStatus: 'POSTPONED',
    OR: [{ postponedUntil: { lte: leadEnd } }, { nextFollowUpAt: { lte: leadEnd } }],
  };
}

export function readyToPullWhere(scope: QueueScope) {
  return { ...claimableWhere(scope), confirmationStatus: { not: 'POSTPONED' } };
}

/**
 * The next order to work on: a postponed one that is due within the lead
 * days, otherwise the oldest waiting order.
 */
export async function pickNextCandidate(tx: Tx, scope: QueueScope, now = new Date()) {
  // The same two predicates the counter uses — kept as two queries only
  // because they are ordered differently: a promise by its date, and
  // everything else by its age.
  const duePostponed = await tx.order.findFirst({
    where: duePostponedWhere(scope, now),
    orderBy: [{ postponedUntil: 'asc' }, { nextFollowUpAt: 'asc' }],
    select: { id: true },
  });
  if (duePostponed) return duePostponed.id;

  const oldest = await tx.order.findFirst({
    where: readyToPullWhere(scope),
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  return oldest?.id ?? null;
}

export interface PullResult {
  ok: boolean;
  orderId?: string;
  refusal?: PullRefusal;
  released?: number;
  waiting?: number;
}

/**
 * Pull the next order for this agent. The claim is taken with a conditional
 * update, so two agents pulling at the same instant can never get the same
 * order — the loser simply takes the next one.
 */
export async function pullNextOrder(
  scope: QueueScope,
  user: { id: string; role: string },
  cal: BusinessCalendar,
  now = new Date()
): Promise<PullResult> {
  return db.$transaction(async (tx) => {
    const released = await releaseStaleClaims(tx, scope, cal, now);

    const counts = await ownedCounts(tx, scope, user.id);
    const refusal = pullRefusal(counts);
    if (refusal) return { ok: false, refusal, released };

    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = await pickNextCandidate(tx, scope, now);
      if (!candidate) {
        return {
          ok: false,
          released,
          waiting: 0,
          refusal: { code: 'QUEUE_EMPTY', message: 'لا توجد طلبات بانتظار التأكيد الآن.' },
        };
      }

      const taken = await tx.order.updateMany({
        where: { id: candidate, claimedById: null },
        data: {
          claimedById: user.id,
          claimedAt: now,
          currentOwnerId: user.id,
          confirmationStatus: 'IN_PROGRESS',
          status: 'IN_PROGRESS',
          version: { increment: 1 },
        },
      });
      if (taken.count !== 1) continue; // someone else won the race — try the next one

      await tx.orderClaimHistory.create({
        data: {
          companyId: scope.companyId,
          orderId: candidate,
          userId: user.id,
          action: 'CLAIMED',
          reason: 'PULL_NEXT',
          metadata: JSON.stringify({ role: user.role }),
        },
      });
      await tx.orderStatusLog.create({
        data: {
          companyId: scope.companyId,
          orderId: candidate,
          statusType: 'CONFIRMATION',
          previousValue: null,
          newValue: 'IN_PROGRESS',
          changedById: user.id,
          changedByRole: user.role,
          note: 'سحب من الطابور',
        },
      });
      return { ok: true, orderId: candidate, released };
    }
    return { ok: false, released, refusal: { code: 'QUEUE_EMPTY', message: 'تعذر سحب طلب، حاول مجدداً.' } };
  });
}
