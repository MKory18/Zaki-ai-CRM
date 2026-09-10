import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireCompanyTenant } from '@/lib/auth';
import { requirePermission } from '@/lib/authorization';
import { apiError } from '@/lib/api-error';
import { signPreviewToken } from '@/lib/landing-pages';

interface Ctx {
  params: Promise<{ id: string }>;
}

/**
 * Issues a short-lived signed preview token for embedding an UNPUBLISHED
 * landing page inside a sandboxed iframe in the dashboard.
 */
export async function POST(_req: Request, ctx: Ctx) {
  try {
    const { companyId } = await requireCompanyTenant();
    await requirePermission('landing_pages.view');
    const { id } = await ctx.params;

    const lp = await db.landingPage.findFirst({
      where: { id, companyId },
      select: { id: true, slug: true },
    });
    if (!lp) return NextResponse.json({ error: 'صفحة الهبوط غير موجودة' }, { status: 404 });

    const token = await signPreviewToken(lp.id);
    return NextResponse.json({ success: true, token, previewPath: `/lp/${lp.slug}/raw?p=${token}` });
  } catch (error) {
    const { body, status } = apiError(error);
    return NextResponse.json(body, { status });
  }
}