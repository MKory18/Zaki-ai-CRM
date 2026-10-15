import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireContext } from '@/lib/geo-context';
import { requirePermission } from '@/lib/authorization';
import { apiErrorResponse } from '@/lib/api-error';
import { REVIEW_MODES, reviewMode, setReviewMode } from '@/lib/product-reviews';

/**
 * WHERE THIS PRODUCT'S SOCIAL PROOF COMES FROM — يدوي · تلقائي · الاتنين.
 *
 * Owner decision D8. The seller starts manual because on day one there is
 * nothing real to show; at five published verified reviews the system moves
 * the product to automatic by itself and tells him, and THIS is how he
 * moves it back. A switch the system can throw and the owner cannot is not
 * a setting, it is a surprise.
 *
 * Per PRODUCT, never per store: a shop may sell one article with forty
 * delivered orders and launch another this morning, and one switch for both
 * would make the new one borrow the old one's credibility.
 */

const body = z.object({
  productId: z.string().min(1),
  mode: z.enum(REVIEW_MODES),
});

export async function PUT(req: Request) {
  try {
    const { user, companyId, storeId } = await requireContext();
    await requirePermission('storefront.manage');

    const parsed = body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'مصدر الآراء غير صالح' }, { status: 400 });

    // THIS STORE'S product, not merely this company's. The store bar names
    // which shop is being edited, and a product from the shop next door is
    // not this screen's to change.
    const product = await db.product.findFirst({
      where: { id: parsed.data.productId, companyId, ...(storeId ? { storeId } : {}) },
      select: { id: true },
    });
    if (!product) return NextResponse.json({ error: 'المنتج غير موجود' }, { status: 404 });

    const done = await setReviewMode({
      companyId,
      productId: product.id,
      userId: user.id,
      mode: parsed.data.mode,
    });
    if (!done.ok) return NextResponse.json({ error: done.error ?? 'تعذّر الحفظ' }, { status: 400 });

    return NextResponse.json({ success: true, mode: reviewMode(parsed.data.mode) });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
