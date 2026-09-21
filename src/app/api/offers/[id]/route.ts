import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireCompanyTenant } from '@/lib/auth';
import { requirePermission } from '@/lib/authorization';
import { apiErrorResponse } from '@/lib/api-error';
import { logAudit } from '@/lib/audit';
import { offerInputSchema, clearOtherDefaults } from '@/lib/offers';

interface Ctx {
  params: Promise<{ id: string }>;
}

/**
 * PATCH /api/offers/[id]   edit one bundle
 * DELETE /api/offers/[id]  retire one bundle
 *
 * Editing offers used to be possible only by creating new ones, which is why
 * a company ended up with forty-one of them. Both verbs are tenant-scoped:
 * an id from another company reads as missing, never as forbidden.
 */

export async function PATCH(req: Request, ctx: Ctx) {
  try {
    const { user, companyId } = await requireCompanyTenant();
    await requirePermission('offers.manage');
    const { id } = await ctx.params;

    const existing = await db.offer.findFirst({ where: { id, companyId } });
    if (!existing) return NextResponse.json({ error: 'العرض غير موجود' }, { status: 404 });

    const parsed = offerInputSchema.partial().safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'بيانات العرض غير صالحة' },
        { status: 400 }
      );
    }
    const input = parsed.data;

    const offer = await db.$transaction(async (tx) => {
      const updated = await tx.offer.update({
        where: { id: existing.id },
        data: {
          ...(input.name !== undefined ? { name: input.name.trim() } : {}),
          ...(input.quantity !== undefined ? { quantity: input.quantity } : {}),
          ...(input.freeQuantity !== undefined ? { freeQuantity: input.freeQuantity } : {}),
          ...(input.sellingPrice !== undefined ? { sellingPrice: input.sellingPrice } : {}),
          ...(input.compareAtPrice !== undefined ? { compareAtPrice: input.compareAtPrice ?? null } : {}),
          ...(input.discount !== undefined ? { discount: input.discount } : {}),
          ...(input.deliveryIncluded !== undefined ? { deliveryIncluded: input.deliveryIncluded } : {}),
          ...(input.isDefault !== undefined ? { isDefault: input.isDefault } : {}),
          ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
        },
      });
      await clearOtherDefaults(tx, updated);
      return updated;
    });

    await logAudit({
      companyId,
      userId: user.id,
      action: 'OFFER_UPDATED',
      entity: 'Offer',
      entityId: offer.id,
      previousData: existing,
      newData: offer,
    });

    return NextResponse.json({ success: true, offer });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  try {
    const { user, companyId } = await requireCompanyTenant();
    await requirePermission('offers.manage');
    const { id } = await ctx.params;

    const existing = await db.offer.findFirst({ where: { id, companyId } });
    if (!existing) return NextResponse.json({ error: 'العرض غير موجود' }, { status: 404 });

    // An offer an order was placed on is history, not configuration. Deleting
    // it would leave that order unable to say what was actually sold, so it
    // is retired instead — invisible to customers, intact for the record.
    const usedBy = await db.order.count({ where: { offerId: existing.id } });
    if (usedBy > 0) {
      const offer = await db.offer.update({
        where: { id: existing.id },
        data: { status: 'INACTIVE', isDefault: false },
      });
      await logAudit({
        companyId,
        userId: user.id,
        action: 'OFFER_RETIRED',
        entity: 'Offer',
        entityId: offer.id,
        previousData: existing,
        newData: { ...offer, reason: `linked to ${usedBy} order(s)` },
      });
      return NextResponse.json({
        success: true,
        retired: true,
        message: `العرض مرتبط بـ ${usedBy} طلب — تم إيقافه بدل حذفه حتى تبقى الطلبات قابلة للقراءة.`,
      });
    }

    await db.offer.delete({ where: { id: existing.id } });
    await logAudit({
      companyId,
      userId: user.id,
      action: 'OFFER_DELETED',
      entity: 'Offer',
      entityId: existing.id,
      previousData: existing,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
