import type { Prisma } from '@prisma/client';
import { db } from './db';
import { roundMinor } from './money';

type Tx = Prisma.TransactionClient | typeof db;

/**
 * PAYING COMMISSION OUT — the end of the loop that was missing.
 *
 * An entry used to reach PAYABLE and stop. Nothing turned it into money:
 * no wallet was touched, no expense was recorded, and the person's balance
 * stayed owed for ever while the cash left the drawer by hand.
 *
 * Two currencies meet here, and they are not the same question:
 *
 *   the person's — what they earned, and what they are told they earned.
 *                  An Egyptian moderator counts in pounds.
 *   the wallet's — what actually left the business. There may be no pound
 *                  wallet at all; the money leaves the dollar one.
 *
 * So the rate is entered by the owner AT PAYOUT, not at accrual: which
 * wallet will pay is not known before then, and a rate guessed earlier
 * would be a rate nobody agreed to. It is stored and never recalculated —
 * the same rule as a wallet transfer. A month already paid reads the same
 * next year, whatever the market did since.
 */

export interface PayoutInput {
  companyId: string;
  userId: string;
  walletId: string;
  /** The entries being settled. They must all belong to this person. */
  entryIds: string[];
  /** Wallet currency per person currency, as the owner wrote it. */
  exchangeRate: number;
  note?: string | null;
  createdById: string;
}

export type PayoutRefusal =
  | 'NO_ENTRIES'
  | 'NOT_PAYABLE'
  | 'WRONG_PERSON'
  | 'MIXED_CURRENCY'
  | 'WALLET_NOT_FOUND'
  | 'BAD_RATE'
  | 'NOTHING_OWED';

export interface PayoutResult {
  payoutId: string;
  /** What the person earned, in their own currency. */
  amount: number;
  currencyCode: string;
  /** What left the wallet, in the wallet's currency. */
  paidAmount: number;
  paidCurrency: string;
  entries: number;
}

const REFUSAL_AR: Record<PayoutRefusal, string> = {
  NO_ENTRIES: 'لم تُحدَّد أي عمولة للصرف',
  NOT_PAYABLE: 'فيها عمولة غير مستحقة بعد — تصير مستحقة عند اعتماد كشف التحصيل',
  WRONG_PERSON: 'العمولات المحدَّدة ليست كلها لهذا الموظف',
  MIXED_CURRENCY: 'العمولات المحدَّدة بعملات مختلفة — اصرف كل عملة على حدة',
  WALLET_NOT_FOUND: 'المحفظة غير موجودة أو غير مفعّلة',
  BAD_RATE: 'سعر الصرف يجب أن يكون أكبر من صفر',
  NOTHING_OWED: 'مجموع العمولات المحدَّدة صفر',
};

export function payoutRefusalAr(reason: PayoutRefusal): string {
  return REFUSAL_AR[reason];
}

export class PayoutRefused extends Error {
  constructor(public reason: PayoutRefusal) {
    super(REFUSAL_AR[reason]);
  }
}

/**
 * Pay a set of entries, from one wallet, at one rate.
 *
 * Everything happens in one transaction: the entries become PAID and point
 * at the payout, the money leaves the wallet as a movement, and the two can
 * never disagree about whether a person was paid.
 *
 * Nothing is deleted, here or ever. A payout made in error is undone by a
 * reversing movement, not by removing a record of money that moved.
 */
