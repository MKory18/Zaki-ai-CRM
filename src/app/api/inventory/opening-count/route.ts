import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireContext } from '@/lib/geo-context';
import { requirePermission } from '@/lib/authorization';
import { apiErrorResponse } from '@/lib/api-error';
import { logAudit } from '@/lib/audit';
import { zodMessage } from '@/lib/zod-message';
import { OpeningStockRefused, recordOpeningStockCount } from '@/lib/stock-opening-count';
import { inStore } from '@/lib/store-filter';

/**
 * GET  /api/inventory/opening-count — the count this store started from, if any.
 * POST /api/inventory/opening-count — take it, once.
 *
 * Guarded by `inventory.adjust`, the permission that already governs putting
 * stock in. A new key would be one more grant somebody has to remember before
 * the cutover works at all.
 *
 * Every rule lives in `recordOpeningStockCount`, so a script or a second
 * screen cannot reach a different set of them.
 */

const bodySchema = z.object({
  countedByName: z.string().trim().min(3, 'اسم من عدَّ المخزون مطلوب').max(120),
  countedAt: z.string().datetime({ offset: true }).or(z.string().datetime()),
  note: z.string().trim().max(500).optional().nullable(),
  lines: z
    .array(
      z.object({
        productId: z.string().min(1),
        countedQty: z.number().int().min(0).max(10_000_000),
        unitCost: z.number().min(0).max(1_000_000_000),
        zeroCostReason: z.string().trim().max(200).optional().nullable(),
      })
    )
    .min(1, 'العدّ بلا بنود')
    .max(2000),
});

export async function GET() {
  try {
    const { companyId, storeId } = await requireContext();
    await requirePermission('inventory.view');
    if (!storeId) return NextResponse.json({ error: 'اختر المتجر أولاً', code: 'STORE_REQUIRED' }, { status: 400 });

    const [count, moved, products] = await Promise.all([
      db.stockOpeningCount.findUnique({
        where: { storeId },
        select: {
          countedByName: true,
          countedAt: true,
          note: true,
          createdAt: true,
          _count: { select: { batches: true } },
        },
      }),
      db.inventoryMovement.count({ where: { companyId, storeId } }),
      db.product.findMany({
        where: inStore(companyId, storeId),
        select: { id: true, name: true, sku: true },
        orderBy: { name: 'asc' },
      }),
    ]);

    // Both halves of «can this still be counted», so the screen never offers
    // a button whose only outcome is a red error.
    return NextResponse.json({ count, movements: moved, countable: !count && moved === 0, products });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(req: Request) {
  try {
    const { user, companyId, storeId } = await requireContext();
    await requirePermission('inventory.adjust');
    if (!storeId) return NextResponse.json({ error: 'اختر المتجر أولاً', code: 'STORE_REQUIRED' }, { status: 400 });

    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: zodMessage(parsed.error) }, { status: 400 });
    }

    try {
      const result = await db.$transaction((tx) =>
        recordOpeningStockCount(tx, {
          companyId,
          storeId,
          countedByName: parsed.data.countedByName,
          countedAt: new Date(parsed.data.countedAt),
          note: parsed.data.note,
          lines: parsed.data.lines,
          recordedById: user.id,
        })
      );

      await logAudit({
        companyId,
        userId: user.id,
        action: 'STOCK_OPENING_COUNTED',
        entity: 'Store',
        entityId: storeId,
        newData: {
          countedByName: result.count.countedByName,
          countedAt: result.count.countedAt.toISOString(),
          lines: result.placed.length,
          units: result.placed.reduce((sum, p) => sum + p.qty, 0),
          recordedBy: user.name,
        },
      });

      return NextResponse.json({ count: result.count, placed: result.placed }, { status: 201 });
    } catch (e: unknown) {
      if (e instanceof OpeningStockRefused) {
        const status = e.code === 'ALREADY_COUNTED' || e.code === 'STOCK_HAS_MOVED' ? 409 : 400;
        return NextResponse.json({ error: e.message, code: e.code }, { status });
      }
      throw e;
    }
  } catch (error) {
    return apiErrorResponse(error);
  }
}
