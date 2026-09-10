import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireCompanyTenant } from '@/lib/auth';
import { requirePermission } from '@/lib/authorization';
import { apiError } from '@/lib/api-error';

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function GET(_req: Request, ctx: Ctx) {
  try {
    const { companyId } = await requireCompanyTenant();
    await requirePermission('landing_pages.view');
    const { id } = await ctx.params;
    const lp = await db.landingPage.findFirst({ where: { id, companyId }, select: { id: true } });
    if (!lp) return NextResponse.json({ error: 'غير موجودة' }, { status: 404 });
    const recommendations = await db.landingPageRecommendation.findMany({
      where: { landingPageId: id },
      orderBy: { sortOrder: 'asc' },
      include: { product: { select: { id: true, name: true, basePrice: true, image: true } } },
    });
    return NextResponse.json({ recommendations });
  } catch (error) {
    const { body, status } = apiError(error);
    return NextResponse.json(body, { status });
  }
}

const createSchema = z.object({
  productId: z.string().min(10).max(64),
  sortOrder: z.coerce.number().int().min(0).max(999).optional().default(0),
  isActive: z.boolean().optional().default(true),
});

export async function POST(req: Request, ctx: Ctx) {
  try {
    const { companyId } = await requireCompanyTenant();
    await requirePermission('landing_pages.edit');
    const { id } = await ctx.params;

    const lp = await db.landingPage.findFirst({ where: { id, companyId }, select: { id: true } });
    if (!lp) return NextResponse.json({ error: 'غير موجودة' }, { status: 404 });

    const parsed = createSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message || 'بيانات غير صالحة' }, { status: 400 });
    }
    const v = parsed.data;

    // Tenant isolation: product must belong to the same company
    const product = await db.product.findFirst({ where: { id: v.productId, companyId } });
    if (!product) return NextResponse.json({ error: 'المنتج غير موجود في شركتك' }, { status: 404 });

    try {
      const rec = await db.landingPageRecommendation.create({
        data: {
          landingPageId: id,
          productId: v.productId,
          sortOrder: v.sortOrder,
          isActive: v.isActive,
        },
        include: { product: { select: { id: true, name: true, basePrice: true, image: true } } },
      });
      return NextResponse.json({ success: true, recommendation: rec }, { status: 201 });
    } catch (e: any) {
      if (e?.code === 'P2002') {
        return NextResponse.json({ error: 'هذا المنتج مضاف بالفعل' }, { status: 409 });
      }
      throw e;
    }
  } catch (error) {
    const { body, status } = apiError(error);
    return NextResponse.json(body, { status });
  }
}