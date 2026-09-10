import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireCompanyTenant } from '@/lib/auth';
import { requirePermission } from '@/lib/authorization';
import { apiError } from '@/lib/api-error';
import { logAudit } from '@/lib/audit';
import { validateSlug, clampStoredHtml, conversionRate } from '@/lib/landing-pages';

interface Ctx {
  params: Promise<{ id: string }>;
}

async function loadLandingPage(id: string, companyId: string) {
  // Tenant isolation: id + companyId in the WHERE — company B can never read company A's page
  return db.landingPage.findFirst({ where: { id, companyId } });
}

export async function GET(_req: Request, ctx: Ctx) {
  try {
    const { companyId } = await requireCompanyTenant();
    await requirePermission('landing_pages.view');
    const { id } = await ctx.params;

    const lp = await db.landingPage.findFirst({
      where: { id, companyId },
      include: {
        product: { select: { id: true, name: true, basePrice: true, image: true, status: true } },
        creator: { select: { id: true, name: true } },
      },
    });
    if (!lp) return NextResponse.json({ error: 'صفحة الهبوط غير موجودة' }, { status: 404 });

    return NextResponse.json({
      landingPage: {
        ...lp,
        htmlContent: clampStoredHtml(lp.htmlContent),
        conversionRate: conversionRate(lp.viewsCount, lp.ordersCount),
      },
    });
  } catch (error) {
    const { body, status } = apiError(error);
    return NextResponse.json(body, { status });
  }
}

export async function PATCH(req: Request, ctx: Ctx) {
  try {
    const { user, companyId } = await requireCompanyTenant();
    const { id } = await ctx.params;

    const schema = z.object({
      name: z.string().trim().min(2).max(100).optional(),
      slug: z.string().trim().toLowerCase().max(60).optional(),
      productId: z.string().min(10).max(64).optional().nullable(),
      isPublished: z.boolean().optional(),
    });
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message || 'بيانات غير صالحة' }, { status: 400 });
    }

    const lp = await loadLandingPage(id, companyId);
    if (!lp) return NextResponse.json({ error: 'صفحة الهبوط غير موجودة' }, { status: 404 });

    // Publish/unpublish is a distinct permission from editing
    if (parsed.data.isPublished !== undefined) {
      await requirePermission('landing_pages.publish');
    }
    const needsEdit =
      parsed.data.name !== undefined || parsed.data.slug !== undefined || parsed.data.productId !== undefined;
    if (needsEdit) await requirePermission('landing_pages.edit');

    const data: Record<string, unknown> = {};
    if (parsed.data.name !== undefined) data.name = parsed.data.name.trim();
    if (parsed.data.slug !== undefined) {
      const slugCheck = validateSlug(parsed.data.slug);
      if (!slugCheck.valid) return NextResponse.json({ error: slugCheck.error }, { status: 400 });
      data.slug = parsed.data.slug;
    }
    if (parsed.data.productId !== undefined) {
      if (parsed.data.productId) {
        const product = await db.product.findFirst({ where: { id: parsed.data.productId, companyId } });
        if (!product) return NextResponse.json({ error: 'المنتج غير موجود في شركتك' }, { status: 404 });
      }
      data.productId = parsed.data.productId;
    }
    if (parsed.data.isPublished !== undefined) data.isPublished = parsed.data.isPublished;

    try {
      const updated = await db.landingPage.update({ where: { id: lp.id }, data });
      await logAudit({
        companyId,
        userId: user.id,
        action: parsed.data.isPublished !== undefined ? 'LANDING_PAGE_PUBLISH_CHANGED' : 'LANDING_PAGE_UPDATED',
        entity: 'LandingPage',
        entityId: lp.id,
        newData: { name: updated.name, slug: updated.slug, isPublished: updated.isPublished, productId: updated.productId },
      });
      return NextResponse.json({ success: true, landingPage: updated });
    } catch (e: any) {
      if (e?.code === 'P2002') {
        return NextResponse.json({ error: 'هذا الرابط (slug) مستخدم بالفعل في شركتك' }, { status: 409 });
      }
      throw e;
    }
  } catch (error) {
    const { body, status } = apiError(error);
    return NextResponse.json(body, { status });
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  try {
    const { user, companyId } = await requireCompanyTenant();
    await requirePermission('landing_pages.delete');
    const { id } = await ctx.params;

    const lp = await loadLandingPage(id, companyId);
    if (!lp) return NextResponse.json({ error: 'صفحة الهبوط غير موجودة' }, { status: 404 });

    await db.landingPage.delete({ where: { id: lp.id } });
    await logAudit({
      companyId,
      userId: user.id,
      action: 'LANDING_PAGE_DELETED',
      entity: 'LandingPage',
      entityId: lp.id,
      newData: { name: lp.name, slug: lp.slug },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    const { body, status } = apiError(error);
    return NextResponse.json(body, { status });
  }
}