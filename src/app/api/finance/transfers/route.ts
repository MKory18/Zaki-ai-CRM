import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireContext } from '@/lib/geo-context';
import { requirePermission } from '@/lib/authorization';
import { apiErrorResponse } from '@/lib/api-error';
import { logAudit } from '@/lib/audit';
import { recordMovement } from '@/lib/wallets';
import { roundMinor } from '@/lib/money';
import { zodMessage } from '@/lib/zod-message';

/**
 * Wallet-to-wallet transfers, same or different country.
 *
 * The exchange rate is ENTERED BY THE USER and stored with the transfer. It
 * is never recalculated later: the money changed hands at one rate, on one
 * day, and the books must keep saying so.
 *
 * A transfer is two movements — OUT of one wallet, IN to the other — written
 * in one transaction, so a wallet can never be left short by half a transfer.
 */
const createSchema = z.object({
  fromWalletId: z.string().uuid(),
  toWalletId: z.string().uuid(),
  amountOut: z.number().positive().max(1_000_000_000),
  /** Required only when the two wallets hold different currencies. */
  exchangeRate: z.number().positive().max(1_000_000).optional(),
  note: z.string().trim().min(3, 'الملاحظة إلزامية').max(300),
});

export async function GET() {
  try {
    const { companyId } = await requireContext();
    await requirePermission('finance.cashbox');

    const transfers = await db.walletTransfer.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    const walletIds = [...new Set(transfers.flatMap((t) => [t.fromWalletId, t.toWalletId]))];
    const wallets = walletIds.length
      ? await db.wallet.findMany({ where: { id: { in: walletIds } }, select: { id: true, name: true, currencyCode: true } })
      : [];
    const walletOf = new Map(wallets.map((w) => [w.id, w]));

    return NextResponse.json({
      transfers: transfers.map((t) => ({
        ...t,
        amountOut: Number(t.amountOut),
        amountIn: Number(t.amountIn),
        exchangeRate: Number(t.exchangeRate),
        from: walletOf.get(t.fromWalletId) ?? null,
        to: walletOf.get(t.toWalletId) ?? null,
      })),
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(req: Request) {
  try {
    const { user, companyId } = await requireContext();
    await requirePermission('finance.cashbox');

    const parsed = createSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: zodMessage(parsed.error) }, { status: 400 });
    }
    const input = parsed.data;
    if (input.fromWalletId === input.toWalletId) {
      return NextResponse.json({ error: 'لا يمكن التحويل إلى نفس المحفظة' }, { status: 400 });
    }

    const [from, to] = await Promise.all([
      db.wallet.findFirst({
        where: { id: input.fromWalletId, companyId, isActive: true },
        include: { country: { select: { minorUnit: true } } },
      }),
      db.wallet.findFirst({
        where: { id: input.toWalletId, companyId, isActive: true },
        include: { country: { select: { minorUnit: true } } },
      }),
    ]);
    if (!from || !to) return NextResponse.json({ error: 'إحدى المحفظتين غير موجودة' }, { status: 404 });

    const sameCurrency = from.currencyCode === to.currencyCode;
    if (!sameCurrency && !input.exchangeRate) {
      return NextResponse.json(
        {
          error: `التحويل من ${from.currencyCode} إلى ${to.currencyCode} يتطلب سعر صرف`,
          code: 'EXCHANGE_RATE_REQUIRED',
        },
        { status: 400 }
      );
    }

    const rate = sameCurrency ? 1 : (input.exchangeRate as number);
    const amountIn = roundMinor(input.amountOut * rate, to.country.minorUnit);
    const amountOut = roundMinor(input.amountOut, from.country.minorUnit);

    const transfer = await db.$transaction(async (tx) => {
      const created = await tx.walletTransfer.create({
        data: {
          companyId,
          fromWalletId: from.id,
          toWalletId: to.id,
          amountOut,
          amountIn,
          // Stored as entered; nothing recalculates it later.
          exchangeRate: rate,
          note: input.note,
          createdById: user.id,
        },
      });

      await recordMovement(tx, {
        companyId, walletId: from.id, direction: 'OUT', amount: amountOut,
        party: `تحويل إلى ${to.name}`, category: 'TRANSFER_OUT',
        note: input.note, referenceType: 'TRANSFER', referenceId: created.id, createdById: user.id,
      });
      await recordMovement(tx, {
        companyId, walletId: to.id, direction: 'IN', amount: amountIn,
        party: `تحويل من ${from.name}`, category: 'TRANSFER_IN',
        note: `${input.note}${sameCurrency ? '' : ` (سعر الصرف ${rate})`}`,
        referenceType: 'TRANSFER', referenceId: created.id, createdById: user.id,
      });

      return created;
    });

    await logAudit({
      companyId, userId: user.id, action: 'WALLET_TRANSFER',
      entity: 'WalletTransfer', entityId: transfer.id,
      newData: { from: from.name, to: to.name, amountOut, amountIn, rate },
    });

    return NextResponse.json({ transfer: { ...transfer, amountOut, amountIn, exchangeRate: rate } }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
