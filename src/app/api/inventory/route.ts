import { NextResponse } from 'next/server';
import { z } from 'zod';
import { apiErrorResponse } from '@/lib/api-error';
import { db } from '@/lib/db';
import { requireCompanyTenant } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { requirePermission } from '@/lib/authorization';
import { drawDownStock, onHandTotal, receiveStock } from '@/lib/receiving';
import { zodMessage } from '@/lib/zod-message';

export async function GET() {
  try {
    const { user, companyId } = await requireCompanyTenant();
    await requirePermission('inventory.view');

    const products = await db.product.findMany({
      where: { companyId },
      include: {
        batches: {
          select: {
            id: true,
            batchNumber: true,
            quantityProduced: true,
            quantitySold: true,
            quantityRemaining: true,
            costPerUnit: true,
          },
        },
      },
    });

    const movements = await db.inventoryMovement.findMany({
      where: { companyId },
      include: {
        product: { select: { name: true, sku: true } },
        batch: { select: { batchNumber: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    const stockSummary = products.map((p) => {
      const produced = p.batches.reduce((sum, b) => sum + b.quantityProduced, 0);
      const sold = p.batches.reduce((sum, b) => sum + b.quantitySold, 0);
      const remaining = p.batches.reduce((sum, b) => sum + b.quantityRemaining, 0);
      return {
        id: p.id,
        name: p.name,
        sku: p.sku,
        status: p.status,
        sourceType: p.sourceType === 'PURCHASED' ? 'PURCHASED' : 'MANUFACTURED',
        produced,
        sold,
        remaining,
        batchesCount: p.batches.length,
      };
    });

    return NextResponse.json({ stockSummary, movements });
  } catch (error: any) {
    return apiErrorResponse(error);
  }
}


/**
 * POST /api/inventory — the two things a person may do to stock by hand.
 *
 * There used to be one endpoint that took a signed quantity and a movement
 * type of your choosing. It was a third door into stock beside production
 * and receiving, and the loosest of the three: it added units at a cost of
 * zero and labelled them whatever the caller said. Units at zero cost drag
 * the weighted average down, so every order costed afterwards reported a
 * profit that was never made.
 *
 * Two named actions replace it:
 *
 *   receive  — goods bought ready, at what they cost. Only for a product
 *              that is actually bought; a made one goes through a production
 *              run, where its costs are broken down.
 *
 *   recount  — the shelf disagrees with the system. You enter what you
 *              COUNTED, not a difference, and the correction is derived.
 *              Typing a delta means doing the subtraction in your head at
 *              the exact moment you are already unsure of the number.
 */
export async function POST(req: Request) {
  try {
    const { user, companyId } = await requireCompanyTenant();
    await requirePermission('inventory.adjust');

    const body = await req.json().catch(() => null);
    const parsed = z
      .discriminatedUnion('action', [
        z.object({
          action: z.literal('receive'),
          productId: z.string().min(10).max(64),
          quantity: z.coerce.number().int().min(1).max(1_000_000),
          unitCost: z.coerce.number().min(0).max(1_000_000).default(0),
          note: z.string().max(200).optional().nullable(),
        }),
        z.object({
          action: z.literal('recount'),
          productId: z.string().min(10).max(64),
          /** What was physically counted on the shelf. */
          countedQuantity: z.coerce.number().int().min(0).max(1_000_000),
          /** Why the shelf and the system disagree. Never optional. */
          reason: z.string().min(3).max(200),
        }),
      ])
      .safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: zodMessage(parsed.error) },
        { status: 400 }
      );
    }
    const input = parsed.data;

    const product = await db.product.findFirst({
      where: { id: input.productId, companyId },
      select: { id: true, name: true, sourceType: true },
    });
    if (!product) {
      return NextResponse.json({ error: 'المنتج غير موجود في شركتك' }, { status: 404 });
    }

    if (input.action === 'receive') {
      // A made product priced as a purchase loses its cost breakdown, and
      // the production reports then describe a run that never happened.
      if (product.sourceType === 'MANUFACTURED') {
        return NextResponse.json(
          {
            error: `«${product.name}» منتج مصنّع — تُضاف كميته من تشغيلات الإنتاج ببنود كلفتها.`,
            code: 'WRONG_DOOR',
          },
          { status: 409 }
        );
      }

      const result = await db.$transaction((tx) =>
        receiveStock(tx, {
          companyId,
          productId: product.id,
          quantity: input.quantity,
          unitCost: input.unitCost,
          note: input.note?.trim() || null,
          createdById: user.id,
        })
      );

      await logAudit({
        companyId,
        userId: user.id,
        action: 'STOCK_RECEIVED',
        entity: 'Product',
        entityId: product.id,
        newData: { quantity: input.quantity, unitCost: input.unitCost, batch: result.batch.batchNumber },
      });

      return NextResponse.json({
        success: true,
        balanceAfter: result.balanceAfter,
        batchNumber: result.batch.batchNumber,
      });
    }

    // ── recount ──
    const onHand = await onHandTotal(db, companyId, product.id);
    const difference = input.countedQuantity - onHand;

    if (difference === 0) {
      return NextResponse.json({
        success: true,
        difference: 0,
        balanceAfter: onHand,
        message: 'الجرد مطابق — لم يُسجَّل أي تعديل.',
      });
    }

    const movement = await db.$transaction(async (tx) => {
      if (difference > 0) {
        // Found more than the system knew. It enters at the cost of the
        // stock already there, not at zero: units at zero cost silently
        // lower the average and overstate the profit of everything sold
        // afterwards.
        const existing = await tx.productionBatch.findFirst({
          where: { companyId, productId: product.id, quantityRemaining: { gt: 0 } },
          orderBy: { productionDate: 'desc' },
          select: { costPerUnit: true },
        });
        await receiveStock(tx, {
          companyId,
          productId: product.id,
          quantity: difference,
          unitCost: existing?.costPerUnit ?? 0,
          batchNumber: `ADJ-${Date.now().toString(36).toUpperCase()}`,
          note: input.reason.trim(),
          createdById: user.id,
        });
      } else {
        await drawDownStock(tx, {
          companyId,
          productId: product.id,
          quantity: Math.abs(difference),
          allowNegative: false,
        });
      }

      return tx.inventoryMovement.create({
        data: {
          companyId,
          productId: product.id,
          type: 'MANUAL_ADJUSTMENT',
          quantity: difference,
          balanceAfter: await onHandTotal(tx, companyId, product.id),
          reason: `جرد: عُدّ ${input.countedQuantity} والنظام ${onHand} — ${input.reason.trim()}`,
          createdById: user.id,
        },
      });
    });

    await logAudit({
      companyId,
      userId: user.id,
      action: 'STOCK_RECOUNTED',
      entity: 'Product',
      entityId: product.id,
      previousData: { onHand },
      newData: { counted: input.countedQuantity, difference, reason: input.reason },
    });

    return NextResponse.json({
      success: true,
      difference,
      balanceAfter: movement.balanceAfter,
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
