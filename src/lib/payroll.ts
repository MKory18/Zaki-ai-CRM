import type { Prisma } from '@prisma/client';
import { db } from './db';
import { roundMinor } from './money';
import { checkWallet, recordSpend } from './pay-from-wallet';

type Tx = Prisma.TransactionClient | typeof db;

/**
 * PAYING A SALARY, AND TAKING THE DEDUCTIONS OUT OF IT.
 *
 * The deductions were recorded, decided, and then reached nothing: a row
 * saying somebody owed the business forty pounds and no moment at which
 * those forty pounds were ever taken. This is that moment, and it is the
 * only one — a deduction becomes money here or nowhere.
 *
 * Two rules hold the whole thing up:
 *
 *   A PAYMENT IS NEVER NEGATIVE. Deductions larger than the salary do not
 *   turn payday into a bill. What fits is settled, what does not stays owed
 *   and is offered against the next payslip. Somebody who was ill for three
 *   weeks gets a small wage, not an invoice.
 *
 *   THE SALARY IS A SNAPSHOT. Read from the employee later, last March
 *   would be rewritten every time somebody gets a rise — and a payslip that
 *   changes is not a record of anything.
 */

export type PayrollRefusal =
  | 'NO_SALARY'
  | 'ALREADY_PAID'
  | 'WALLET_NOT_FOUND'
  | 'BAD_RATE'
  | 'NOTHING_OWED'
  | 'CURRENCY_MISMATCH';

const REFUSAL_AR: Record<PayrollRefusal, string> = {
  NO_SALARY: 'لا راتب مسجّل لهذا الموظف',
  ALREADY_PAID: 'صُرف راتب هذه الفترة من قبل',
  WALLET_NOT_FOUND: 'المحفظة غير موجودة أو موقوفة',
  BAD_RATE: 'سعر الصرف يجب أن يكون أكبر من صفر',
  NOTHING_OWED: 'لا شيء يُصرف',
  CURRENCY_MISMATCH: 'خصمٌ بعملة غير عملة الراتب — لا يُطرح منه',
};

export class PayrollRefused extends Error {
  constructor(public reason: PayrollRefusal) {
    super(REFUSAL_AR[reason]);
  }
}

export function payrollRefusalAr(reason: PayrollRefusal): string {
  return REFUSAL_AR[reason];
}

export interface PayslipPreview {
  salary: number;
  currencyCode: string;
  /** Deductions that fit inside the salary and will be settled. */
  penaltyTotal: number;
  /** What is handed over. Never below zero. */
  net: number;
  /** Deductions that did NOT fit and stay owed for next time. */
  carriedOver: number;
  /** The deductions being settled, oldest first. */
  penaltyIds: string[];
  /** Applied deductions in another currency, which are never netted here. */
  otherCurrency: { currencyCode: string; amount: number }[];
}

/**
 * What this month would pay, before anybody commits to it.
 *
 * Deductions are settled OLDEST FIRST. A newer one left behind is a newer
 * one the person can still remember and still question; leaving the oldest
 * would mean the one charge nobody can reconstruct is the one that survives.
 */
export async function previewPayslip(
  tx: Tx,
  params: { companyId: string; storeId: string; userId: string }
): Promise<PayslipPreview> {
  const person = await tx.user.findFirst({
    where: { id: params.userId, companyId: params.companyId },
    select: { salaryAmount: true, salaryCurrency: true, commissionCurrency: true },
  });
  if (!person?.salaryAmount || Number(person.salaryAmount) <= 0) throw new PayrollRefused('NO_SALARY');

  // The salary's own currency; falling back to the one their commission is
  // counted in, which is the currency somebody already decided they think
  // in. Never the store's by default — that is how an Egyptian employee
  // ends up with a figure in Syrian pounds.
  const currencyCode = person.salaryCurrency ?? person.commissionCurrency ?? null;
  if (!currencyCode) throw new PayrollRefused('NO_SALARY');

  const salary = roundMinor(Number(person.salaryAmount), 2);

  const penalties = await tx.penalty.findMany({
    where: {
      companyId: params.companyId,
      userId: params.userId,
      status: 'APPLIED',
      payslipId: null,
    },
    orderBy: { occurredOn: 'asc' },
    select: { id: true, amount: true, currencyCode: true },
  });

  const mine = penalties.filter((p) => p.currencyCode === currencyCode);
  const others = new Map<string, number>();
  for (const p of penalties) {
    if (p.currencyCode === currencyCode) continue;
    others.set(p.currencyCode, (others.get(p.currencyCode) ?? 0) + Number(p.amount));
  }

  // Oldest first, until the salary runs out.
  let taken = 0;
  const penaltyIds: string[] = [];
  let carriedOver = 0;
  for (const p of mine) {
    const amount = Number(p.amount);
    if (taken + amount <= salary) {
      taken = roundMinor(taken + amount, 2);
      penaltyIds.push(p.id);
    } else {
      // Not split across two payslips: half a deduction settled is a row
      // nobody can explain. It waits whole.
      carriedOver = roundMinor(carriedOver + amount, 2);
    }
  }

  return {
    salary,
    currencyCode,
    penaltyTotal: taken,
    net: roundMinor(salary - taken, 2),
    carriedOver,
    penaltyIds,
    otherCurrency: [...others.entries()].map(([currencyCode, amount]) => ({ currencyCode, amount })),
  };
}

