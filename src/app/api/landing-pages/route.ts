import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireContext } from '@/lib/geo-context';
import { requirePermission } from '@/lib/authorization';
import { apiError } from '@/lib/api-error';
import { validateSlug, conversionRate } from '@/lib/landing-pages';
import { buildTemplate } from '@/lib/page-templates';
import { zodMessage } from '@/lib/zod-message';

export async function GET(req: Request) {
  try {
    const { companyId, storeId } = await requireContext();
    await requirePermission('landing_pages.view');

    const { searchParams } = new URL(req.url);
    const page = Math.max(parseInt(searchParams.get('page') || '1', 10) || 1, 1);
    const parsedLimit = parseInt(searchParams.get('limit') || '50', 10);
    const limit = Math.min(Number.isNaN(parsedLimit) ? 50 : parsedLimit, 100);

    const [total, pages] = await Promise.all([
      db.landingPage.count({ where: { companyId, storeId } }),
      db.landingPage.findMany({
        where: { companyId, storeId },
        include: {
          product: { select: { id: true, name: true, basePrice: true, image: true } },
          creator: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return NextResponse.json({
      landingPages: pages.map((p) => ({
        ...p,
        conversionRate: conversionRate(p.viewsCount, p.ordersCount),
      })),
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    const { body, status } = apiError(error);
    return NextResponse.json(body, { status });
  }
}

export async function POST(req: Request) {
  try {
    const { user, companyId, storeId } = await requireContext();
    await requirePermission('landing_pages.create');

    const schema = z.object({
      name: z.string().trim().min(2).max(100),
      slug: z
        .string()
        .trim()
        .toLowerCase()
        .max(60)
        .regex(/^[a-z0-9](?:[a-z0-9-]{1,58}[a-z0-9])?$/, 'الرابط (slug) غير صالح: أحرف إنجليزية صغيرة وأرقام وشرطات فقط'),
      productId: z.string().min(10).max(64).optional().nullable(),
      htmlContent: z.string().max(2 * 1024 * 1024).optional().nullable(),
      /**
       * Which shape of page to start from.
       *
       * Asked at CREATION, which is the only moment it is free. Choosing a
       * template afterwards replaces the page, so it has to warn about
       * losing work — here there is no work yet to lose.
       */
      template: z.string().trim().max(40).optional(),
    });
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: zodMessage(parsed.error) }, { status: 400 });
    }
    const { name, slug, productId, htmlContent, template } = parsed.data;

    const slugCheck = validateSlug(slug);
    if (!slugCheck.valid) return NextResponse.json({ error: slugCheck.error }, { status: 400 });

    if (productId) {
      const product = await db.product.findFirst({ where: { id: productId, companyId } });
      if (!product) return NextResponse.json({ error: 'المنتج غير موجود في شركتك' }, { status: 404 });
    }

    // An unknown key falls back to something usable rather than failing:
    // the page is what the seller asked for, the template is a starting
    // point, and refusing to create the page over it would be the wrong
    // thing to be strict about.
    const built = buildTemplate(template || 'classic');

    try {
      const lp = await db.landingPage.create({
        data: {
          companyId,
          storeId,
          name: name.trim(),
          slug,
          productId: productId || null,
          htmlContent: htmlContent?.slice(0, 2 * 1024 * 1024) || null,
          // A new page starts in the block builder with a real page already
          // in it — an empty canvas is not a starting point, it is a second
          // task. A page created FROM uploaded HTML stays an HTML page.
          builderMode: htmlContent ? 'HTML' : 'BLOCKS',
          // The template's own colour and typeface as well as its blocks —
          // a template that only set the order would be the same page
          // fifteen times.
          theme: htmlContent ? null : JSON.stringify(built.theme),
          sections: htmlContent ? null : JSON.stringify(built.sections),
          createdById: user.id,
        },
      });
      return NextResponse.json({ success: true, landingPage: lp }, { status: 201 });
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