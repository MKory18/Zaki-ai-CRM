import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireContext } from '@/lib/geo-context';
import { requirePermission } from '@/lib/authorization';
import { apiErrorResponse } from '@/lib/api-error';
import { logAudit } from '@/lib/audit';
import { rateLimit } from '@/lib/rate-limit';
import { MAX_LANDING_HTML_BYTES, clampStoredHtml } from '@/lib/landing-pages';
import {
  sanitizeLandingHtml,
  sanitizeLandingCss,
  parseLandingSettings,
  MAX_LANDING_CSS_BYTES,
} from '@/lib/landing-html-sanitize';
import { landingThemeSchema } from '@/lib/landing-theme';
import { landingSectionsSchema } from '@/lib/landing-sections';

interface Ctx {
  params: Promise<{ id: string }>;
}

/**
 * PUT /api/landing-pages/[id]/content — save the custom HTML/CSS editor draft.
 * Server-side sanitization happens BEFORE persistence: the stored artifact
 * itself carries no active content (scripts/handlers/js-URLs are stripped).
 * Only slug/product/publish state is untouched — this endpoint never changes
 * them (publish goes through the existing PATCH route).
 */
export async function PUT(req: Request, ctx: Ctx) {
  try {
    const { user, companyId, storeId } = await requireContext();
    await requirePermission('landing_pages.edit');
    const { id } = await ctx.params;

    const rl = rateLimit(`lp_content_save:${companyId}`, 120, 10 * 60_000);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: `حفظ متكرر جدًا. أعد المحاولة بعد ${rl.retryAfterSec} ثانية` },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } }
      );
    }

    const lp = await db.landingPage.findFirst({ where: { id, companyId, storeId } });
    if (!lp) return NextResponse.json({ error: 'صفحة الهبوط غير موجودة' }, { status: 404 });

    const schema = z.object({
      html: z.string().max(MAX_LANDING_HTML_BYTES).optional().nullable(),
      css: z.string().max(MAX_LANDING_CSS_BYTES).optional().nullable(),
      settings: z.unknown().optional().nullable(),
      // The block builder saves through this same endpoint: one place where
      // a page's content is written, one permission, one rate limit.
      builderMode: z.enum(['BLOCKS', 'HTML']).optional(),
      theme: landingThemeSchema.optional().nullable(),
      sections: z.unknown().optional().nullable(),
    });
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: 'بيانات غير صالحة أو حجم يتجاوز الحد المسموح' }, { status: 400 });
    }

    const data: Record<string, unknown> = {};
    if (parsed.data.html !== undefined) {
      const html = clampStoredHtml(parsed.data.html ?? '');
      if (parsed.data.html && html === null) {
        return NextResponse.json({ error: `حجم HTML يتجاوز الحد المسموح` }, { status: 400 });
      }
      data.htmlContent = html ? sanitizeLandingHtml(html) : (html ?? null);
    }
    if (parsed.data.css !== undefined) {
      const css = parsed.data.css ?? '';
      if (Buffer.byteLength(css, 'utf8') > MAX_LANDING_CSS_BYTES) {
        return NextResponse.json({ error: 'حجم CSS يتجاوز الحد المسموح' }, { status: 400 });
      }
      data.cssContent = css.trim() ? sanitizeLandingCss(css) : null;
    }
    if (parsed.data.settings !== undefined) {
      const settings = parseLandingSettings(parsed.data.settings ?? null);
      data.pageSettings = settings ? JSON.stringify(settings) : null;
    }
    if (parsed.data.builderMode !== undefined) {
      data.builderMode = parsed.data.builderMode;
    }
    if (parsed.data.theme !== undefined) {
      data.theme = parsed.data.theme ? JSON.stringify(parsed.data.theme) : null;
    }
    if (parsed.data.sections !== undefined) {
      // Re-validated here, not trusted from the editor: the public renderer
      // reads these blocks straight out of the row, so the row is the last
      // place a malformed block can be stopped.
      const sections = landingSectionsSchema.safeParse(parsed.data.sections ?? []);
      if (!sections.success) {
        return NextResponse.json({ error: 'أقسام الصفحة غير صالحة' }, { status: 400 });
      }
      data.sections = sections.data.length ? JSON.stringify(sections.data) : null;
    }

    const updated = await db.landingPage.update({
      where: { id: lp.id },
      data,
      select: { id: true, name: true, slug: true, isPublished: true, updatedAt: true },
    });

    await logAudit({
      companyId,
      userId: user.id,
      action: 'LANDING_PAGE_CONTENT_SAVED',
      entity: 'LandingPage',
      entityId: lp.id,
      newData: {
        htmlBytes: parsed.data.html ? Buffer.byteLength(parsed.data.html, 'utf8') : 0,
        cssBytes: parsed.data.css ? Buffer.byteLength(parsed.data.css, 'utf8') : 0,
      },
    });

    return NextResponse.json({ success: true, landingPage: updated });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