export interface PayInput {
  companyId: string;
  storeId: string;
  userId: string;
  walletId: string;
  periodStart: Date;
  periodEnd: Date;
  exchangeRate: number;
  note?: string | null;
  createdById: string;
}

export interface PayslipResult {
  payslipId: string;
  salary: number;
  penaltyTotal: number;
  net: number;
  carriedOver: number;
  currencyCode: string;
  paidAmount: number;
  paidCurrency: string;
}

/**
 * Pay one period's salary, net of what fits.
 *
 * All of it in one transaction: the payslip, the deductions stamped with
 * its id, and the money leaving the wallet. Any two of those without the
 * third is a person paid twice or a deduction taken twice, and both are
 * discovered a month later by the person they happened to.
 */
export async function paySalary(tx: Tx, input: PayInput): Promise<PayslipResult> {
  const preview = await previewPayslip(tx, input);

  // One payslip per person per period start. The database says so too;
  // this says it in Arabic before the constraint says it in Latin.
  const existing = await tx.payslip.findFirst({
    where: { companyId: input.companyId, userId: input.userId, periodStart: input.periodStart },
    select: { id: true },
  });
  if (existing) throw new PayrollRefused('ALREADY_PAID');

  // A salary entirely eaten by deductions pays nothing — and must not
  // create a movement of zero, which would read as a payment that happened.
  if (preview.net <= 0) throw new PayrollRefused('NOTHING_OWED');

  const wallet = await checkWallet(tx, {
    companyId: input.companyId,
    walletId: input.walletId,
    amount: preview.net,
    exchangeRate: input.exchangeRate,
  });
  if (typeof wallet === 'string') throw new PayrollRefused(wallet);

  const payslip = await tx.payslip.create({
    data: {
      companyId: input.companyId,
      storeId: input.storeId,
      userId: input.userId,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      salaryAmount: preview.salary,
      currencyCode: preview.currencyCode,
      penaltyTotal: preview.penaltyTotal,
      netAmount: preview.net,
      carriedOver: preview.carriedOver,
      walletId: wallet.walletId,
      paidAmount: wallet.paidAmount,
      paidCurrency: wallet.currencyCode,
      exchangeRate: input.exchangeRate,
      note: input.note ?? null,
      createdById: input.createdById,
    },
  });

  if (preview.penaltyIds.length > 0) {
    // Stamped, not deleted: the deduction stays in the record and now says
    // which payslip took it.
    await tx.penalty.updateMany({
      where: { id: { in: preview.penaltyIds }, payslipId: null },
      data: { payslipId: payslip.id },
    });
  }

  const person = await tx.user.findFirst({ where: { id: input.userId }, select: { name: true } });

  await recordSpend(
    tx,
    {
      companyId: input.companyId,
      walletId: wallet.walletId,
      amount: preview.net,
      currencyCode: preview.currencyCode,
      exchangeRate: input.exchangeRate,
      personName: person?.name ?? 'موظف',
      // A salary is an expense of the business like any other, and belongs
      // in the same ledger the rest of the money lives in.
      category: 'EXPENSE',
      referenceType: 'PAYSLIP',
      referenceId: payslip.id,
      note:
        preview.penaltyTotal > 0
          ? `راتب — ${preview.salary} ناقص خصومات ${preview.penaltyTotal}`
          : `راتب ${preview.salary} ${preview.currencyCode}`,
      createdById: input.createdById,
    },
    wallet
  );

  return {
    payslipId: payslip.id,
    salary: preview.salary,
    penaltyTotal: preview.penaltyTotal,
    net: preview.net,
    carriedOver: preview.carriedOver,
    currencyCode: preview.currencyCode,
    paidAmount: wallet.paidAmount,
    paidCurrency: wallet.currencyCode,
  };
}
