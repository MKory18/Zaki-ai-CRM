import { NextResponse } from 'next/server';
import { apiErrorResponse } from '@/lib/api-error';
import { db } from '@/lib/db';
import { inStore } from '@/lib/store-filter';
import { deleteStoredFile } from '@/lib/storage';
import { logAudit } from '@/lib/audit';
import { can, authorize } from '@/lib/authorization';
import { requireContext } from '@/lib/geo-context';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { user, companyId, storeId } = await requireContext();
    const product = await db.product.findUnique({
      where: { id },
      include: { images: { orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }] } },
    });
    // Scope-evaluated view authorization — out-of-scope products report 404
    const viewAuth = product ? authorize(user, 'products.view', product) : { allowed: false, reason: 'NO_PERMISSION' as const };
    if (!product || viewAuth.reason === 'NO_TENANT' || viewAuth.reason === 'OUT_OF_SCOPE') {
      return NextResponse.json({ error: 'المنتج غير موجود' }, { status: 404 });
    }
    if (!viewAuth.allowed) {
      return NextResponse.json({ error: 'Forbidden: missing required permission products.view' }, { status: 403 });
    }
    // The currency of the COUNTRY this store sells into — not the company's.
    // A Syrian store was labelling its prices in Jordanian dinars because the
    // company that owns it is Jordanian, and the landing page selling the
    // same product said something else.
    let currencyCode = 'USD';
    try {
      const { country } = await requireContext();
      currencyCode = country.currencyCode;
    } catch {
      const company = await db.company.findUnique({
        where: { id: companyId },
        select: { currency: true },
      });
      currencyCode = company?.currency || 'USD';
    }

    return NextResponse.json({ product, currencyCode });
  } catch (error: any) {
    return apiErrorResponse(error);
  }
}

/** PATCH — edit product info (name, nameEn, description, basePrice, status, SKU) */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { user, companyId, storeId } = await requireContext();

    const body = await req.json();
    const { name, nameEn, sku, description, descriptionEn, basePrice, status, sourceType } = body;

    const existing = await db.product.findFirst({ where: { id, ...inStore(companyId, storeId) } });
    if (!existing || existing.companyId !== companyId) {
      return NextResponse.json({ error: 'المنتج غير موجود' }, { status: 404 });
    }

    // Scope-evaluated edit authorization (out-of-scope → 404)
    const editAuth = authorize(user, 'products.edit', existing);
    if (!editAuth.allowed) {
      if (editAuth.reason === 'NO_TENANT' || editAuth.reason === 'OUT_OF_SCOPE') {
        return NextResponse.json({ error: 'المنتج غير موجود' }, { status: 404 });
      }
      return NextResponse.json({ error: 'Forbidden: missing required permission products.edit' }, { status: 403 });
    }

    // Price changes are a separate authority (products.change_price)
    if (basePrice !== undefined && Number(basePrice) !== existing.basePrice) {
      const priceAuth = authorize(user, 'products.change_price', existing);
      if (!priceAuth.allowed) {
        return NextResponse.json({ error: 'Forbidden: products.change_price' }, { status: 403 });
      }
    }

    // SKU uniqueness within company (excluding self)
    if (sku && sku.trim().toUpperCase() !== existing.sku) {
      const dup = await db.product.findFirst({
        where: { companyId, sku: sku.trim().toUpperCase(), id: { not: id } },
      });
      if (dup) {
        return NextResponse.json({ error: 'يوجد منتج آخر بنفس رمز SKU' }, { status: 400 });
      }
    }

    const updated = await db.product.update({
      where: { id },
      data: {
        ...(name ? { name: name.trim() } : {}),
        ...(nameEn !== undefined ? { nameEn: nameEn?.trim() || null } : {}),
        ...(sku ? { sku: sku.trim().toUpperCase() } : {}),
        ...(description !== undefined ? { description: description?.trim() || null } : {}),
        ...(sourceType === 'PURCHASED' || sourceType === 'MANUFACTURED' ? { sourceType } : {}),
        ...(descriptionEn !== undefined ? { descriptionEn: descriptionEn?.trim() || null } : {}),
        ...(basePrice !== undefined ? { basePrice: parseFloat(basePrice) || 0 } : {}),
        ...(status ? { status } : {}),
      },
    });

    await logAudit({
      companyId,
      userId: user.id,
      action: 'PRODUCT_UPDATED',
      entity: 'Product',
      entityId: id,
      previousData: { name: existing.name, sku: existing.sku, status: existing.status, basePrice: existing.basePrice },
      newData: { name: updated.name, sku: updated.sku, status: updated.status, basePrice: updated.basePrice },
    });

    return NextResponse.json({ success: true, product: updated });
  } catch (error: any) {
    return apiErrorResponse(error);
  }
}

/** DELETE — remove product and clean up all image files from storage */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { user, companyId, storeId } = await requireContext();

    const product = await db.product.findUnique({
      where: { id },
      include: { orders: { take: 1 }, images: true },
    });
    if (!product || product.companyId !== companyId) {
      return NextResponse.json({ error: 'المنتج غير موجود' }, { status: 404 });
    }

    // Scope-evaluated delete authorization (out-of-scope → 404)
    const deleteAuth = authorize(user, 'products.delete', product);
    if (!deleteAuth.allowed) {
      if (deleteAuth.reason === 'NO_TENANT' || deleteAuth.reason === 'OUT_OF_SCOPE') {
        return NextResponse.json({ error: 'المنتج غير موجود' }, { status: 404 });
      }
      return NextResponse.json({ error: 'Forbidden: missing required permission products.delete' }, { status: 403 });
    }

    // Safety: block deletion when orders reference the product
    if (product.orders.length > 0) {
      return NextResponse.json(
        { error: 'لا يمكن حذف منتج مرتبط بطلبات — غيّر حالته إلى "غير نشط" بدلاً من الحذف' },
        { status: 400 }
      );
    }

    // Storage cleanup for every image
    for (const img of product.images) {
      await deleteStoredFile(img.storageKey);
    }

    await db.product.delete({ where: { id } });

    await logAudit({
      companyId,
      userId: user.id,
      action: 'PRODUCT_DELETED',
      entity: 'Product',
      entityId: id,
      previousData: { name: product.name, sku: product.sku, imagesRemoved: product.images.length },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return apiErrorResponse(error);
  }
}
