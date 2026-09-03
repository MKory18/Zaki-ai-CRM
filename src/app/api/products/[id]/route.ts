import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireCompanyTenant, requirePermission } from '@/lib/auth';
import { deleteStoredFile } from '@/lib/storage';
import { logAudit } from '@/lib/audit';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { companyId } = await requireCompanyTenant();
    const product = await db.product.findUnique({
      where: { id },
      include: { images: { orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }] } },
    });
    if (!product || product.companyId !== companyId) {
      return NextResponse.json({ error: 'المنتج غير موجود' }, { status: 404 });
    }
    return NextResponse.json({ product });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}

/** PATCH — edit product info (name, nameEn, description, basePrice, status, SKU) */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { user, companyId } = await requireCompanyTenant();
    await requirePermission('products.manage');

    const body = await req.json();
    const { name, nameEn, sku, description, descriptionEn, basePrice, status } = body;

    const existing = await db.product.findUnique({ where: { id } });
    if (!existing || existing.companyId !== companyId) {
      return NextResponse.json({ error: 'المنتج غير موجود' }, { status: 404 });
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
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}

/** DELETE — remove product and clean up all image files from storage */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { user, companyId } = await requireCompanyTenant();
    await requirePermission('products.manage');

    const product = await db.product.findUnique({
      where: { id },
      include: { orders: { take: 1 }, images: true },
    });
    if (!product || product.companyId !== companyId) {
      return NextResponse.json({ error: 'المنتج غير موجود' }, { status: 404 });
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
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
