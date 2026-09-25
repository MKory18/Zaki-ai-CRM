import type { Prisma } from '@prisma/client';
import { db } from './db';
import { periodOf } from './commission';
import { earnedBy, parseTiers, type CommissionType } from './commission-rules';
import { measure, sampleSize } from './commission-metrics';

type Tx = Prisma.TransactionClient | typeof db;

/**
 * COMMISSION THAT ONLY A CLOSED SPAN CAN ANSWER.
 *
 * "150 confirmed orders in a day pays this much each" is not a fact about
 * any one order: the hundred and fiftieth is what makes the first one worth
 * more, and nothing can be known until the day ends. So these rules are not
 * accrued at delivery like the others — they are accrued once, afterwards,
 * by the scheduler, against the span they cover.
 *
 * The entry carries its span, what was counted in it, and which band that
 * fell into, so the figure on a payslip can be read back to the work that
 * earned it. It carries no order id, because no single order earned it.
 *
 * Running twice is safe: one entry per (person, rule, span) is enforced by
 * the database, so a retried job cannot pay twice.
 */

export const SPANS = ['DAILY', 'WEEKLY', 'MONTHLY'] as const;
export type Span = (typeof SPANS)[number];

/**
 * The span that CLOSED most recently before `now`, in the company's own day.
 *
 * Deliberately the previous span, never the running one: accruing a day
 * while it is still being worked would write a figure that the next order
 * changes, and an entry that moves is not a record of anything.
 */
export function lastClosedSpan(span: Span, now: Date): { start: Date; end: Date } {
  const end = new Date(now);
  end.setHours(0, 0, 0, 0);

  if (span === 'DAILY') {
    const start = new Date(end);
    start.setDate(start.getDate() - 1);
    return { start, end };
  }
  if (span === 'WEEKLY') {
    // The working week here starts on Saturday, as the business calendar does.
    const daysSinceSaturday = (end.getDay() + 1) % 7;
    end.setDate(end.getDate() - daysSinceSaturday);
    const start = new Date(end);
    start.setDate(start.getDate() - 7);
    return { start, end };
  }
  const monthEnd = new Date(end.getFullYear(), end.getMonth(), 1);
  const start = new Date(monthEnd.getFullYear(), monthEnd.getMonth() - 1, 1);
  return { start, end: monthEnd };
}

export interface PeriodRule {
  id: string;
  storeId: string | null;
  appliesToRole: string | null;
  appliesToUserId: string | null;
  type: string;
  value: number | Prisma.Decimal;
  metric: string;
  period: string;
  tiers: unknown;
  minOrders: number | null;
  productId: string | null;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  isActive: boolean;
}

export interface PeriodAccrualResult {
  created: number;
  amount: number;
  /** Why a person earned nothing, for the job's log. */
  skipped: Record<string, number>;
}

/** Everyone a rule applies to: one named person, or everyone in a role. */
async function peopleFor(
  tx: Tx,
  companyId: string,
  rule: PeriodRule
): Promise<{ id: string; role: string; commissionCurrency: string | null }[]> {
  if (rule.appliesToUserId) {
    const one = await tx.user.findFirst({
      where: { id: rule.appliesToUserId, companyId },
      select: { id: true, role: true, commissionCurrency: true },
    });
    return one ? [one] : [];
  }
  if (!rule.appliesToRole) return [];
  return tx.user.findMany({
    where: { companyId, role: rule.appliesToRole, status: 'ACTIVE' },
    select: { id: true, role: true, commissionCurrency: true },
  });
}

/**
 * Accrue every period rule of one store for a span that has closed.
 *
 * A rule is only applied when it was in force for the WHOLE span: a rule
 * that started mid-week did not govern the days before it, and paying it
 * over them would apply an agreement to work done under another.
 */
export async function accrueForPeriod(
  tx: Tx,
  params: {
    companyId: string;
    storeId: string;
    span: Span;
    start: Date;
    end: Date;
    minorUnit: number;
    currencyCode: string;
  }
): Promise<PeriodAccrualResult> {
  const rules = (await tx.commissionRule.findMany({
    where: {
      companyId: params.companyId,
      storeId: params.storeId,
      isActive: true,
      period: params.span,
      effectiveFrom: { lte: params.start },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: params.end } }],
    },
  })) as unknown as PeriodRule[];

  let created = 0;
  let total = 0;
  const skipped: Record<string, number> = {};
  const note = (why: string) => { skipped[why] = (skipped[why] ?? 0) + 1; };

  for (const rule of rules) {
    for (const person of await peopleFor(tx, params.companyId, rule)) {
      const scope = {
        companyId: params.companyId,
        storeId: params.storeId,
        userId: person.id,
        start: params.start,
        end: params.end,
        productId: rule.productId,
      };

      const result = await measure(tx, rule.metric, scope);
      const earned = earnedBy({
        type: (rule.type as CommissionType) ?? 'FIXED',
        value: Number(rule.value),
        tiers: parseTiers(rule.tiers),
        count: result.count,
        sample: rule.minOrders != null ? await sampleSize(tx, rule.metric, scope) : undefined,
        amount: result.amount,
        minorUnit: params.minorUnit,
        minOrders: rule.minOrders,
      });

      if (earned.amount <= 0) {
        note(earned.reason ?? 'NOTHING_EARNED');
        continue;
      }

      // One entry per person, rule and span — the job may run twice.
      const existing = await tx.commissionEntry.findFirst({
        where: {
          userId: person.id,
          ruleId: rule.id,
          periodStart: params.start,
          status: { in: ['ACCRUED', 'PAYABLE', 'PAID'] },
        },
        select: { id: true },
      });
      if (existing) {
        note('ALREADY_ACCRUED');
        continue;
      }

      await tx.commissionEntry.create({
        data: {
          companyId: params.companyId,
          orderId: null,
          userId: person.id,
          role: person.role,
          ruleId: rule.id,
          amount: earned.amount,
          // The person's own currency where they have one — they are paid
          // in it, from whatever wallet holds the money.
          currencyCode: person.commissionCurrency || params.currencyCode,
          status: 'ACCRUED',
          // The month the span ENDED in: that is when the work was finished.
          periodMonth: periodOf(params.end),
          periodStart: params.start,
          periodEnd: params.end,
          counted: result.count,
          tierLabel: earned.tierLabel,
        },
      });
      created++;
      total += earned.amount;
    }
  }

  return { created, amount: total, skipped };
}
