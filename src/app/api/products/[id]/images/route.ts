import { NextResponse } from 'next/server';
import { apiErrorResponse } from '@/lib/api-error';
import { db } from '@/lib/db';
import { inStore } from '@/lib/store-filter';
import { requireContext } from '@/lib/geo-context';
import { saveProductImage, validateImageFile } from '@/lib/storage';
import { logAudit } from '@/lib/audit';
import { authorize } from '@/lib/authorization';
import { rateLimit } from '@/lib/rate-limit';

// Batch limits: hard cap on number of files and total upload size per request
const MAX_FILES_PER_REQUEST = 8;
const MAX_TOTAL_BYTES = 25 * 1024 * 1024; // 25MB summed across all files
// Rate limit: 20 uploads per user per 5 minutes
const UPLOAD_RATE_LIMIT = 20;
const UPLOAD_RATE_WINDOW_MS = 5 * 60 * 1000;

/**
 * The product, if it is this store's.
 *
 * The store is a parameter: a helper that read it from somewhere ambient
 * would be the one place all the handlers pass through, and the one place
 * a wider scope would go unnoticed.
 */
async function getOwnedProduct(companyId: string, storeId: string | null, productId: string) {
  return db.product.findFirst({ where: { id: productId, ...inStore(companyId, storeId) } });
}

