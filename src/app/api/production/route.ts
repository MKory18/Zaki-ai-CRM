import { NextResponse } from 'next/server';
import { apiErrorResponse } from '@/lib/api-error';
import { db } from '@/lib/db';
import { requireCompanyTenant } from '@/lib/auth';
import { calculateBatchCosts } from '@/lib/financial';
import { logAudit } from '@/lib/audit';
import { requirePermission } from '@/lib/authorization';

export async function GET(req: Request) {
  try {
    const { companyId } = await requireCompanyTenant();

    const batches = await db.productionBatch.findMany({
      where: { companyId },
      include: {
        product: {
          select: { id: true, name: true, sku: true },
        },
      },
      orderBy: { productionDate: 'desc' },
    });

    return NextResponse.json({ batches });
  } catch (error: any) {
    return apiErrorResponse(error);
  }
}

export async function POST(req: Request) {
  try {
    const { user, companyId } = await requireCompanyTenant();
    await requirePermission('production.manage');

    const body = await req.json();
    const {
      productId,
      batchNumber,
      quantityProduced,
      manufacturingCost,
      packagingCost,
      rawMaterialCost,
      otherCosts,
      productionDate,
      notes,
    } = body;

    if (!productId || !batchNumber || !quantityProduced || quantityProduced <= 0) {
      return NextResponse.json(
        { error: 'Product, Batch Number, and Quantity Produced (> 0) are required' },
        { status: 400 }
      );
    }

    // Check duplicate batch number
    const existing = await db.productionBatch.findUnique({
      where: {
        companyId_batchNumber: {
          companyId,
          batchNumber: batchNumber.trim().toUpperCase(),
        },
      },
    });

    if (existing) {
      return NextResponse.json(
        { error: 'A production batch with this batch number already exists' },
        { status: 400 }
      );
    }

    const qty = parseInt(quantityProduced, 10);
    const mfg = parseFloat(manufacturingCost) || 0;
    const pack = parseFloat(packagingCost) || 0;
    const raw = parseFloat(rawMaterialCost) || 0;
    const other = parseFloat(otherCosts) || 0;

    const { totalProductionCost, costPerUnit } = calculateBatchCosts({
      quantityProduced: qty,
      manufacturingCost: mfg,
      packagingCost: pack,
      rawMaterialCost: raw,
      otherCosts: other,
    });

    // Phase S: tenant-validate the referenced product
    const prodCheck = await db.product.findFirst({ where: { id: productId, companyId } });
    if (!prodCheck) {
      return NextResponse.json({ error: "Product not found in your company" }, { status: 404 });
    }

    const batch = await db.productionBatch.create({
      data: {
        companyId,
        productId,
        batchNumber: batchNumber.trim().toUpperCase(),
        quantityProduced: qty,
        quantitySold: 0,
        quantityRemaining: qty,
        manufacturingCost: mfg,
        packagingCost: pack,
        rawMaterialCost: raw,
        otherCosts: other,
        totalProductionCost,
        costPerUnit,
        productionDate: productionDate ? new Date(productionDate) : new Date(),
        notes: notes?.trim() || null,
        status: 'COMPLETED',
      },
    });

    // Create corresponding Inventory Movement
    await db.inventoryMovement.create({
      data: {
        companyId,
        productId,
        batchId: batch.id,
        type: 'PRODUCTION',
        quantity: qty,
        balanceAfter: qty,
        referenceId: batch.id,
        reason: `Production Batch ${batch.batchNumber} completed`,
        createdById: user.id,
      },
    });

    await logAudit({
      companyId,
      userId: user.id,
      action: 'PRODUCTION_BATCH_CREATED',
      entity: 'ProductionBatch',
      entityId: batch.id,
      newData: batch,
    });

    return NextResponse.json({ success: true, batch });
  } catch (error: any) {
    return apiErrorResponse(error);
  }
}