export async function payCommission(tx: Tx, input: PayoutInput): Promise<PayoutResult> {
  if (input.entryIds.length === 0) throw new PayoutRefused('NO_ENTRIES');
  if (!(input.exchangeRate > 0)) throw new PayoutRefused('BAD_RATE');

  const wallet = await tx.wallet.findFirst({
    where: { id: input.walletId, companyId: input.companyId, isActive: true },
    select: { id: true, currencyCode: true, name: true, country: { select: { minorUnit: true } } },
  });
  if (!wallet) throw new PayoutRefused('WALLET_NOT_FOUND');

  const entries = await tx.commissionEntry.findMany({
    where: { id: { in: input.entryIds }, companyId: input.companyId },
    select: { id: true, userId: true, status: true, amount: true, currencyCode: true, payoutId: true },
  });

  if (entries.length !== input.entryIds.length) throw new PayoutRefused('NO_ENTRIES');
  if (entries.some((e) => e.userId !== input.userId)) throw new PayoutRefused('WRONG_PERSON');
  // Only what a settlement has already made payable, and never twice.
  if (entries.some((e) => e.status !== 'PAYABLE' || e.payoutId)) throw new PayoutRefused('NOT_PAYABLE');

  const currency = entries[0].currencyCode;
  if (entries.some((e) => e.currencyCode !== currency)) throw new PayoutRefused('MIXED_CURRENCY');

  // The person's currency uses their own rounding; the wallet's uses its
  // country's. Rounding both by one minor unit would give a Jordanian
  // wallet two decimals or an Egyptian one three.
  const amount = roundMinor(entries.reduce((sum, e) => sum + Number(e.amount), 0), 3);
  if (amount <= 0) throw new PayoutRefused('NOTHING_OWED');

  const paidAmount = roundMinor(amount * input.exchangeRate, wallet.country.minorUnit);

  const payout = await tx.commissionPayout.create({
    data: {
      companyId: input.companyId,
      userId: input.userId,
      walletId: wallet.id,
      amount,
      currencyCode: currency,
      paidAmount,
      paidCurrency: wallet.currencyCode,
      exchangeRate: input.exchangeRate,
      note: input.note ?? null,
      createdById: input.createdById,
    },
  });

  await tx.commissionEntry.updateMany({
    where: { id: { in: input.entryIds } },
    data: { status: 'PAID', payoutId: payout.id },
  });

  const person = await tx.user.findFirst({ where: { id: input.userId }, select: { name: true } });

  // The money leaving, in the wallet's own currency — an expense of the
  // business, in the one place every other movement is recorded.
  await tx.walletMovement.create({
    data: {
      companyId: input.companyId,
      walletId: wallet.id,
      direction: 'OUT',
      amount: paidAmount,
      currencyCode: wallet.currencyCode,
      party: person?.name ?? 'موظف',
      category: 'COMMISSION',
      note:
        currency === wallet.currencyCode
          ? `صرف عمولة — ${entries.length} قيد`
          : `صرف عمولة — ${amount} ${currency} بسعر ${input.exchangeRate}`,
      referenceType: 'COMMISSION_PERIOD',
      referenceId: payout.id,
      createdById: input.createdById,
    },
  });

  return {
    payoutId: payout.id,
    amount,
    currencyCode: currency,
    paidAmount,
    paidCurrency: wallet.currencyCode,
    entries: entries.length,
  };
}

/**
 * What a person is owed, in their own currency.
 *
 * Grouped by currency on purpose: a person whose currency changed mid-year
 * has two balances, and adding them would invent a number in neither.
 */
export async function owedTo(
  tx: Tx,
  params: { companyId: string; userId: string }
): Promise<{ currencyCode: string; amount: number; entries: string[] }[]> {
  const entries = await tx.commissionEntry.findMany({
    where: { companyId: params.companyId, userId: params.userId, status: 'PAYABLE', payoutId: null },
    select: { id: true, amount: true, currencyCode: true },
  });

  const byCurrency = new Map<string, { amount: number; entries: string[] }>();
  for (const e of entries) {
    const row = byCurrency.get(e.currencyCode) ?? { amount: 0, entries: [] };
    row.amount += Number(e.amount);
    row.entries.push(e.id);
    byCurrency.set(e.currencyCode, row);
  }

  return [...byCurrency].map(([currencyCode, row]) => ({
    currencyCode,
    amount: roundMinor(row.amount, 3),
    entries: row.entries,
  }));
}
