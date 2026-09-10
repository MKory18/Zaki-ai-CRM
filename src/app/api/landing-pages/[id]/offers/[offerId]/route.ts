import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireCompanyTenant } from '@/lib/auth';
import { requirePermission } from '@/lib/authorization';
import { apiError } from '@/lib/api-error';

interface Ctx {
  params: Promise<{ id: string; offerId: string }>;
}

const patchSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  quantity: z.coerce.number().int().min(1).max(999).optional(),
  freeQuantity: z.coerce.number().int().min(0).max(999).optional(),
  price: z.coerce.number().min(0).max(100000).optional(),
  isDefault: z.boolean().optional(),
  sortOrder: z.coerce.number().int().min(0).max(999).optional(),
  isActive: z.boolean().optional(),
});

export async function PATCH(req: Request, ctx: Ctx) {
  try {
    const { companyId } = await requireCompanyTenant();
    await requirePermission('landing_pages.edit');
    const { id, offerId } = await ctx.params;

    const lp = await db.landingPage.findFirst({ where: { id, companyId }, select: { id: true } });
    if (!lp) return NextResponse.json({ error: 'غير موجودة' }, { status: 404 });

    const parsed = patchSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message || 'بيانات غير صالحة' }, { status: 400 });
    }
    const v = parsed.data;

    // Tenant isolation: offer must belong to THIS landing page
    const existing = await db.landingPageOffer.findFirst({ where: { id: offerId, landingPageId: id } });
    if (!existing) return NextResponse.json({ error: 'العرض غير موجود' }, { status: 404 });

    const offer = await db.$transaction(async (tx) => {
      if (parsed.data.isDefault === true) {
        await tx.landingPageOffer.updateMany({ where: { landingPageId: id, isDefault: true }, data: { isDefault: false } });
      }
      return tx.landingPageOffer.update({ where: { id: existing.id }, data: parsed.data });
    });
    return NextResponse.json({ success: true, offer });
  } catch (error) {
    const { body, status } = apiError(error);
    return NextResponse.json(body, { status });
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  try {
    const { companyId } = await requireCompanyTenant();
    await requirePermission('landing_pages.edit');
    const { id, offerId } = await ctx.params;

    const lp = await db.landingPage.findFirst({ where: { id, companyId }, select: { id: true } });
    if (!lp) return NextResponse.json({ error: 'غير موجودة' }, { status: 404 });

    const existing = await db.landingPageOffer.findFirst({ where: { id: offerId, landingPageId: id } });
    if (!existing) return NextResponse.json({ error: 'العرض غير موجود' }, { status: 404 });

    await db.landingPageOffer.delete({ where: { id: offerId } });
    return NextResponse.json({ success: true });
  } catch (error) {
    const { body, status } = apiError(error);
    return NextResponse.json(body, { status });
  }
}