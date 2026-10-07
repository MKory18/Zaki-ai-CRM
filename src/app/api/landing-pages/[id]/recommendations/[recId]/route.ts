import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireContext } from '@/lib/geo-context';
import { requirePermission } from '@/lib/authorization';
import { apiError } from '@/lib/api-error';
import { zodMessage } from '@/lib/zod-message';
import { count } from '@/lib/numeric-input';

interface Ctx {
  params: Promise<{ id: string; recId: string }>;
}

/*
 * `count()` for the reason the POST door states: the window 0…999 is
 * unchanged, and `z.coerce.number()` — which is `Number()`, so `'0x10'`
 * is 16 — stops being the shape copied out of this file onto a column
 * that holds money.
 *
 * `.optional()` and NOT `.default()`: this is a PATCH, and `.partial()`
 * keeping a `.default()` alive is the defect dad59c9 had to go and
 * close in three other doors. A `sortOrder` that was not sent must come
 * back absent, not as a zero that moves the row to the top.
 */
const patchSchema = z.object({
  sortOrder: count(999).optional(),
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