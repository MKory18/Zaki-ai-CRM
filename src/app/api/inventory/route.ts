import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireCompanyTenant, requirePermission } from '@/lib/auth';
import { logAudit } from '@/lib/audit';

export async function GET() {
  try {
    const { companyId } = await requireCompanyTenant();

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
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}

export async function POST(req: Request) {
  try {
    const { user, companyId } = await requireCompanyTenant();
    await requirePermission('inventory.manage');

    const body = await req.json();
    const { productId, batchId, quantity, type, reason } = body;

    if (!productId || quantity === undefined || !type) {
      return NextResponse.json(
        { error: 'Product, Quantity, and Movement Type are required' },
        { status: 400 }
      );
    }

    const qty = parseInt(quantity, 10);

    // If batchId specified, adjust batch remaining
    if (batchId) {
      const batch = await db.productionBatch.findUnique({
        where: { id: batchId },
      });
      if (batch) {
        const newRemaining = Math.max(0, batch.quantityRemaining + qty);
        await db.productionBatch.update({
          where: { id: batchId },
          data: { quantityRemaining: newRemaining },
        });
      }
    }

    // Get current total remaining across batches
    const allBatches = await db.productionBatch.findMany({
      where: { productId },
    });
    const currentTotal = allBatches.reduce((s, b) => s + b.quantityRemaining, 0);

    const movement = await db.inventoryMovement.create({
      data: {
        companyId,
        productId,
        batchId: batchId || null,
        type, // PRODUCTION, SALE, RETURN, MANUAL_ADJUSTMENT
        quantity: qty,
        balanceAfter: currentTotal,
        reason: reason?.trim() || 'Manual adjustment',
        createdById: user.id,
      },
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
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
