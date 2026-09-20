import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireContext } from '@/lib/geo-context';
import { requirePermission } from '@/lib/authorization';
import { apiErrorResponse } from '@/lib/api-error';
import { logAudit } from '@/lib/audit';
import { MOVEMENT_CATEGORIES, recordMovement, reverseMovement, walletBalance } from '@/lib/wallets';

/**
 * Wallet movements.
 *
 *   GET   /api/finance/wallets/:id/movements
 *   POST  /api/finance/wallets/:id/movements        record one
 *   PATCH /api/finance/wallets/:id/movements        reverse one (with a reason)
 *
 * There is NO DELETE, for any role including the owner: a correction is a
 * reversing entry linked to the original.
 */

const createSchema = z.object({
  direction: z.enum(['IN', 'OUT']),
  amount: z.number().positive().max(1_000_000_000),
  party: z.string().trim().min(2, 'اذكر الطرف').max(120),
  category: z.enum(MOVEMENT_CATEGORIES),
  note: z.string().trim().min(3, 'الملاحظة إلزامية').max(300),
});

const reverseSchema = z.object({
  movementId: z.string().uuid(),
  reason: z.string().trim().min(5, 'سبب القيد العكسي إلزامي').max(300),
});

async function walletOf(id: string, companyId: string) {
  return db.wallet.findFirst({
    where: { id, companyId },
    include: { country: { select: { minorUnit: true } } },
  });
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { companyId } = await requireContext();
    await requirePermission('finance.cashbox');

    const wallet = await walletOf(id, companyId);
    if (!wallet) return NextResponse.json({ error: 'المحفظة غير موجودة' }, { status: 404 });

    const take = Math.min(Number(new URL(req.url).searchParams.get('limit') ?? 100), 300);
    const movements = await db.walletMovement.findMany({
      where: { walletId: id },
      orderBy: { createdAt: 'desc' },
      take,
      include: { reversalOf: { select: { id: true, note: true } }, reversedBy: { select: { id: true } } },
    });

    const actorIds = [...new Set(movements.map((m) => m.createdById))];
    const actors = actorIds.length
      ? await db.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } })
      : [];
    const nameOf = new Map(actors.map((a) => [a.id, a.name]));

    return NextResponse.json({
      balance: await walletBalance(db, id, wallet.country.minorUnit),
      movements: movements.map((m) => ({
        ...m,
        amount: Number(m.amount),
        createdByName: nameOf.get(m.createdById) ?? null,
        isReversal: !!m.reversalOfId,
        wasReversed: !!m.reversedBy,
      })),
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { user, companyId } = await requireContext();
    await requirePermission('finance.cashbox');

    const wallet = await walletOf(id, companyId);
    if (!wallet) return NextResponse.json({ error: 'المحفظة غير موجودة' }, { status: 404 });
    if (!wallet.isActive) return NextResponse.json({ error: 'المحفظة موقوفة' }, { status: 409 });

    const parsed = createSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message || 'بيانات غير صالحة' }, { status: 400 });
    }

    const movement = await recordMovement(db, {
      companyId,
      walletId: id,
      direction: parsed.data.direction,
      amount: parsed.data.amount,
      party: parsed.data.party,
      category: parsed.data.category,
      note: parsed.data.note,
      createdById: user.id,
    });

    await logAudit({
      companyId, userId: user.id, action: 'WALLET_MOVEMENT_RECORDED',
      entity: 'WalletMovement', entityId: movement.id,
      newData: { wallet: wallet.name, ...parsed.data },
    });

    return NextResponse.json(
      { movement, balance: await walletBalance(db, id, wallet.country.minorUnit) },
      { status: 201 }
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { user, companyId } = await requireContext();
    await requirePermission('finance.cashbox');

    const wallet = await walletOf(id, companyId);
    if (!wallet) return NextResponse.json({ error: 'المحفظة غير موجودة' }, { status: 404 });

    const parsed = reverseSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message || 'بيانات غير صالحة' }, { status: 400 });
    }

    try {
      const reversal = await reverseMovement(db, {
        companyId,
        movementId: parsed.data.movementId,
        reason: parsed.data.reason,
        createdById: user.id,
      });
      await logAudit({
        companyId, userId: user.id, action: 'WALLET_MOVEMENT_REVERSED',
        entity: 'WalletMovement', entityId: reversal.id,
        previousData: { original: parsed.data.movementId },
        newData: { reason: parsed.data.reason },
      });
      return NextResponse.json(
        { reversal, balance: await walletBalance(db, id, wallet.country.minorUnit) },
        { status: 201 }
      );
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : 'تعذر القيد العكسي' }, { status: 409 });
    }
  } catch (error) {
    return apiErrorResponse(error);
  }
}
