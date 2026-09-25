import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireContext } from '@/lib/geo-context';
import { requirePermission } from '@/lib/authorization';
import { logAudit } from '@/lib/audit';
import { apiErrorResponse } from '@/lib/api-error';
import { zodMessage } from '@/lib/zod-message';
import { REQUIRED_FOR_ADS, storePageUpdateSchema, type PageKind } from '@/lib/store-pages';

/**
 * PATCH  /api/store/pages/:id  — edit or publish (storefront.manage)
 * DELETE /api/store/pages/:id  — remove a page the shop added
 *
 * A page is found by id AND by the store the session is in, so an id from
 * another shop reads as missing rather than as somebody else's page.
 */

const select = {
  id: true, slug: true, title: true, body: true, kind: true,
  isPublished: true, sortOrder: true, updatedAt: true,
} as const;

interface Ctx {
  params: Promise<{ id: string }>;
}

async function load(id: string, storeId: string, companyId: string) {
  return db.storePage.findFirst({ where: { id, storeId, companyId }, select });
}

export async function PATCH(req: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const { user, storeId, companyId } = await requireContext();
    await requirePermission('storefront.manage');

    const before = await load(id, storeId!, companyId);
    if (!before) return NextResponse.json({ error: 'الصفحة غير موجودة' }, { status: 404 });

    const parsed = storePageUpdateSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: zodMessage(parsed.error), errorAr: zodMessage(parsed.error) }, { status: 400 });
    }

    // The KIND is what tells an ad review this shop has a privacy policy.
    // Letting it be edited would let a shop relabel its "about us" as its
    // policy and believe itself covered, so it is fixed at creation.
    if (parsed.data.kind !== undefined && parsed.data.kind !== before.kind) {
      return NextResponse.json(
        { error: 'نوع الصفحة لا يتغيّر بعد إنشائها — أنشئ صفحة جديدة بالنوع المطلوب', code: 'KIND_IMMUTABLE' },
        { status: 409 }
      );
    }

    if (parsed.data.slug && parsed.data.slug !== before.slug) {
      const clash = await db.storePage.findFirst({
        where: { storeId: storeId!, slug: parsed.data.slug, id: { not: id } },
        select: { id: true },
      });
      if (clash) return NextResponse.json({ error: 'هذا المعرّف مستخدم لصفحة أخرى في هذا المتجر' }, { status: 409 });
    }

    const page = await db.storePage.update({ where: { id }, data: parsed.data, select });

    await logAudit({
      companyId, userId: user.id, action: 'STORE_PAGE_UPDATED',
      entity: 'StorePage', entityId: id, previousData: before, newData: page,
    });
    return NextResponse.json({ page });
  } catch (e) {
    return apiErrorResponse(e);
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const { user, storeId, companyId } = await requireContext();
    await requirePermission('storefront.manage');

    const before = await load(id, storeId!, companyId);
    if (!before) return NextResponse.json({ error: 'الصفحة غير موجودة' }, { status: 404 });

    // One of the three an ad review asks for cannot be deleted — a shop
    // that deletes its privacy policy to tidy up loses its campaigns and
    // will not connect the two. Unpublishing it is right there instead.
    if (REQUIRED_FOR_ADS.includes(before.kind as PageKind)) {
      return NextResponse.json(
        {
          error: 'هذه من الصفحات التي تطلبها مراجعة الإعلانات — يمكنك إلغاء نشرها، لا حذفها',
          code: 'REQUIRED_PAGE',
        },
        { status: 409 }
      );
    }

    await db.storePage.delete({ where: { id } });
    await logAudit({
      companyId, userId: user.id, action: 'STORE_PAGE_DELETED',
      entity: 'StorePage', entityId: id, previousData: before,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiErrorResponse(e);
  }
}
