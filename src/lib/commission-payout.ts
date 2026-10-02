import type { Prisma } from '@prisma/client';
import { db } from './db';
import { roundMinor } from './money';
import { checkWallet, recordSpend } from './pay-from-wallet';
import { PROMOTABLE_BY_PAYOUT, promoteSettledToPayable } from './commission';

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

  /**
   * ── FIRST, PROMOTE WHAT IS ALREADY SETTLED ──
   *
   * Statement approval promotes in a MOMENT, and on the normal path the
   * entry is accrued hours AFTER that moment: an order the statement
   * delivered becomes DELIVERED and SETTLED in one transaction, and the
   * accrual job writes its entry that night. The entry is then ACCRUED with
   * its money already in the wallet, and the only writer of PAYABLE has
   * already run — so this door used to refuse it for ever, with a message
   * naming an approval months past. The whole reasoning is beside
   * `PROMOTABLE_BY_PAYOUT` in commission.ts; the rule is that a moment
   * cannot catch what arrives after it, so the door asks the STATE.
   *
   * BEFORE the read, so what is read below is already true, and the four
   * guards underneath keep their full force over it: nothing here loosens
   * them, it only lets an entry whose money is in reach them. An entry whose
   * order is NOT settled is not promoted, is refused by those guards, and
   * NOT_PAYABLE then says something true — the statement really has not been
   * approved yet.
   *
   * Inside the caller's transaction, which is where everything in this
   * function belongs: if any guard below refuses, or the wallet has not got
   * the money, the promotion rolls back with the payment. Nothing is left
   * promoted by a payout that did not happen.
   */
  await promoteSettledToPayable(tx, {
    companyId: input.companyId,
    userId: input.userId,
    entryIds: input.entryIds,
  });

  const entries = await tx.commissionEntry.findMany({
    where: { id: { in: input.entryIds }, companyId: input.companyId },
    select: { id: true, userId: true, status: true, amount: true, currencyCode: true, payoutId: true },
  });

  if (entries.length !== input.entryIds.length) throw new PayoutRefused('NO_ENTRIES');
  if (entries.some((e) => e.userId !== input.userId)) throw new PayoutRefused('WRONG_PERSON');
  // Only what a settlement has already made payable — whether that was the
  // statement's own moment or the promotion above — and never twice.
  if (entries.some((e) => e.status !== 'PAYABLE' || e.payoutId)) throw new PayoutRefused('NOT_PAYABLE');

  const currency = entries[0].currencyCode;
  if (entries.some((e) => e.currencyCode !== currency)) throw new PayoutRefused('MIXED_CURRENCY');

  // The person's currency uses their own rounding; the wallet's uses its
  // country's. Rounding both by one minor unit would give a Jordanian
  // wallet two decimals or an Egyptian one three.
  const amount = roundMinor(entries.reduce((sum, e) => sum + Number(e.amount), 0), 3);
  if (amount <= 0) throw new PayoutRefused('NOTHING_OWED');

  // The wallet, the rate and what would actually leave it — worked out by
  // the one function that knows how money leaves a wallet to pay a person,
  // so a payslip and a commission payout can never round differently.
  const wallet = await checkWallet(tx, {
    companyId: input.companyId,
    walletId: input.walletId,
    amount,
    exchangeRate: input.exchangeRate,
  });
  if (typeof wallet === 'string') throw new PayoutRefused(wallet);
  const paidAmount = wallet.paidAmount;

  const payout = await tx.commissionPayout.create({
    data: {
      companyId: input.companyId,
      userId: input.userId,
      walletId: wallet.walletId,
      amount,
      currencyCode: currency,
      paidAmount,
      paidCurrency: wallet.currencyCode,
      exchangeRate: input.exchangeRate,
      note: input.note ?? null,
      createdById: input.createdById,
    },
  });

  /**
   * ── AND THE CLAIM THAT MAKES IT UNREPEATABLE ──
   *
   * `status: 'PAYABLE', payoutId: null` is in the WHERE, not only in the
   * check above. The check reads, and a read is a photograph: two payouts
   * started at once both photograph PAYABLE, both create a payout row, and
   * an unconditional `updateMany` by id lets the second overwrite the first
   * one's `payoutId` — one person paid twice, with the second payment's
   * movement sitting in the wallet and only one payout reachable from the
   * entry. With the condition in the WHERE this becomes a claim: Postgres
   * makes the second transaction wait on the row lock, and when it looks
   * again the status is PAID, so it matches nothing.
   *
   * Hence the count. Matching fewer rows than we are paying for means
   * somebody else claimed them between the read and here, and the whole
   * transaction — payout row, wallet movement and all — must go, which is
   * what throwing inside the caller's transaction does.
   */
  const claimed = await tx.commissionEntry.updateMany({
    where: {
      id: { in: input.entryIds },
      companyId: input.companyId,
      status: 'PAYABLE',
      payoutId: null,
    },
    data: { status: 'PAID', payoutId: payout.id },
  });
  if (claimed.count !== input.entryIds.length) throw new PayoutRefused('NOT_PAYABLE');

  const person = await tx.user.findFirst({ where: { id: input.userId }, select: { name: true } });

  // The money leaving, in the wallet's own currency — an expense of the
  // business, in the one place every other movement is recorded.
  await recordSpend(
    tx,
    {
      companyId: input.companyId,
      walletId: wallet.walletId,
      amount,
      currencyCode: currency,
      exchangeRate: input.exchangeRate,
      personName: person?.name ?? 'موظف',
      category: 'COMMISSION',
      referenceType: 'COMMISSION_PERIOD',
      referenceId: payout.id,
      note: `صرف عمولة — ${entries.length} قيد`,
      createdById: input.createdById,
    },
    wallet
  );

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
 *
 * AND IT COUNTS WHAT THE PAYOUT WOULD PROMOTE, not only what carries the
 * PAYABLE label today. This is the same list the dialog ticks and sends
 * back as `entryIds`, so a figure read here that the door would not accept —
 * or an entry the door would gladly pay that never appears here — is a
 * balance nobody can ever collect. An order the statement delivered is
 * settled with its money in the wallet and its entry still ACCRUED; it is
 * owed, the person is told it is owed on their performance card and their
 * payslip, and leaving it out of this one query was what made it
 * unreachable rather than merely mislabelled. The two arms are the only two
 * things a payout accepts, written where the payout defines them.
 */
export async function owedTo(
  tx: Tx,
  params: { companyId: string; userId: string }
): Promise<{ currencyCode: string; amount: number; entries: string[] }[]> {
  const entries = await tx.commissionEntry.findMany({
    where: {
      companyId: params.companyId,
      userId: params.userId,
      payoutId: null,
      OR: [{ status: 'PAYABLE' }, PROMOTABLE_BY_PAYOUT],
    },
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
