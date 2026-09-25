import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireContext } from '@/lib/geo-context';
import { requirePermission } from '@/lib/authorization';
import { apiErrorResponse } from '@/lib/api-error';
import { logAudit } from '@/lib/audit';
import { rateLimit } from '@/lib/rate-limit';
import { saveProductImage, validateImageFile } from '@/lib/storage';

/**
 * POST /api/store/design/image — images for the home page's blocks.
 *
 * The SAME storage pipeline as every other upload (saveProductImage): MIME
 * allowlist, magic-byte sniffing, sharp optimisation, tenant-namespaced keys.
 * Only the namespace differs — the store's id rather than a landing page's —
 * so the public media route can tell whose image it is serving.
 *
 * Client MIME is not trusted: it is validated here and verified by sniffing
 * inside storage.
 */

const MAX_FILES_PER_REQUEST = 5;
const UPLOAD_RATE_LIMIT = 30;
const UPLOAD_RATE_WINDOW_MS = 5 * 60_000;

export async function POST(req: Request) {
  try {
    const { user, companyId, storeId } = await requireContext();
    await requirePermission('storefront.manage');

    const rl = rateLimit(`store_image_upload:${user.id}`, UPLOAD_RATE_LIMIT, UPLOAD_RATE_WINDOW_MS);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: `محاولات رفع كثيرة. أعد المحاولة بعد ${rl.retryAfterSec} ثانية` },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } }
      );
    }

    const store = await db.store.findFirst({ where: { id: storeId!, companyId }, select: { id: true } });
    if (!store) return NextResponse.json({ error: 'المتجر غير موجود' }, { status: 404 });

    const contentType = req.headers.get('content-type') || '';
    if (!contentType.includes('multipart/form-data')) {
      return NextResponse.json({ error: 'يجب رفع الملف باستخدام multipart/form-data' }, { status: 400 });
    }

    const formData = await req.formData();
    const files = formData.getAll('files').filter((f): f is File => f instanceof File);
    if (files.length === 0) return NextResponse.json({ error: 'صورة واحدة على الأقل مطلوبة' }, { status: 400 });
    if (files.length > MAX_FILES_PER_REQUEST) {
      return NextResponse.json({ error: `الحد الأقصى ${MAX_FILES_PER_REQUEST} صور لكل طلب` }, { status: 400 });
    }

    const urls: string[] = [];
    for (const file of files) {
      const buffer = Buffer.from(await file.arrayBuffer());
      const check = validateImageFile({ mimeType: file.type || 'application/octet-stream', size: buffer.length });
      if (!check.valid) return NextResponse.json({ error: `${file.name}: ${check.error}` }, { status: 400 });
      const stored = await saveProductImage({
        companyId,
        productId: store.id, // the store's own namespace
        buffer,
        mimeType: file.type || 'image/jpeg',
        originalName: file.name,
      });
      urls.push(stored.url);
    }

    await logAudit({
      companyId, userId: user.id, action: 'STORE_HOME_IMAGE_UPLOADED',
      entity: 'Store', entityId: store.id, newData: { count: urls.length },
    });

    return NextResponse.json({ success: true, urls });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '';
    if (message && !/^\w+:/i.test(message) && message.length < 200) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    return apiErrorResponse(error);
  }
}
