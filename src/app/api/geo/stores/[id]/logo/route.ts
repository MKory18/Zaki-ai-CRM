import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireCompanyTenant } from '@/lib/auth';
import { requirePermission } from '@/lib/authorization';
import { apiErrorResponse } from '@/lib/api-error';
import { logAudit } from '@/lib/audit';
import { saveProductImage, validateImageFile } from '@/lib/storage';
import { storeLogoUrl } from '@/lib/store-logo';

/**
 * A STORE'S LOGO — uploaded here, served from here.
 *
 * Store.logo was a free text URL with no screen that set it, so nothing had
 * a logo and the waybill could not show one. It is set by upload now,
 * through the same storage pipeline the products and landing pages use
 * (MIME allowlist, content sniffing, re-encoding), into the store's own
 * folder.
 *
 * The URL written is the PUBLIC one, /api/public/store-logo/<store>/<file>,
 * not /api/media: that one needs a signed-in session, and the logo is shown
 * to shoppers on the storefront who have none. A logo is public by nature.
 *
 * POST   multipart { file }  → sets the logo
 * DELETE                     → removes it
 */

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function POST(req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const { user, companyId } = await requireCompanyTenant();
    await requirePermission('geo.manage');

    const store = await db.store.findFirst({ where: { id, companyId }, select: { id: true, logo: true } });
    if (!store) return NextResponse.json({ error: 'المتجر غير موجود' }, { status: 404 });

    if (!(req.headers.get('content-type') ?? '').includes('multipart/form-data')) {
      return NextResponse.json({ error: 'يجب رفع الملف باستخدام multipart/form-data' }, { status: 400 });
    }
    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) return NextResponse.json({ error: 'اختر صورة الشعار' }, { status: 400 });

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
    });

    const logo = storeLogoUrl(store.id, stored.fileName);
    await db.store.update({ where: { id: store.id }, data: { logo } });

    await logAudit({
      companyId,
      userId: user.id,
      action: 'STORE_LOGO_UPLOADED',
      entity: 'Store',
      entityId: store.id,
      previousData: { logo: store.logo },
      newData: { logo },
    });

    return NextResponse.json({ logo });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const { user, companyId } = await requireCompanyTenant();
    await requirePermission('geo.manage');

    const store = await db.store.findFirst({ where: { id, companyId }, select: { id: true, logo: true } });
    if (!store) return NextResponse.json({ error: 'المتجر غير موجود' }, { status: 404 });

    await db.store.update({ where: { id: store.id }, data: { logo: null } });
    await logAudit({
      companyId,
      userId: user.id,
      action: 'STORE_LOGO_REMOVED',
      entity: 'Store',
      entityId: store.id,
      previousData: { logo: store.logo },
    });
    return NextResponse.json({ logo: null });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
