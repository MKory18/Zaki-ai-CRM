import { NextResponse } from 'next/server';
import { apiErrorResponse } from '@/lib/api-error';
import { db } from '@/lib/db';
import { requireCompanyTenant } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { requirePermission } from '@/lib/authorization';
import { drawDownStock, onHandTotal, receiveStock } from '@/lib/receiving';

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

export async function POST(req: Request) {
  try {
    const { user, companyId } = await requireCompanyTenant();
    await requirePermission('inventory.adjust');

    const body = await req.json();
    const { productId, batchId, quantity, type, reason } = body;

    if (!productId || quantity === undefined || !type) {
      return NextResponse.json(
        { error: 'Product, Quantity, and Movement Type are required' },
        { status: 400 }
      );
    }

    const qty = parseInt(quantity, 10);

    // ── Phase S: tenant-validate the referenced product ──
    const product = await db.product.findFirst({ where: { id: productId, companyId } });
    if (!product) {
      return NextResponse.json({ error: 'Product not found in your company' }, { status: 404 });
    }

    // Units live in batches: on-hand is the sum of their remainders. A
    // movement that touches no batch changes nothing, which is why stock
    // entered for a product with no batch used to vanish — the ledger said it
    // arrived and the shipment screen still called it a shortage.
    const movement = await db.$transaction(async (tx) => {
      if (qty > 0 && !batchId) {
        // Receiving into a product that has no batch yet: open one.
        const received = await receiveStock(tx, {
          companyId,
          productId,
          quantity: qty,
          unitCost: typeof body.unitCost === 'number' ? body.unitCost : undefined,
          note: reason?.trim() || null,
          createdById: user.id,
        });
        return received.movement;
      }

      if (batchId) {
        const batch = await tx.productionBatch.findFirst({ where: { id: batchId, companyId, productId } });
        if (!batch) throw new Error('BATCH_NOT_FOUND');
        await tx.productionBatch.update({
          where: { id: batch.id },
          data: { quantityRemaining: Math.max(0, batch.quantityRemaining + qty) },
        });
      } else {
        // Taking stock out with no batch named: oldest first.
        await drawDownStock(tx, { companyId, productId, quantity: Math.abs(qty), allowNegative: false });
      }

      return tx.inventoryMovement.create({
        data: {
          companyId,
          productId,
          batchId: batchId || null,
          type, // PRODUCTION, SALE, RETURN, MANUAL_ADJUSTMENT
          quantity: qty,
          balanceAfter: await onHandTotal(tx, companyId, productId),
          reason: reason?.trim() || 'Manual adjustment',
          createdById: user.id,
        },
      });
    });

    await logAudit({
      companyId,
      userId: user.id,
      action: 'INVENTORY_ADJUSTED',
      entity: 'InventoryMovement',
      entityId: movement.id,
      newData: movement,
    });

    return NextResponse.json({ success: true, movement });
  } catch (error: any) {
    if (error?.message === 'BATCH_NOT_FOUND') {
      return NextResponse.json({ error: 'Batch not found in your company' }, { status: 404 });
    }
    if (typeof error?.message === 'string' && error.message.includes('غير كافٍ')) {
      return NextResponse.json({ error: error.message, code: 'INSUFFICIENT_STOCK' }, { status: 409 });
    }
    return apiErrorResponse(error);
  }
}