/**
 * POST /api/products/:id/images — upload one or more images (multipart/form-data)
 * fields: files (multiple), isPrimary ("true" for the first upload), altText
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: productId } = await params;
    const { user, companyId, storeId } = await requireContext();

    // Rate limit uploads per user (20 / 5 minutes)
    const rl = rateLimit(`uploads:${user.id}`, UPLOAD_RATE_LIMIT, UPLOAD_RATE_WINDOW_MS);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'عدد محاولات رفع الصور كبير جداً، يرجى المحاولة لاحقاً' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } }
      );
    }

    // Load the product first so image-upload authority is scope-evaluated
    const product = await getOwnedProduct(companyId, storeId, productId);
    if (!product) {
      return NextResponse.json({ error: 'المنتج غير موجود' }, { status: 404 });
    }
    const uploadAuth = authorize(user, 'products.upload_images', product);
    if (!uploadAuth.allowed) {
      if (uploadAuth.reason === 'NO_TENANT' || uploadAuth.reason === 'OUT_OF_SCOPE') {
        return NextResponse.json({ error: 'المنتج غير موجود' }, { status: 404 });
      }
      return NextResponse.json({ error: 'Forbidden: missing required permission products.upload_images' }, { status: 403 });
    }

    const formData = await req.formData();
    const files = formData.getAll('files') as File[];
    if (files.length === 0) {
      return NextResponse.json({ error: 'لم يتم اختيار أي صورة' }, { status: 400 });
    }

    // Batch limits enforced BEFORE reading any arrayBuffers into memory
    if (files.length > MAX_FILES_PER_REQUEST) {
      return NextResponse.json({ error: 'عدد أو حجم الصور يتجاوز الحد المسموح' }, { status: 400 });
    }
    const totalBytes = files.reduce((sum, f) => sum + (f.size || 0), 0);
    if (totalBytes > MAX_TOTAL_BYTES) {
      return NextResponse.json({ error: 'عدد أو حجم الصور يتجاوز الحد المسموح' }, { status: 400 });
    }

    const existingCount = await db.productImage.count({ where: { productId } });
    const makeFirstPrimary = formData.get('isPrimary') === 'true' || existingCount === 0;

    let primarySet = false;
    const created = [];

    for (const file of files) {
      const buffer = Buffer.from(await file.arrayBuffer());
      const validation = validateImageFile({ mimeType: file.type, size: file.size });
      if (!validation.valid) {
        return NextResponse.json({ error: validation.error }, { status: 400 });
      }

      const stored = await saveProductImage({
        companyId,
        productId,
        buffer,
        mimeType: file.type,
        originalName: file.name,
      });

      const isPrimary = makeFirstPrimary && !primarySet;
      if (isPrimary) primarySet = true;

      // Clear primary flag from others when setting a new primary
      if (isPrimary) {
        await db.productImage.updateMany({
          where: { productId, isPrimary: true },
          data: { isPrimary: false },
        });
      }

      const record: any = await db.productImage.create({
        data: {
          companyId,
          productId,
          url: stored.url,
          storageKey: stored.storageKey,
          fileName: stored.fileName,
          mimeType: stored.mimeType,
          fileSize: stored.fileSize,
          altText: (formData.get('altText') as string) || product.name,
          isPrimary,
          sortOrder: existingCount + created.length,
        },
      });
      created.push(record);
    }

    // Keep legacy product.image in sync (used as quick snapshot source)
    if (primarySet && created[0]) {
      await db.product.update({
        where: { id: productId },
        data: { image: created[0].url },
      });
    }

    await logAudit({
      companyId,
      userId: user.id,
      action: 'PRODUCT_IMAGES_UPLOADED',
      entity: 'ProductImage',
      entityId: productId,
      newData: { count: created.length },
    });

    return NextResponse.json({ success: true, images: created });
  } catch (error: any) {
    return apiErrorResponse(error);
  }
}

/**
 * PATCH /api/products/:id/images — actions:
 *  { action: 'setPrimary', imageId }
 *  { action: 'reorder', order: [imageId, imageId, ...] }
 *  { action: 'setAltText', imageId, altText }
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: productId } = await params;
    const { user, companyId, storeId } = await requireContext();

    // Load the product first so image-upload authority is scope-evaluated
    const product = await getOwnedProduct(companyId, storeId, productId);
    if (!product) {
      return NextResponse.json({ error: 'المنتج غير موجود' }, { status: 404 });
    }
    const uploadAuth = authorize(user, 'products.upload_images', product);
    if (!uploadAuth.allowed) {
      if (uploadAuth.reason === 'NO_TENANT' || uploadAuth.reason === 'OUT_OF_SCOPE') {
        return NextResponse.json({ error: 'المنتج غير موجود' }, { status: 404 });
      }
      return NextResponse.json({ error: 'Forbidden: missing required permission products.upload_images' }, { status: 403 });
    }

    const { action, imageId, order, altText } = await req.json();

    if (action === 'setPrimary') {
      const img = await db.productImage.findUnique({ where: { id: imageId } });
      if (!img || img.productId !== productId || img.companyId !== companyId) {
        return NextResponse.json({ error: 'الصورة غير موجودة' }, { status: 404 });
      }
      await db.productImage.updateMany({ where: { productId }, data: { isPrimary: false } });
      await db.productImage.update({ where: { id: imageId }, data: { isPrimary: true } });
      await db.product.update({ where: { id: productId }, data: { image: img.url } });
    } else if (action === 'reorder') {
      if (!Array.isArray(order)) {
        return NextResponse.json({ error: 'ترتيب غير صالح' }, { status: 400 });
      }
      for (let i = 0; i < order.length; i++) {
        await db.productImage.updateMany({
          where: { id: order[i], productId, companyId },
          data: { sortOrder: i },
        });
      }
    } else if (action === 'setAltText') {
      await db.productImage.updateMany({
        where: { id: imageId, productId, companyId },
        data: { altText: String(altText || '') },
      });
    } else {
      return NextResponse.json({ error: 'إجراء غير معروف' }, { status: 400 });
    }

    const images = await db.productImage.findMany({
      where: { productId },
      orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }],
    });

    await logAudit({
      companyId,
      userId: user.id,
      action: `PRODUCT_IMAGES_${String(action).toUpperCase()}`,
      entity: 'ProductImage',
      entityId: productId,
      newData: { imageId, order },
    });

    return NextResponse.json({ success: true, images });
  } catch (error: any) {
    return apiErrorResponse(error);
  }
}
