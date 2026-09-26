import type { Prisma } from '@prisma/client';
import type { db } from './db';
import { roundMinor } from './money';

type Tx = Prisma.TransactionClient | typeof db;

export class OpeningCountRefused extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message);
  }
}

/**
 * THE SIGNED PHYSICAL COUNT BEHIND AN OPENING BALANCE.
 *
 * The cutover asks for one thing here that the system could not answer: every
 * wallet's opening balance comes from a physical count taken at the switch
 * time, **signed by the person counting**.
 *
 * WHAT ALREADY EXISTED, AND IS NOT REBUILT. `Wallet.openingBalance` is a real
 * column, it is a term in `walletBalance` (opening + IN − OUT) and therefore
 * in every daily closing, and it is ALREADY immutable after creation — the
 * wallet PATCH schema accepts `name` and `isActive` and nothing else. None of
 * that is touched.
 *
 * WHAT WAS MISSING. Who counted, and when. The audit log records who CREATED
 * the wallet, and that is the person who typed the number, not the two people
 * who counted a drawer at seven in the morning. A wallet opened at zero and a
 * wallet opened at 4,350 after a real count were the same shape of data.
 *
 * WHY IT IS NOT A CORRECTION INSTRUMENT. The hard call here was what to do
 * with a wallet that already has movements. The tempting answer is to post an
 * ADJUSTMENT movement for the difference — and it is the wrong answer twice:
 * it would make «opening balance» mean «balance at some later moment», and it
 * would duplicate the daily closing, which already compares the book balance
 * against a counted one and makes somebody explain the gap in writing. So a
 * wallet that has started moving is REFUSED, and the message says where to
 * go instead. A second mechanism for reconciling a live balance is how two
 * numbers for the same money come to exist.
 */
export async function recordOpeningCount(
  tx: Tx,
  input: {
    companyId: string;
    walletId: string;
    countedAmount: number;
    /** The person who physically counted. Not a user id — see the schema. */
    countedByName: string;
    /** When the money was counted, not when this was typed. */
    countedAt: Date;
    note?: string | null;
    recordedById: string;
    /** For rounding the stored amount to the currency's own precision. */
    minorUnit?: number;
    /** Injected so the rule is testable without freezing the clock. */
    now?: Date;
  }
) {
  const now = input.now ?? new Date();

  const wallet = await tx.wallet.findFirst({
    where: { id: input.walletId, companyId: input.companyId },
    select: {
      id: true,
      name: true,
      currencyCode: true,
      openingBalance: true,
      _count: { select: { movements: true } },
      openingCount: { select: { id: true, countedByName: true, countedAt: true } },
    },
  });
  if (!wallet) throw new OpeningCountRefused('NOT_FOUND', 'المحفظة غير موجودة');

  // Once, ever. The count is the statement of where the money started.
  if (wallet.openingCount) {
    const when = wallet.openingCount.countedAt.toISOString().slice(0, 10);
    throw new OpeningCountRefused(
      'ALREADY_COUNTED',
      `عُدَّت «${wallet.name}» مرّةً بمعرفة ${wallet.openingCount.countedByName} في ${when}. ` +
        'الرصيد الافتتاحيّ يُسجَّل مرّةً واحدةً ولا يُعاد.'
    );
  }

  // A wallet that has started moving is reconciled by the daily closing.
  if (wallet._count.movements > 0) {
    throw new OpeningCountRefused(
      'WALLET_HAS_MOVEMENTS',
      `«${wallet.name}» لها ${wallet._count.movements} حركة — والعدُّ الفعليُّ لرصيدٍ متحرّكٍ ` +
        'هو الإغلاق اليوميّ لا الرصيد الافتتاحيّ. سجّل الفرق هناك بتفسيرٍ مكتوب.'
    );
  }

  // «Signed by the person counting» is the whole point of the row.
  const countedByName = input.countedByName.trim();
  if (countedByName.length < 3) {
    throw new OpeningCountRefused('NO_COUNTER', 'اسم من عدَّ المبلغ مطلوب — العدُّ بلا اسمٍ ليس عدّاً موقَّعاً');
  }

  // A count is a past event. A future timestamp is a typo or a fiction.
  if (input.countedAt.getTime() > now.getTime() + 60_000) {
    throw new OpeningCountRefused('COUNT_IN_FUTURE', 'وقت العدّ في المستقبل');
  }

  if (!Number.isFinite(input.countedAmount) || Math.abs(input.countedAmount) > 1_000_000_000) {
    throw new OpeningCountRefused('AMOUNT_OUT_OF_RANGE', 'المبلغ المعدود خارج النطاق');
  }

  const minorUnit = input.minorUnit ?? 3;
  const countedAmount = roundMinor(input.countedAmount, minorUnit);
  const previousOpening = Number(wallet.openingBalance);

  const count = await tx.walletOpeningCount.create({
    data: {
      companyId: input.companyId,
      walletId: wallet.id,
      countedAmount,
      currencyCode: wallet.currencyCode,
      countedByName,
      countedAt: input.countedAt,
      previousOpening,
      note: input.note?.trim() || null,
      recordedById: input.recordedById,
    },
  });

  // The count IS the opening balance. Written in the same transaction so
  // there is no instant in which the money was counted and the wallet
  // disagrees with the count.
  await tx.wallet.update({
    where: { id: wallet.id },
    data: { openingBalance: countedAmount },
  });

  return { count, previousOpening, countedAmount, walletName: wallet.name };
}
