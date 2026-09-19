import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireContext } from '@/lib/geo-context';
import { requirePermission } from '@/lib/authorization';
import { apiError } from '@/lib/api-error';
import { validateSlug, conversionRate } from '@/lib/landing-pages';

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
    });
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message || 'بيانات غير صالحة' }, { status: 400 });
    }
    const { name, slug, productId, htmlContent } = parsed.data;

    const slugCheck = validateSlug(slug);
    if (!slugCheck.valid) return NextResponse.json({ error: slugCheck.error }, { status: 400 });

    if (productId) {
      const product = await db.product.findFirst({ where: { id: productId, companyId } });
      if (!product) return NextResponse.json({ error: 'المنتج غير موجود في شركتك' }, { status: 404 });
    }

    try {
      const lp = await db.landingPage.create({
        data: {
          companyId,
          storeId,
          name: name.trim(),
          slug,
          productId: productId || null,
          htmlContent: htmlContent?.slice(0, 2 * 1024 * 1024) || null,
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