import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireContext } from '@/lib/geo-context';
import { requirePermission } from '@/lib/authorization';
import { apiErrorResponse } from '@/lib/api-error';
import { logAudit } from '@/lib/audit';
import { rateLimit } from '@/lib/rate-limit';
import { saveProductImage, validateImageFile } from '@/lib/storage';

interface Ctx {
  params: Promise<{ id: string }>;
}

const MAX_FILES_PER_REQUEST = 5;
const UPLOAD_RATE_LIMIT = 30;
const UPLOAD_RATE_WINDOW_MS = 5 * 60_000;

/**
 * POST /api/landing-pages/[id]/image — upload image(s) for the custom editor.
 * Reuses the EXISTING storage pipeline (saveProductImage): MIME allowlist,
 * magic-byte sniffing, sharp optimization, tenant-namespaced storage and
 * traversal-safe keys. Images are stored under the landing page's namespace
 * (products/{lpId} layout keeps /api/media compatibility for the dashboard).
 * Public serving happens through the slug-scoped public media route, which
 * only serves images for PUBLISHED pages (or valid preview tokens).
 */
export async function POST(req: Request, ctx: Ctx) {
  try {
    const { user, companyId, storeId } = await requireContext();
    await requirePermission('landing_pages.edit');
    const { id } = await ctx.params;

    const rl = rateLimit(`lp_image_upload:${user.id}`, UPLOAD_RATE_LIMIT, UPLOAD_RATE_WINDOW_MS);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: `محاولات رفع كثيرة. أعد المحاولة بعد ${rl.retryAfterSec} ثانية` },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } }
      );
    }

    const lp = await db.landingPage.findFirst({ where: { id, companyId, storeId } });
    if (!lp) return NextResponse.json({ error: 'صفحة الهبوط غير موجودة' }, { status: 404 });

    const contentType = req.headers.get('content-type') || '';
    if (!contentType.includes('multipart/form-data')) {
      return NextResponse.json({ error: 'يجب رفع الملف باستخدام multipart/form-data' }, { status: 400 });
    }

    const formData = await req.formData();
    const files = formData.getAll('files').filter((f): f is File => f instanceof File);
    if (files.length === 0) {
      return NextResponse.json({ error: 'صورة واحدة على الأقل مطلوبة' }, { status: 400 });
    }
    if (files.length > MAX_FILES_PER_REQUEST) {
      return NextResponse.json({ error: `الحد الأقصى ${MAX_FILES_PER_REQUEST} صور لكل طلب` }, { status: 400 });
    }

    const urls: string[] = [];
    for (const file of files) {
      const buffer = Buffer.from(await file.arrayBuffer());
      // Client MIME is not trusted — validate then verify by sniffing in storage
      const check = validateImageFile({ mimeType: file.type || 'application/octet-stream', size: buffer.length });
      if (!check.valid) {
        return NextResponse.json({ error: `${file.name}: ${check.error}` }, { status: 400 });
      }
      const stored = await saveProductImage({
        companyId,
        productId: lp.id, // landing-page namespace (products/{lpId} layout)
        buffer,
        mimeType: file.type || 'image/jpeg',
        originalName: file.name,
      });
      urls.push(stored.url);
    }

    await logAudit({
      companyId,
      userId: user.id,
      action: 'LANDING_PAGE_IMAGE_UPLOADED',
      entity: 'LandingPage',
      entityId: lp.id,
      newData: { count: urls.length },
    });

    return NextResponse.json({ success: true, urls });
  } catch (error: any) {
    // saveProductImage throws Arabic-safe validation errors — surface them directly
    if (typeof error?.message === 'string' && !/^\w+:/i.test(error.message) && error.message.length < 200) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return apiErrorResponse(error);
  }
}
