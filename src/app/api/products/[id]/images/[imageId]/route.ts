import { NextResponse } from 'next/server';
import { apiErrorResponse } from '@/lib/api-error';
import { db } from '@/lib/db';
import { inStore } from '@/lib/store-filter';
import { requireContext } from '@/lib/geo-context';
import { deleteStoredFile } from '@/lib/storage';
import { logAudit } from '@/lib/audit';
import { authorize } from '@/lib/authorization';

/**
 * DELETE /api/products/:id/images/:imageId
 * 1. Verifies permission + tenant ownership
 * 2. Deletes the file from storage
 * 3. Deletes the DB record
 * 4. Promotes another image to primary if the deleted one was primary
 */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string; imageId: string }> }
) {
  try {
    const { id: productId, imageId } = await params;
    const { user, companyId, storeId } = await requireContext();

    const img = await db.productImage.findUnique({ where: { id: imageId } });
    if (!img || img.productId !== productId || img.companyId !== companyId) {
      return NextResponse.json({ error: 'الصورة غير موجودة' }, { status: 404 });
    }

    // Load the product first so image-upload authority is scope-evaluated
    const product = await db.product.findFirst({ where: { id: productId, ...inStore(companyId, storeId) } });
    if (!product || product.companyId !== companyId) {
      return NextResponse.json({ error: 'المنتج غير موجود' }, { status: 404 });
    }
    const uploadAuth = authorize(user, 'products.upload_images', product);
    if (!uploadAuth.allowed) {
      if (uploadAuth.reason === 'NO_TENANT' || uploadAuth.reason === 'OUT_OF_SCOPE') {
        return NextResponse.json({ error: 'المنتج غير موجود' }, { status: 404 });
      }
      return NextResponse.json({ error: 'Forbidden: missing required permission products.upload_images' }, { status: 403 });
    }

    const wasPrimary = img.isPrimary;

    // 1. Storage cleanup
    await deleteStoredFile(img.storageKey);

    // 2. DB record removal
    await db.productImage.delete({ where: { id: imageId } });

    // 3. Promote next image if the deleted one was primary
    if (wasPrimary) {
      const next = await db.productImage.findFirst({
        where: { productId },
        orderBy: { sortOrder: 'asc' },
      });
      if (next) {
        await db.productImage.update({ where: { id: next.id }, data: { isPrimary: true } });
        await db.product.update({ where: { id: productId }, data: { image: next.url } });
      } else {
        await db.product.update({ where: { id: productId }, data: { image: null } });
      }
    }

    await logAudit({
      companyId,
      userId: user.id,
      action: 'PRODUCT_IMAGE_DELETED',
      entity: 'ProductImage',
      entityId: imageId,
      previousData: { storageKey: img.storageKey, wasPrimary },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return apiErrorResponse(error);
  }
}
