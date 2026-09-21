import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireContext } from '@/lib/geo-context';
import { requirePermission } from '@/lib/authorization';
import { apiError } from '@/lib/api-error';
import { zodMessage } from '@/lib/zod-message';

interface Ctx {
  params: Promise<{ id: string; recId: string }>;
}

const patchSchema = z.object({
  sortOrder: z.coerce.number().int().min(0).max(999).optional(),
  isActive: z.boolean().optional(),
});

export async function PATCH(req: Request, ctx: Ctx) {
  try {
    const { companyId, storeId } = await requireContext();
    await requirePermission('landing_pages.edit');
    const { id, recId } = await ctx.params;

    const lp = await db.landingPage.findFirst({ where: { id, companyId, storeId }, select: { id: true } });
    if (!lp) return NextResponse.json({ error: 'غير موجودة' }, { status: 404 });

    const parsed = patchSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: zodMessage(parsed.error) }, { status: 400 });
    }

    const existing = await db.landingPageRecommendation.findFirst({ where: { id: recId, landingPageId: id } });
    if (!existing) return NextResponse.json({ error: 'غير موجود' }, { status: 404 });

    const rec = await db.landingPageRecommendation.update({ where: { id: existing.id }, data: parsed.data });
    return NextResponse.json({ success: true, recommendation: rec });
  } catch (error) {
    const { body, status } = apiError(error);
    return NextResponse.json(body, { status });
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  try {
    const { companyId, storeId } = await requireContext();
    await requirePermission('landing_pages.edit');
    const { id, recId } = await ctx.params;

    const lp = await db.landingPage.findFirst({ where: { id, companyId, storeId }, select: { id: true } });
    if (!lp) return NextResponse.json({ error: 'غير موجودة' }, { status: 404 });

    const existing = await db.landingPageRecommendation.findFirst({ where: { id: recId, landingPageId: id } });
    if (!existing) return NextResponse.json({ error: 'غير موجود' }, { status: 404 });

    await db.landingPageRecommendation.delete({ where: { id: existing.id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    const { body, status } = apiError(error);
    return NextResponse.json(body, { status });
  }
}