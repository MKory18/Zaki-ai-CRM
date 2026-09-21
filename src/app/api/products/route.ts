import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { apiErrorResponse } from '@/lib/api-error';
import { db } from '@/lib/db';
import { requireCompanyTenant } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { requirePermission, getPermissionScope } from '@/lib/authorization';

export async function GET(req: Request) {
  try {
    const { user, companyId } = await requireCompanyTenant();

    // Canonical gate — products.view, resolved to its effective scope so the
    // list query can filter at the SQL level (no JS filtering).
    const scope = getPermissionScope(user, 'products.view');
    if (!scope) {
      return NextResponse.json({ error: 'Forbidden: missing required permission products.view' }, { status: 403 });
    }

    const where: Prisma.ProductWhereInput = { companyId };
    // Scope → SQL filters. CATEGORY/SPECIFIC read scopeIds that were
    // tenant-validated when the grant was written. ALL_COMPANY / OWN → no
    // extra filter (OWN is unsupported for products — documented in
    // authorization.ts — and treated as company-wide).
    if (scope.scope === 'CATEGORY') {
      where.categoryId = { in: Array.isArray(scope.scopeIds) ? (scope.scopeIds as string[]) : [] };
    } else if (scope.scope === 'SPECIFIC') {
      where.id = { in: Array.isArray(scope.scopeIds) ? (scope.scopeIds as string[]) : [] };
    }

    // Optional search (q) + limit for scope pickers / search UIs.
    // When absent the behavior is unchanged from before.
    const url = new URL(req.url);
    const q = url.searchParams.get('q')?.trim();
    if (q) {
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { nameEn: { contains: q, mode: 'insensitive' } },
        { sku: { contains: q, mode: 'insensitive' } },
      ];
    }
    const limitRaw = url.searchParams.get('limit');
    const take = limitRaw ? Math.min(Math.max(Number.parseInt(limitRaw, 10) || 0, 1), 100) : undefined;

    const products = await db.product.findMany({
      where,
      take,
      include: {
        images: {
          orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }],
        },
        batches: {
          select: {
            id: true,
            batchNumber: true,
            quantityProduced: true,
            quantitySold: true,
            quantityRemaining: true,
            totalProductionCost: true,
            costPerUnit: true,
            manufacturingCost: true,
            packagingCost: true,
            rawMaterialCost: true,
            otherCosts: true,
            productionDate: true,
          },
        },
        offers: {
          select: {
            id: true,
            name: true,
            quantity: true,
            sellingPrice: true,
            status: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Compute comprehensive cost analysis for each product
    const enriched = products.map((prod) => {
      const totalProduced = prod.batches.reduce((sum, b) => sum + b.quantityProduced, 0);
      const totalSold = prod.batches.reduce((sum, b) => sum + b.quantitySold, 0);
      const totalRemaining = prod.batches.reduce((sum, b) => sum + b.quantityRemaining, 0);

      const totalMfgCost = prod.batches.reduce((sum, b) => sum + b.manufacturingCost, 0);
      const totalPackCost = prod.batches.reduce((sum, b) => sum + b.packagingCost, 0);
      const totalRawCost = prod.batches.reduce((sum, b) => sum + b.rawMaterialCost, 0);
      const totalOtherCost = prod.batches.reduce((sum, b) => sum + b.otherCosts, 0);
      const totalProdCost = prod.batches.reduce((sum, b) => sum + b.totalProductionCost, 0);

      const avgCostPerUnit =
        totalProduced > 0 ? Number((totalProdCost / totalProduced).toFixed(2)) : 0;

      return {
        ...prod,
        analytics: {
          totalProduced,
          totalSold,
          totalRemaining,
          totalMfgCost,
          totalPackCost,
          totalRawCost,
          totalOtherCost,
          totalProdCost,
          avgCostPerUnit,
        },
      };
    });

    return NextResponse.json({ products: enriched });
  } catch (error: any) {
    return apiErrorResponse(error);
  }
}

export async function POST(req: Request) {
  try {
    const { user, companyId } = await requireCompanyTenant();
    await requirePermission('products.create');

    const body = await req.json();
    const { name, nameEn, sku, description, descriptionEn, basePrice, status, sourceType } = body;

    if (!name || !sku) {
      return NextResponse.json({ error: 'Name and SKU are required' }, { status: 400 });
    }

    // Check SKU uniqueness within company
    const existing = await db.product.findUnique({
      where: {
        companyId_sku: {
          companyId,
          sku: sku.trim().toUpperCase(),
        },
      },
    });

    if (existing) {
      return NextResponse.json({ error: 'A product with this SKU already exists' }, { status: 400 });
    }

    const product = await db.product.create({
      data: {
        companyId,
        name: name.trim(),
      nameEn: nameEn?.trim() || null,
      descriptionEn: descriptionEn?.trim() || null,
        sku: sku.trim().toUpperCase(),
        description: description?.trim(),
        basePrice: parseFloat(basePrice) || 0,
        // Which door this product's stock comes in through. Both write the
        // same ledger; this only decides which form you are shown, and a
        // ready-made good entered as a "production run" corrupts the
        // production cost reports.
        sourceType: sourceType === 'PURCHASED' ? 'PURCHASED' : 'MANUFACTURED',
        status: status || 'ACTIVE',
      },
    });

    await logAudit({
      companyId,
      userId: user.id,
      action: 'PRODUCT_CREATED',
      entity: 'Product',
      entityId: product.id,
      newData: product,
    });

    return NextResponse.json({ success: true, product });
  } catch (error: any) {
    return apiErrorResponse(error);
  }
}
