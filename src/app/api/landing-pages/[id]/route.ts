import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireContext } from '@/lib/geo-context';
import { requirePermission } from '@/lib/authorization';
import { apiError } from '@/lib/api-error';
import { logAudit } from '@/lib/audit';
import { validateSlug, clampStoredHtml, conversionRate } from '@/lib/landing-pages';
import { validateDomain, forgetHost, dashboardHosts } from '@/lib/landing-domain';
import { zodMessage } from '@/lib/zod-message';

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
        // that is the country's currency, not the company's. The page is
        // read through the selected store, so it always has one.
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
      // '' clears the domain; the page goes back to /lp/<slug> only.
      domain: z.string().trim().max(253).optional().nullable(),
    });
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: zodMessage(parsed.error) }, { status: 400 });
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
      parsed.data.domain !== undefined;
    if (needsEdit) await requirePermission('landing_pages.edit');

    // A page that is a Single Product store's front answers at the store's
    // address. What would break that address is refused here, where the
    // seller is — not discovered by a customer following an ad.
    const front = await db.store.findFirst({
      where: { landingPageId: lp.id },
      select: { name: true, storefrontEnabled: true },
    });
    if (front?.storefrontEnabled && parsed.data.isPublished === false) {
      return NextResponse.json(
        { error: `هذه الصفحة واجهة متجر «${front.name}» المفتوح — أغلق المتجر أولاً أو اختر له صفحة أخرى` },
        { status: 409 }
      );
    }
    if (front?.storefrontEnabled && parsed.data.productId === null) {
      return NextResponse.json(
        { error: `هذه الصفحة واجهة متجر «${front.name}» — بلا منتج لن يبيع المتجر شيئاً` },
        { status: 409 }
      );
    }
    if (front && parsed.data.domain) {
      return NextResponse.json(
        { error: `هذه الصفحة واجهة متجر «${front.name}» — نطاقها هو نطاق المتجر، ويُضبط من إعدادات المتجر` },
        { status: 409 }
      );
    }

    const data: Record<string, unknown> = {};
    if (parsed.data.name !== undefined) data.name = parsed.data.name.trim();
    if (parsed.data.slug !== undefined) {
      const slugCheck = validateSlug(parsed.data.slug);
      if (!slugCheck.valid) return NextResponse.json({ error: slugCheck.error }, { status: 400 });
      // One public space for every company — see the create route.
      if (parsed.data.slug !== lp.slug) {
        const taken = await db.landingPage.findFirst({ where: { slug: parsed.data.slug, id: { not: lp.id } }, select: { id: true } });
        if (taken) return NextResponse.json({ error: 'هذا الرابط (slug) مستخدم بالفعل — اختر رابطاً آخر' }, { status: 409 });
      }
      data.slug = parsed.data.slug;
    }
    if (parsed.data.productId !== undefined) {
      // Checked when it CHANGES: the editor sends the whole form, and a page
      // bound before this rule would otherwise be unable to save anything.
      if (parsed.data.productId && parsed.data.productId !== lp.productId) {
        // THIS store's product. A page in one store selling another store's
        // product booked the order against the wrong shop's stock.
        const product = await db.product.findFirst({ where: { id: parsed.data.productId, companyId, storeId: lp.storeId } });
        if (!product) return NextResponse.json({ error: 'المنتج ليس من منتجات هذا المتجر' }, { status: 404 });
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
        const check = validateDomain(raw, dashboardHosts(req));
        if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });
        // Unique across companies, so a clash is somebody else's claim and
        // saying which company holds it would leak who our customers are.
        // Checked against STORES too: the proxy answers a landing page first,
        // so a page claiming a store's host silently took the store over.
        // And the host answers with /lp/<slug>: a slug another page also
        // holds (from before slugs were unique everywhere) would show the
        // older of the two — perhaps another company's — at this domain.
        const slug = typeof data.slug === 'string' ? data.slug : lp.slug;
        const [taken, store, sharedSlug] = await Promise.all([
          db.landingPage.findFirst({ where: { domain: check.domain, id: { not: lp.id } }, select: { id: true } }),
          db.store.findFirst({ where: { domain: check.domain }, select: { id: true } }),
          db.landingPage.findFirst({ where: { slug, id: { not: lp.id } }, select: { id: true } }),
        ]);
        if (taken || store) {
          return NextResponse.json({ error: 'هذا النطاق مستخدم بالفعل' }, { status: 409 });
        }
        if (sharedSlug) {
          return NextResponse.json(
            { error: 'رابط هذه الصفحة (slug) مستخدم في صفحة أخرى — غيّره أولاً ثم اربط النطاق' },
            { status: 409 }
          );
        }
        data.domain = check.domain;
      }
      // The proxy caches host → page for a minute; a domain is changed at the
      // exact moment somebody is waiting to see whether it works.
      forgetHost(lp.domain);
      forgetHost(typeof data.domain === 'string' ? data.domain : null);
    }

    // A page no longer carries its own pixel. The two columns that held one
    // are still in the table (migrations only add) but nothing reads them:
    // every pixel lives in tracking_pixels, managed on /settings/tracking,
    // with "landing pages only" as its scope when that is what is wanted.

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

    // Deleting an open store's front would leave its address answering 404
    // to every ad pointing at it.
    const front = await db.store.findFirst({
      where: { landingPageId: lp.id, storefrontEnabled: true },
      select: { name: true },
    });
    if (front) {
      return NextResponse.json(
        { error: `هذه الصفحة واجهة متجر «${front.name}» المفتوح — أغلق المتجر أولاً أو اختر له صفحة أخرى` },
        { status: 409 }
      );
    }

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