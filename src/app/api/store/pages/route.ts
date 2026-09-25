import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireContext } from '@/lib/geo-context';
import { requirePermission } from '@/lib/authorization';
import { logAudit } from '@/lib/audit';
import { apiErrorResponse } from '@/lib/api-error';
import { zodMessage } from '@/lib/zod-message';
import { missingForAds, storePageCreateSchema } from '@/lib/store-pages';

/**
 * GET  /api/store/pages   — this store's pages (storefront.view)
 * POST /api/store/pages   — a new one (storefront.manage)
 *
 * The store is the one the SESSION is in, never one named in the body: the
 * same rule as the theme, for the same reason.
 */

const select = {
  id: true, slug: true, title: true, body: true, kind: true,
  isPublished: true, sortOrder: true, updatedAt: true,
} as const;

export async function GET() {
  try {
    const { storeId, companyId } = await requireContext();
    await requirePermission('storefront.view');

    const [store, pages] = await Promise.all([
      db.store.findFirst({ where: { id: storeId!, companyId }, select: { id: true, slug: true } }),
      db.storePage.findMany({
        where: { storeId: storeId!, companyId },
        orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }],
        select,
      }),
    ]);
    if (!store) return NextResponse.json({ error: 'المتجر غير موجود' }, { status: 404 });

    return NextResponse.json({
      storeSlug: store.slug,
      pages,
      // Which of the three an ad review asks for are not published yet.
      // Said in words on the screen, not as a warning triangle whose
      // meaning nobody can guess.
      missingForAds: missingForAds(pages),
    });
  } catch (e) {
    return apiErrorResponse(e);
  }
}

export async function POST(req: Request) {
  try {
    const { user, storeId, companyId } = await requireContext();
    await requirePermission('storefront.manage');

    const parsed = storePageCreateSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: zodMessage(parsed.error), errorAr: zodMessage(parsed.error) }, { status: 400 });
    }

    const store = await db.store.findFirst({ where: { id: storeId!, companyId }, select: { id: true } });
    if (!store) return NextResponse.json({ error: 'المتجر غير موجود' }, { status: 404 });

    const clash = await db.storePage.findFirst({
      where: { storeId: store.id, slug: parsed.data.slug },
      select: { id: true },
    });
    if (clash) return NextResponse.json({ error: 'هذا المعرّف مستخدم لصفحة أخرى في هذا المتجر' }, { status: 409 });

    const page = await db.storePage.create({
      data: { ...parsed.data, companyId, storeId: store.id },
      select,
    });

    await logAudit({
      companyId, userId: user.id, action: 'STORE_PAGE_CREATED',
      entity: 'StorePage', entityId: page.id, newData: page,
    });
    return NextResponse.json({ page }, { status: 201 });
  } catch (e) {
    return apiErrorResponse(e);
  }
}
