import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireContext, listAccessibleStores } from '@/lib/geo-context';
import { requirePermission } from '@/lib/authorization';
import { apiErrorResponse } from '@/lib/api-error';
import { logAudit } from '@/lib/audit';
import { zodMessage } from '@/lib/zod-message';

/**
 * SHOW EVERY PUBLISHED PAGE OF THIS STORE — ONE PRESS, ONE UPDATE.
 *
 * This is the press the catalogue switch waits for: it flips every
 * published page of exactly this store to `showInStore` in a single
 * `updateMany`, so the moment the pages appear is the same moment the
 * catalogue starts reading them — the store is never empty in between.
 * Unpublished pages are not touched: the flag is intent, publishing is
 * the act. Draft and publish columns are not read and not written here.
 */
export async function POST(req: Request) {
  try {
    const { user, companyId, countryId } = await requireContext();
    await requirePermission('landing_pages.edit');

    const parsed = z.object({ storeId: z.string().uuid() }).safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: zodMessage(parsed.error) }, { status: 400 });
    const { storeId } = parsed.data;

    const accessible = (await listAccessibleStores(user, companyId, countryId)) ?? [];
    if (!accessible.some((s) => s.id === storeId)) {
      return NextResponse.json({ error: 'المتجر غير موجود' }, { status: 404 });
    }

    const updated = await db.landingPage.updateMany({
      where: { companyId, storeId, isPublished: true, showInStore: false },
      data: { showInStore: true },
    });

    await logAudit({
      companyId,
      userId: user.id,
      action: 'LANDING_PAGES_SHOWN_ALL',
      entity: 'Store',
      entityId: storeId,
      newData: { shown: updated.count },
    });
    return NextResponse.json({ success: true, shown: updated.count });
  } catch (e) {
    return apiErrorResponse(e);
  }
}
