import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireContext } from '@/lib/geo-context';
import { requirePermission } from '@/lib/authorization';
import { logAudit } from '@/lib/audit';
import { apiErrorResponse } from '@/lib/api-error';
import { STORE_LANGUAGES, directionOf, storeLanguageSchema } from '@/lib/store-languages';
import { z } from 'zod';

/**
 * GET / PUT  /api/store/language
 *
 * One language per shop, and the direction derived from it. There is no
 * field for direction: two values that can disagree eventually do.
 */

const putSchema = z.object({ language: storeLanguageSchema });

const select = { id: true, language: true } as const;

export async function GET() {
  try {
    const { storeId, companyId } = await requireContext();
    await requirePermission('storefront.view');

    const store = await db.store.findFirst({ where: { id: storeId!, companyId }, select });
    if (!store) return NextResponse.json({ error: 'المتجر غير موجود' }, { status: 404 });

    return NextResponse.json({
      language: store.language,
      dir: directionOf(store.language),
      available: STORE_LANGUAGES,
    });
  } catch (e) {
    return apiErrorResponse(e);
  }
}

export async function PUT(req: Request) {
  try {
    const { user, storeId, companyId } = await requireContext();
    await requirePermission('storefront.manage');

    const parsed = putSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'لغة غير مدعومة' }, { status: 400 });

    const before = await db.store.findFirst({ where: { id: storeId!, companyId }, select });
    if (!before) return NextResponse.json({ error: 'المتجر غير موجود' }, { status: 404 });

    await db.store.update({ where: { id: before.id }, data: { language: parsed.data.language } });

    await logAudit({
      companyId, userId: user.id, action: 'STORE_LANGUAGE_CHANGED',
      entity: 'Store', entityId: before.id,
      previousData: { language: before.language },
      newData: { language: parsed.data.language },
    });

    return NextResponse.json({
      language: parsed.data.language,
      dir: directionOf(parsed.data.language),
      available: STORE_LANGUAGES,
    });
  } catch (e) {
    return apiErrorResponse(e);
  }
}
