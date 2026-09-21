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

/**
 * Creating a page-specific offer is closed.
 *
 * Offers belong to the product now — one bundle, one price, wherever it is
 * sold. This endpoint stays only so that the pages which already have their
 * own offers can be READ and cleaned up; letting it create more would
 * rebuild the exact fork that was just removed.
 */
export async function POST() {
  return NextResponse.json(
    { error: 'عروض صفحة الهبوط أُلغيت — تُدار العروض من صفحة المنتج نفسه.' },
    { status: 410 }
  );
}
