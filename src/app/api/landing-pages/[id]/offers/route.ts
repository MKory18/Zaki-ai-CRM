import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireContext } from '@/lib/geo-context';
import { requirePermission } from '@/lib/authorization';
import { apiError } from '@/lib/api-error';

interface Ctx {
  params: Promise<{ id: string }>;
}

const offerSchema = z.object({
  name: z.string().trim().min(1).max(80),
  quantity: z.coerce.number().int().min(1).max(999),
  freeQuantity: z.coerce.number().int().min(0).max(999).default(0),
  price: z.coerce.number().min(0).max(100000),
  isDefault: z.boolean().optional().default(false),
  sortOrder: z.coerce.number().int().min(0).max(999).optional().default(0),
  isActive: z.boolean().optional().default(true),
});

export async function GET(_req: Request, ctx: Ctx) {
  try {
    const { companyId, storeId } = await requireContext();
    await requirePermission('landing_pages.view');
    const { id } = await ctx.params;
    const lp = await db.landingPage.findFirst({ where: { id, companyId, storeId }, select: { id: true } });
    if (!lp) return NextResponse.json({ error: 'غير موجودة' }, { status: 404 });
    const offers = await db.landingPageOffer.findMany({
      where: { landingPageId: id },
      orderBy: [{ sortOrder: 'asc' }, { price: 'asc' }],
    });
    return NextResponse.json({ offers });
  } catch (error) {
    const { body, status } = apiError(error);
    return NextResponse.json(body, { status });
  }
}

export async function POST(req: Request, ctx: Ctx) {
  try {
    const { companyId, storeId } = await requireContext();
    await requirePermission('landing_pages.edit');
    const { id } = await ctx.params;

    const lp = await db.landingPage.findFirst({ where: { id, companyId, storeId }, select: { id: true } });
    if (!lp) return NextResponse.json({ error: 'غير موجودة' }, { status: 404 });

    const parsed = offerSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message || 'بيانات غير صالحة' }, { status: 400 });
    }
    const v = parsed.data;

    const offer = await db.$transaction(async (tx) => {
      // Only one default per page
      if (v.isDefault) {
        await tx.landingPageOffer.updateMany({ where: { landingPageId: id, isDefault: true }, data: { isDefault: false } });
      }
      return tx.landingPageOffer.create({
        data: {
          landingPageId: id,
          name: v.name,
          quantity: v.quantity,
          freeQuantity: v.freeQuantity,
          price: v.price,
          isDefault: v.isDefault,
          sortOrder: v.sortOrder,
          isActive: v.isActive,
        },
      });
    });
    return NextResponse.json({ success: true, offer }, { status: 201 });
  } catch (error) {
    const { body, status } = apiError(error);
    return NextResponse.json(body, { status });
  }
}