import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireContext } from '@/lib/geo-context';
import { requirePermission } from '@/lib/authorization';
import { apiErrorResponse } from '@/lib/api-error';
import { logAudit } from '@/lib/audit';
import { deleteStoredFile } from '@/lib/storage';

interface Ctx {
  params: Promise<{ id: string }>;
}

/**
 * Remove one uploaded face, or rename it.
 *
 * Scoped by companyId AND storeId in the WHERE, not checked afterwards: a
 * font belonging to another store is not found here rather than found and
 * refused, so there is no shape of request that reveals it exists.
 */
export async function DELETE(_req: Request, ctx: Ctx) {
  try {
    const { user, companyId, storeId } = await requireContext();
    await requirePermission('landing_pages.edit');
    const { id } = await ctx.params;

    const font = await db.storeFont.findFirst({
      where: { id, companyId, storeId: storeId ?? '' },
      select: { id: true, label: true, weight: true, storageKey: true },
    });
    if (!font) return NextResponse.json({ error: 'الخط غير موجود' }, { status: 404 });

    await db.storeFont.delete({ where: { id: font.id } });
    // After the row, not before: a file deleted while the row survived would
    // leave a page asking for a face that 404s on every visit.
    await deleteStoredFile(font.storageKey);

    await logAudit({
      companyId,
      userId: user.id,
      action: 'STORE_FONT_DELETED',
      entity: 'StoreFont',
      entityId: font.id,
      previousData: { label: font.label, weight: font.weight },
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    return apiErrorResponse(e);
  }
}

export async function PATCH(req: Request, ctx: Ctx) {
  try {
    const { user, companyId, storeId } = await requireContext();
    await requirePermission('landing_pages.edit');
    const { id } = await ctx.params;

    const body = await req.json().catch(() => null);
    const label = typeof body?.label === 'string' ? body.label.trim().slice(0, 60) : '';
    if (!label) return NextResponse.json({ error: 'الاسم مطلوب' }, { status: 400 });

    const font = await db.storeFont.findFirst({
      where: { id, companyId, storeId: storeId ?? '' },
      select: { id: true, key: true },
    });
    if (!font) return NextResponse.json({ error: 'الخط غير موجود' }, { status: 404 });

    // Every weight of a family renames together: the picker lists a family,
    // not five files, and half a family renamed reads as two families.
    await db.storeFont.updateMany({
      where: { companyId, storeId: storeId ?? '', key: font.key },
      data: { label },
    });

    await logAudit({
      companyId,
      userId: user.id,
      action: 'STORE_FONT_RENAMED',
      entity: 'StoreFont',
      entityId: font.id,
      newData: { label },
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    return apiErrorResponse(e);
  }
}
