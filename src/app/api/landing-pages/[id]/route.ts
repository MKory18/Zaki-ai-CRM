import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireContext } from '@/lib/geo-context';
import { requirePermission } from '@/lib/authorization';
import { apiError } from '@/lib/api-error';
import { logAudit } from '@/lib/audit';
import { validateSlug, clampStoredHtml, conversionRate } from '@/lib/landing-pages';
import { validatePixelId } from '@/lib/landing-tracking';
import { validateDomain, forgetHost } from '@/lib/landing-domain';

interface Ctx {
  params: Promise<{ id: string }>;
}

async function loadLandingPage(id: string, companyId: string, storeId: string) {
  // Tenant isolation: id + companyId in the WHERE — company B can never read company A's page
  return db.landingPage.findFirst({ where: { id, companyId, storeId } });
}

export async function GET(_req: Request, ctx: Ctx) {
  try {
    const { companyId, storeId } = await requireContext();
    await requirePermission('landing_pages.view');
    const { id } = await ctx.params;

    const lp = await db.landingPage.findFirst({
      where: { id, companyId, storeId },
      include: {
        product: { select: { id: true, name: true, basePrice: true, image: true, status: true } },
        creator: { select: { id: true, name: true } },
        // The editor's preview must price in the SAME currency the published
        // page does, or it is a preview of a page that does not exist — and
        // that is the country's currency, not the company's.
        company: { select: { currency: true } },
        store: { select: { country: { select: { currencyCode: true } } } },
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
    const { user, companyId, storeId } = await requireContext();
    const { id } = await ctx.params;

    const schema = z.object({
      name: z.string().trim().min(2).max(100).optional(),
      slug: z.string().trim().toLowerCase().max(60).optional(),
      productId: z.string().min(10).max(64).optional().nullable(),
      isPublished: z.boolean().optional(),
      metaPixelId: z.string().trim().max(20).optional().nullable(),
      metaPixelEnabled: z.boolean().optional(),
      // '' clears the domain; the page goes back to /lp/<slug> only.
      domain: z.string().trim().max(253).optional().nullable(),
    });
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message || 'بيانات غير صالحة' }, { status: 400 });
    }

    const lp = await loadLandingPage(id, companyId, storeId);
    if (!lp) return NextResponse.json({ error: 'صفحة الهبوط غير موجودة' }, { status: 404 });

    // Publish/unpublish is a distinct permission from editing
    if (parsed.data.isPublished !== undefined) {
      await requirePermission('landing_pages.publish');
    }
    const needsEdit =
      parsed.data.name !== undefined ||
      parsed.data.slug !== undefined ||
      parsed.data.productId !== undefined ||
      parsed.data.metaPixelId !== undefined ||
      parsed.data.metaPixelEnabled !== undefined ||
      parsed.data.domain !== undefined;
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

    // ── Custom domain ──
    if (parsed.data.domain !== undefined) {
      const raw = parsed.data.domain?.trim() ?? '';
      if (!raw) {
        data.domain = null;
        data.domainVerifiedAt = null;
      } else {
        const check = validateDomain(raw);
        if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });
        // Unique across companies, so a clash is somebody else's claim and
        // saying which company holds it would leak who our customers are.
        const taken = await db.landingPage.findFirst({
          where: { domain: check.domain, id: { not: lp.id } },
          select: { id: true },
        });
        if (taken) {
          return NextResponse.json({ error: 'هذا النطاق مستخدم بالفعل' }, { status: 409 });
        }
        data.domain = check.domain;
      }
      // The proxy caches host → page for a minute; a domain is changed at the
      // exact moment somebody is waiting to see whether it works.
      forgetHost(lp.domain);
      forgetHost(typeof data.domain === 'string' ? data.domain : null);
    }

    // ── Meta Pixel configuration (configuration, never code) ──
    if (parsed.data.metaPixelId !== undefined || parsed.data.metaPixelEnabled !== undefined) {
      const nextId = parsed.data.metaPixelId !== undefined ? parsed.data.metaPixelId : lp.metaPixelId;
      const nextEnabled = parsed.data.metaPixelEnabled !== undefined ? parsed.data.metaPixelEnabled : lp.metaPixelEnabled;
      const cleanId = validatePixelId(nextId ?? null);
      if (nextEnabled && !cleanId) {
        return NextResponse.json(
          { error: 'Meta Pixel ID غير صالح (أرقام فقط، 15-16 خانة)' },
          { status: 400 }
        );
      }
      if (parsed.data.metaPixelId !== undefined) {
        // Store the validated digits only — or null when empty (cleanest disable)
        data.metaPixelId = nextId && cleanId ? cleanId : null;
      }
      if (parsed.data.metaPixelEnabled !== undefined) {
        // Enabling with no valid id is refused above; disabling always allowed
        data.metaPixelEnabled = nextEnabled && Boolean(cleanId);
      }
    }

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
        // Two unique keys reach here now; naming the wrong one sends the
        // seller to change a field that was never the problem.
        const onDomain = Array.isArray(e?.meta?.target)
          ? e.meta.target.includes('domain')
          : String(e?.meta?.target ?? '').includes('domain');
        return NextResponse.json(
          { error: onDomain ? 'هذا النطاق مستخدم بالفعل' : 'هذا الرابط (slug) مستخدم بالفعل في شركتك' },
          { status: 409 }
        );
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
    const { user, companyId, storeId } = await requireContext();
    await requirePermission('landing_pages.delete');
    const { id } = await ctx.params;

    const lp = await loadLandingPage(id, companyId, storeId);
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