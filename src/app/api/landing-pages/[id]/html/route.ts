import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireContext } from '@/lib/geo-context';
import { requirePermission } from '@/lib/authorization';
import { apiError } from '@/lib/api-error';
import { logAudit } from '@/lib/audit';
import { rateLimit } from '@/lib/rate-limit';
import { validateHtmlUpload } from '@/lib/landing-pages';

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function POST(req: Request, ctx: Ctx) {
  try {
    const { user, companyId, storeId } = await requireContext();
    await requirePermission('landing_pages.edit');
    const { id } = await ctx.params;

    // Rate limit uploads (in-memory, consistent with the rest of the app)
    const rl = rateLimit(`lp_html_upload:${companyId}`, 30, 10 * 60_000);
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
    const file = formData.get('file');
    if (!file || typeof file === 'string') {
      return NextResponse.json({ error: 'ملف HTML مطلوب' }, { status: 400 });
    }

    // Server-side validation — filename & content-type from the client are NOT trusted
    const buffer = Buffer.from(await (file as File).arrayBuffer());
    const check = validateHtmlUpload({
      fileName: (file as File).name || 'index.html',
      size: buffer.length,
      buffer,
    });
    if (!check.valid) return NextResponse.json({ error: check.error }, { status: 400 });

    const htmlContent = buffer.toString('utf8');

    const updated = await db.landingPage.update({
      where: { id: lp.id },
      data: { htmlContent },
      select: { id: true, name: true, slug: true, isPublished: true, updatedAt: true },
    });

    await logAudit({
      companyId,
      userId: user.id,
      action: 'LANDING_PAGE_HTML_UPLOADED',
      entity: 'LandingPage',
      entityId: lp.id,
      newData: { fileName: (file as File).name, size: buffer.length },
    });

    return NextResponse.json({ success: true, landingPage: updated });
  } catch (error) {
    const { body, status } = apiError(error);
    return NextResponse.json(body, { status });
  }
}