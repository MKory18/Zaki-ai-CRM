import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireContext } from '@/lib/geo-context';
import { requirePermission } from '@/lib/authorization';
import { apiErrorResponse } from '@/lib/api-error';
import { logAudit } from '@/lib/audit';
import { zodMessage } from '@/lib/zod-message';
import { OpeningCountRefused, recordOpeningCount } from '@/lib/wallet-opening-count';

/**
 * POST /api/finance/wallets/[id]/opening-count
 *
 * The signed physical count that sets a wallet's opening balance on cutover
 * day. Guarded by `finance.cashbox` — the permission that already governs
 * creating and retiring a wallet. Naming the money a wallet starts with is
 * part of managing the wallet, and a new permission key would be one more
 * grant somebody has to remember before the cutover works at all.
 *
 * Every rule lives in `recordOpeningCount`, so the worker, a script or a
 * second screen cannot reach a different set of them.
 */

const bodySchema = z.object({
  countedAmount: z.number().min(-1_000_000_000).max(1_000_000_000),
  countedByName: z.string().trim().min(3, 'اسم من عدَّ المبلغ مطلوب').max(120),
  countedAt: z.string().datetime({ offset: true }).or(z.string().datetime()),
  note: z.string().trim().max(500).optional().nullable(),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { user, companyId } = await requireContext();
    await requirePermission('finance.cashbox');

    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: zodMessage(parsed.error) }, { status: 400 });
    }

    // The currency's own precision, from the wallet's country. Never a single
    // global rounding rule — an invariant, and Syria is 2 while Jordan is 3.
    const wallet = await db.wallet.findFirst({
      where: { id, companyId },
      select: { id: true, country: { select: { minorUnit: true } } },
    });
    if (!wallet) return NextResponse.json({ error: 'المحفظة غير موجودة' }, { status: 404 });

    try {
      const result = await db.$transaction((tx) =>
        recordOpeningCount(tx, {
          companyId,
          walletId: id,
          countedAmount: parsed.data.countedAmount,
          countedByName: parsed.data.countedByName,
          countedAt: new Date(parsed.data.countedAt),
          note: parsed.data.note,
          recordedById: user.id,
          minorUnit: wallet.country.minorUnit,
        })
      );

      await logAudit({
        companyId,
        userId: user.id,
        action: 'WALLET_OPENING_COUNTED',
        entity: 'Wallet',
        entityId: id,
        previousData: { openingBalance: result.previousOpening },
        newData: {
          openingBalance: result.countedAmount,
          countedByName: result.count.countedByName,
          countedAt: result.count.countedAt.toISOString(),
          recordedBy: user.name,
        },
      });

      return NextResponse.json({ openingCount: result.count }, { status: 201 });
    } catch (e: unknown) {
      if (e instanceof OpeningCountRefused) {
        const status = e.code === 'NOT_FOUND' ? 404 : e.code === 'ALREADY_COUNTED' || e.code === 'WALLET_HAS_MOVEMENTS' ? 409 : 400;
        return NextResponse.json({ error: e.message, code: e.code }, { status });
      }
      throw e;
    }
  } catch (error) {
    return apiErrorResponse(error);
  }
}
