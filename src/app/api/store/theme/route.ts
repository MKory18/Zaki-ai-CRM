import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireContext } from '@/lib/geo-context';
import { requirePermission } from '@/lib/authorization';
import { logAudit } from '@/lib/audit';
import { apiErrorResponse } from '@/lib/api-error';
import { zodMessage } from '@/lib/zod-message';
import { cartBarApplies, parseStoreTheme, storeThemeSchema } from '@/lib/store-theme';

/**
 * THE LOOK OF THE STORE THAT IS SELECTED.
 *
 * One store, one theme, one editor. The store id is never taken from the
 * body: it is the store the session is in, the same one every order and
 * every stock movement is filed under — so a request cannot repaint a shop
 * the person is not working in by naming its id.
 *
 * `geo.manage` is about which stores EXIST. Painting one is `storefront.*`,
 * so a designer can lay out the shop without being able to open or close
 * it, and a manager who opens stores is not thereby a designer.
 */

const select = { id: true, name: true, type: true, theme: true, logo: true, favicon: true } as const;

export async function GET() {
  try {
    const { storeId, companyId } = await requireContext();
    await requirePermission('storefront.view');

    const store = await db.store.findFirst({ where: { id: storeId!, companyId }, select });
    if (!store) return NextResponse.json({ error: 'المتجر غير موجود' }, { status: 404 });

    return NextResponse.json({
      store: {
        id: store.id,
        name: store.name,
        type: store.type,
        // The logo and the favicon are the store's IDENTITY, edited in
        // «البلدان والمتاجر». They are returned so the screen can show what
        // is already set and link to it — never so it can offer a second
        // control for the same field.
        logo: store.logo,
        favicon: store.favicon,
        cartBarApplies: cartBarApplies(store.type),
      },
      theme: parseStoreTheme(store.theme),
    });
  } catch (e) {
    return apiErrorResponse(e);
  }
}

export async function PATCH(req: Request) {
  try {
    const { user, storeId, companyId } = await requireContext();
    await requirePermission('storefront.manage');

    const before = await db.store.findFirst({ where: { id: storeId!, companyId }, select });
    if (!before) return NextResponse.json({ error: 'المتجر غير موجود' }, { status: 404 });

    const body = await req.json().catch(() => null);
    const parsed = storeThemeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: zodMessage(parsed.error), errorAr: zodMessage(parsed.error) }, { status: 400 });
    }

    // A Single Product store has no cart, so it has no cart bar to
    // configure. The tab is absent from the screen; this is why hiding it
    // was not the enforcement.
    const theme = { ...parsed.data };
    if (!cartBarApplies(before.type)) delete (theme as { cartBar?: unknown }).cartBar;

    await db.store.update({ where: { id: before.id }, data: { theme: JSON.stringify(theme) } });

    await logAudit({
      companyId,
      userId: user.id,
      action: 'STORE_THEME_UPDATED',
      entity: 'Store',
      entityId: before.id,
      previousData: { theme: before.theme },
      newData: { theme: JSON.stringify(theme) },
    });

    return NextResponse.json({ theme: parseStoreTheme(JSON.stringify(theme)) });
  } catch (e) {
    return apiErrorResponse(e);
  }
}
