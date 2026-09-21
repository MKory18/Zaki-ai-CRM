import { NextResponse } from 'next/server';
import { apiErrorResponse } from '@/lib/api-error';
import { db } from '@/lib/db';
import { requireCompanyTenant } from '@/lib/auth';
import { batchTotal, batchUnitCost } from '@/lib/product-cost';
import { logAudit } from '@/lib/audit';
import { requirePermission } from '@/lib/authorization';

export async function GET(req: Request) {
  try {
    const { user, companyId } = await requireCompanyTenant();
    await requirePermission('production.view');

    const batches = await db.productionBatch.findMany({
      where: { companyId },
      include: {
        product: {
          select: { id: true, name: true, sku: true },
        },
        // The named costs of this run, beside the four fixed buckets.
        costLines: { orderBy: { sortOrder: 'asc' }, select: { label: true, amount: true } },
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

    // Free-form cost lines — "قالب", "أجرة عامل", "شحن المواد". Four fixed
    // buckets never matched a real run; they matched whatever fitted into
    // four words. The buckets stay for the batches that use them, and the
    // total is the buckets plus the lines.
    const costLines: { label: string; amount: number }[] = Array.isArray(body.costLines)
      ? body.costLines
          .map((l: { label?: unknown; amount?: unknown }) => ({
            label: String(l?.label ?? '').trim().slice(0, 80),
            amount: Math.max(0, Number(l?.amount) || 0),
          }))
          .filter((l: { label: string; amount: number }) => l.label.length > 0)
          .slice(0, 30)
      : [];

    const { total: totalProductionCost } = batchTotal({
      manufacturingCost: mfg,
      packagingCost: pack,
      rawMaterialCost: raw,
      otherCosts: other,
      costLines,
    });
    const costPerUnit = batchUnitCost(totalProductionCost, qty);

    // Phase S: tenant-validate the referenced product
    const prodCheck = await db.product.findFirst({ where: { id: productId, companyId } });
    if (!prodCheck) {
      return NextResponse.json({ error: 'المنتج غير موجود في شركتك' }, { status: 404 });
    }

    // A bought product entered as a production run puts invented
    // manufacturing costs into the production reports — a run that never
    // happened, with a cost breakdown nobody can trace to any work.
    if (prodCheck.sourceType === 'PURCHASED') {
      return NextResponse.json(
        {
          error: `«${prodCheck.name}» منتج جاهز — تُضاف كميته من «استلام بضاعة جاهزة» بسعر الشراء.`,
          code: 'WRONG_DOOR',
        },
        { status: 409 }
      );
    }

    const batch = await db.productionBatch.create({
      data: {
        costLines: costLines.length
          ? { create: costLines.map((l, i) => ({ companyId, label: l.label, amount: l.amount, sortOrder: i })) }
          : undefined,
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
