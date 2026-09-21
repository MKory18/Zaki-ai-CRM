import { NextResponse } from 'next/server';
import { z } from 'zod';
import { apiErrorResponse } from '@/lib/api-error';
import { db } from '@/lib/db';
import { requireCompanyTenant } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { requirePermission } from '@/lib/authorization';
import { offerInputSchema, clearOtherDefaults } from '@/lib/offers';

/**
 * A product's offers — the ONE place a bundle and its price are defined.
 *
 * They used to live in two places: here, and again on each landing page. A
 * price raised in the catalogue never reached the page selling it, and the
 * two disagreed silently. Now the product owns its offers and every surface
 * — landing page, quick order, the order screen — reads them from here.
 */

export async function GET(req: Request) {
  try {
    const { companyId } = await requireCompanyTenant();
    await requirePermission('offers.view');

    const productId = new URL(req.url).searchParams.get('productId')?.trim() || undefined;

    const offers = await db.offer.findMany({
      where: { companyId, ...(productId ? { productId } : {}) },
      include: {
        product: {
          select: { id: true, name: true, sku: true, basePrice: true, image: true },
        },
      },
      // The order the customer will see them in, not the order they were typed.
      orderBy: productId
        ? [{ sortOrder: 'asc' }, { quantity: 'asc' }]
        : [{ createdAt: 'desc' }],
    });

    return NextResponse.json({ offers });
  } catch (error: any) {
    return apiErrorResponse(error);
  }
}

export async function POST(req: Request) {
  try {
    const { user, companyId } = await requireCompanyTenant();
    await requirePermission('offers.manage');

    const parsed = offerInputSchema.extend({ productId: z.string().min(10).max(64) })
      .safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'بيانات العرض غير صالحة' },
        { status: 400 }
      );
    }
    const input = parsed.data;

    // Tenant-validate the referenced product before writing anything.
    const product = await db.product.findFirst({ where: { id: input.productId, companyId } });
    if (!product) {
      return NextResponse.json({ error: 'المنتج غير موجود في شركتك' }, { status: 404 });
    }

    const offer = await db.$transaction(async (tx) => {
      const created = await tx.offer.create({
        data: {
          companyId,
          productId: input.productId,
          name: input.name.trim(),
          quantity: input.quantity,
          freeQuantity: input.freeQuantity,
          sellingPrice: input.sellingPrice,
          compareAtPrice: input.compareAtPrice ?? null,
          discount: input.discount,
          deliveryIncluded: input.deliveryIncluded,
          isDefault: input.isDefault,
          sortOrder: input.sortOrder,
          status: input.status,
        },
      });
      // Exactly one default per product — see clearOtherDefaults.
      await clearOtherDefaults(tx, created);
      return created;
    });

    await logAudit({
      companyId,
      userId: user.id,
      action: 'OFFER_CREATED',
      entity: 'Offer',
      entityId: offer.id,
      newData: offer,
    });

    return NextResponse.json({ success: true, offer });
  } catch (error: any) {
    return apiErrorResponse(error);
  }
}
