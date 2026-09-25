import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireContext } from '@/lib/geo-context';
import { requirePermission } from '@/lib/authorization';
import { logAudit } from '@/lib/audit';
import { apiErrorResponse } from '@/lib/api-error';
import { zodMessage } from '@/lib/zod-message';
import { MENU_KEYS, parseMenuItems, storeMenuUpdateSchema, type MenuKey } from '@/lib/store-menus';
import { z } from 'zod';

/**
 * GET   /api/store/menus        — all five, plus what they can link to
 * PUT   /api/store/menus?key=   — replace one menu's items
 *
 * The store is the one the SESSION is in. All five keys always come back,
 * empty where nothing is set: a menu the shop has not filled in is a menu
 * with no items, not a missing menu the screen has to invent.
 */

const keySchema = z.enum(MENU_KEYS);

export async function GET() {
  try {
    const { storeId, companyId } = await requireContext();
    await requirePermission('storefront.view');

    const [store, rows, pages] = await Promise.all([
      db.store.findFirst({ where: { id: storeId!, companyId }, select: { id: true, slug: true } }),
      db.storeMenu.findMany({ where: { storeId: storeId! }, select: { key: true, items: true } }),
      // What a menu item can point at without anybody typing a path: the
      // shop's own pages. A path typed from memory is a path that breaks.
      db.storePage.findMany({
        where: { storeId: storeId!, companyId },
        orderBy: [{ sortOrder: 'asc' }],
        select: { slug: true, title: true, isPublished: true },
      }),
    ]);
    if (!store) return NextResponse.json({ error: 'المتجر غير موجود' }, { status: 404 });

    const stored = new Map(rows.map((r) => [r.key, r.items]));
    const menus = Object.fromEntries(
      MENU_KEYS.map((key) => [key, parseMenuItems(stored.get(key))])
    ) as Record<MenuKey, ReturnType<typeof parseMenuItems>>;

    return NextResponse.json({ storeSlug: store.slug, menus, pages });
  } catch (e) {
    return apiErrorResponse(e);
  }
}

export async function PUT(req: Request) {
  try {
    const { user, storeId, companyId } = await requireContext();
    await requirePermission('storefront.manage');

    const key = keySchema.safeParse(new URL(req.url).searchParams.get('key'));
    if (!key.success) return NextResponse.json({ error: 'قائمة غير معروفة' }, { status: 400 });

    const parsed = storeMenuUpdateSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: zodMessage(parsed.error), errorAr: zodMessage(parsed.error) }, { status: 400 });
    }

    const store = await db.store.findFirst({ where: { id: storeId!, companyId }, select: { id: true } });
    if (!store) return NextResponse.json({ error: 'المتجر غير موجود' }, { status: 404 });

    const before = await db.storeMenu.findFirst({
      where: { storeId: store.id, key: key.data },
      select: { items: true },
    });

    const items = JSON.stringify(parsed.data.items);
    // A menu is replaced whole, so upsert on (storeId, key) rather than
    // create-or-patch: there is exactly one row per menu per shop and the
    // unique index says so.
    await db.storeMenu.upsert({
      where: { storeId_key: { storeId: store.id, key: key.data } },
      create: { companyId, storeId: store.id, key: key.data, items },
      update: { items },
    });

    await logAudit({
      companyId, userId: user.id, action: 'STORE_MENU_UPDATED',
      entity: 'StoreMenu', entityId: `${store.id}:${key.data}`,
      previousData: { key: key.data, items: before?.items ?? null },
      newData: { key: key.data, items },
    });

    return NextResponse.json({ key: key.data, items: parsed.data.items });
  } catch (e) {
    return apiErrorResponse(e);
  }
}
