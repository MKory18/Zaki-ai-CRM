import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireContext } from '@/lib/geo-context';
import { requirePermission } from '@/lib/authorization';
import { apiError } from '@/lib/api-error';
import { zodMessage } from '@/lib/zod-message';
import { count } from '@/lib/numeric-input';

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function GET(_req: Request, ctx: Ctx) {
  try {
    const { companyId, storeId } = await requireContext();
    await requirePermission('landing_pages.view');
    const { id } = await ctx.params;
    const lp = await db.landingPage.findFirst({ where: { id, companyId, storeId }, select: { id: true } });
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

/*
 * `count()`, NOT `z.coerce.number()`.
 *
 * `z.coerce.number()` IS `Number()`, measured: `'0x10'` → 16, `'0b11'` → 3,
 * `''`/`null`/`[]` → 0, `true` → 1. On an upsell's position in a list that
 * is all harmless — it reorders what the shopper sees and writes nothing
 * anybody counts. It is changed so that `z.coerce.number()` is not the shape
 * the next developer copies out of this file onto a column that holds money.
 *
 * The window is unchanged: `LandingPageRecommendation.sortOrder` is
 * `Int @default(0)`, and 0…999 is what this door and its sibling
 * `[recId]/route.ts` already declare. Only the NOTATION moves.
 */
const createSchema = z.object({
  productId: z.string().min(10).max(64),
  sortOrder: count(999).optional().default(0),
  isActive: z.boolean().optional().default(true),
});

export async function POST(req: Request, ctx: Ctx) {
  try {
    const { companyId, storeId } = await requireContext();
    await requirePermission('landing_pages.edit');
    const { id } = await ctx.params;

    const lp = await db.landingPage.findFirst({ where: { id, companyId, storeId }, select: { id: true } });
    if (!lp) return NextResponse.json({ error: 'غير موجودة' }, { status: 404 });

    const parsed = createSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: zodMessage(parsed.error) }, { status: 400 });
    }
    const v = parsed.data;

    // Tenant isolation: product must belong to the same company
    // An upsell is added to an order of THIS store — it must be this store's product.
    const product = await db.product.findFirst({ where: { id: v.productId, companyId, storeId } });
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