import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireCompanyTenant } from '@/lib/auth';
import { requirePermission } from '@/lib/authorization';
import { apiErrorResponse } from '@/lib/api-error';
import { logAudit } from '@/lib/audit';
import { saveProductImage, validateImageFile } from '@/lib/storage';
import { storeLogoUrl } from '@/lib/store-logo';

/**
 * A STORE'S BRAND IMAGES — its logo and its favicon, uploaded here.
 *
 * Both are the store's identity, set in the store's settings and read
 * everywhere it appears: the storefront header, the landing pages' footer,
 * the waybill, the store picker — and the browser tab of its pages. They go
 * through the same storage pipeline as every image (MIME allowlist, content
 * sniffing, re-encoding) into the store's own folder, and are written as
 * the PUBLIC link (/api/public/store-logo/<store>/<file>): shoppers see
 * them without signing in.
 *
 * POST   multipart { file }  → sets it
 * DELETE                     → removes it
 */

export type BrandImage = 'logo' | 'favicon';

const COPY: Record<BrandImage, { pick: string; failed: string; size: number; uploaded: string; removed: string }> = {
  logo: { pick: 'اختر صورة الشعار', failed: 'تعذر رفع الشعار', size: 1200, uploaded: 'STORE_LOGO_UPLOADED', removed: 'STORE_LOGO_REMOVED' },
  // A tab icon is drawn at 16 to 64 pixels: 256 covers every screen density.
  favicon: { pick: 'اختر صورة الأيقونة', failed: 'تعذر رفع الأيقونة', size: 256, uploaded: 'STORE_FAVICON_UPLOADED', removed: 'STORE_FAVICON_REMOVED' },
};

interface Ctx {
  params: Promise<{ id: string }>;
}

async function ownStore(id: string, companyId: string) {
  return db.store.findFirst({ where: { id, companyId }, select: { id: true, logo: true, favicon: true } });
}

export function brandImageRoute(kind: BrandImage) {
  const copy = COPY[kind];

  async function POST(req: Request, { params }: Ctx) {
    try {
      const { id } = await params;
      const { user, companyId } = await requireCompanyTenant();
      await requirePermission('geo.manage');

      const store = await ownStore(id, companyId);
      if (!store) return NextResponse.json({ error: 'المتجر غير موجود' }, { status: 404 });

      if (!(req.headers.get('content-type') ?? '').includes('multipart/form-data')) {
        return NextResponse.json({ error: 'يجب رفع الملف باستخدام multipart/form-data' }, { status: 400 });
      }
      const form = await req.formData();
      const file = form.get('file');
      if (!(file instanceof File)) return NextResponse.json({ error: copy.pick }, { status: 400 });

      const buffer = Buffer.from(await file.arrayBuffer());
      // The browser's MIME type is not trusted: validated here, then sniffed
      // from the bytes inside saveProductImage.
      const check = validateImageFile({ mimeType: file.type || 'application/octet-stream', size: buffer.length });
      if (!check.valid) return NextResponse.json({ error: check.error }, { status: 400 });

      const stored = await saveProductImage({
        companyId,
        productId: store.id, // the store's own folder (products/{storeId} layout)
        buffer,
        mimeType: file.type || 'image/png',
        originalName: file.name,
        maxDimension: copy.size,
      });

      const url = storeLogoUrl(store.id, stored.fileName);
      await db.store.update({ where: { id: store.id }, data: { [kind]: url } });
      await logAudit({
        companyId,
        userId: user.id,
        action: copy.uploaded,
        entity: 'Store',
        entityId: store.id,
        previousData: { [kind]: store[kind] },
        newData: { [kind]: url },
      });
      return NextResponse.json({ [kind]: url });
    } catch (error) {
      return apiErrorResponse(error);
    }
  }

  async function DELETE(_req: Request, { params }: Ctx) {
    try {
      const { id } = await params;
      const { user, companyId } = await requireCompanyTenant();
      await requirePermission('geo.manage');

      const store = await ownStore(id, companyId);
      if (!store) return NextResponse.json({ error: 'المتجر غير موجود' }, { status: 404 });

      await db.store.update({ where: { id: store.id }, data: { [kind]: null } });
      await logAudit({
        companyId,
        userId: user.id,
        action: copy.removed,
        entity: 'Store',
        entityId: store.id,
        previousData: { [kind]: store[kind] },
      });
      return NextResponse.json({ [kind]: null });
    } catch (error) {
      return apiErrorResponse(error);
    }
  }

  return { POST, DELETE };
}
