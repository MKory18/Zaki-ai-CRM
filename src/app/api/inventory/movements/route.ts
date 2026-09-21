import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireContext } from '@/lib/geo-context';
import { requirePermission } from '@/lib/authorization';
import { apiErrorResponse } from '@/lib/api-error';

/**
 * GET /api/inventory/movements — the stock ledger.
 *
 * Separate from /api/inventory, which answers "what is on hand". This
 * answers "how did it get that way", and is filtered and paged because a
 * ledger is read by hunting for one product or one day, not by scrolling.
 *
 * Movements are never edited: a wrong one is corrected by another movement
 * in the other direction, the same rule the wallet ledger follows.
 */
export async function GET(req: Request) {
  try {
    const { companyId } = await requireContext();
    await requirePermission('inventory.view');

    const q = new URL(req.url).searchParams;
    const productId = q.get('product')?.trim();
    const type = q.get('type')?.trim();
    const term = q.get('q')?.trim();
    const limit = Math.min(Number(q.get('limit') ?? 100), 300);
    const before = q.get('before');

    const where = {
      companyId,
      ...(productId ? { productId } : {}),
      ...(type && type !== 'all' ? { type } : {}),
      ...(before ? { createdAt: { lt: new Date(before) } } : {}),
      ...(term
        ? {
            OR: [
              { product: { name: { contains: term } } },
              { product: { sku: { contains: term } } },
              { reason: { contains: term } },
              { batch: { batchNumber: { contains: term } } },
            ],
          }
        : {}),
    };

    const movements = await db.inventoryMovement.findMany({
      where,
      include: {
        product: { select: { id: true, name: true, sku: true } },
        batch: { select: { batchNumber: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    const actorIds = [...new Set(movements.map((m) => m.createdById).filter(Boolean))] as string[];
    const actors = actorIds.length
      ? await db.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } })
      : [];
    const nameOf = new Map(actors.map((a) => [a.id, a.name]));

    // Types present in this company, so the filter offers only real ones.
    const types = await db.inventoryMovement.groupBy({
      by: ['type'],
      where: { companyId },
      _count: { type: true },
    });

    return NextResponse.json({
      movements: movements.map((m) => ({
        id: m.id,
        type: m.type,
        quantity: m.quantity,
        balanceAfter: m.balanceAfter,
        reason: m.reason,
        createdAt: m.createdAt,
        product: m.product,
        batchNumber: m.batch?.batchNumber ?? null,
        createdByName: m.createdById ? nameOf.get(m.createdById) ?? null : null,
      })),
      types: types.map((t) => ({ type: t.type, count: t._count.type })),
      hasMore: movements.length === limit,
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
