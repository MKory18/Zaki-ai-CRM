import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireContext, listAccessibleStores } from '@/lib/geo-context';
import { requirePermission } from '@/lib/authorization';
import { apiErrorResponse } from '@/lib/api-error';
import { logAudit } from '@/lib/audit';
import { z } from 'zod';

/**
 * EVERY SHOPFRONT THIS USER CAN SEE, AND HOW EACH IS DOING.
 *
 * Deliberately NOT filtered to the one selected store, which is the only
 * screen in the system that is. Its whole purpose is to answer "which of my
 * shops are live, and are they selling?" — a question you cannot ask from
 * inside one of them. What bounds it instead is ACCESS: the same
 * UserStoreAccess rows the store switcher obeys, so a user who may enter
 * two shops sees two rows here and not the company's five.
 *
 * The numbers count orders whose source is the shopfront, not every order
 * the store took. A shop that sells mostly through landing pages and the
 * phone would otherwise look like its shopfront was working.
 */

/** What `source` a storefront order carries. Set in the public order route. */
const STOREFRONT_SOURCE = 'Store';

export async function GET() {
  try {
    const { user, companyId, countryId } = await requireContext();
    await requirePermission('geo.manage').catch(async () => requirePermission('reports.view'));

    // null means the country itself is not this user's to see, which is
    // the same answer as "no shops here" for a screen that only lists.
    const accessible = (await listAccessibleStores(user, companyId, countryId)) ?? [];
    const ids = accessible.map((s) => s.id);
    if (ids.length === 0) return NextResponse.json({ stores: [] });

    const [stores, productCounts, orderCounts, revenue, pageCounts] = await Promise.all([
      db.store.findMany({
        where: { id: { in: ids }, companyId },
        select: {
          id: true, name: true, slug: true, logo: true, type: true, status: true,
          storefrontEnabled: true, tagline: true, supportPhone: true, domain: true,
          country: { select: { code: true, currencyCode: true } },
        },
        orderBy: { name: 'asc' },
      }),
      db.product.groupBy({
        by: ['storeId'],
        where: { companyId, storeId: { in: ids }, status: 'ACTIVE' },
        _count: { _all: true },
      }),
      db.order.groupBy({
        by: ['storeId'],
        where: { companyId, storeId: { in: ids }, source: STOREFRONT_SOURCE },
        _count: { _all: true },
      }),
      // The same revenue every other screen means: collected where known.
      db.order.groupBy({
        by: ['storeId'],
        where: {
          companyId,
          storeId: { in: ids },
          source: STOREFRONT_SOURCE,
          shippingStatus: { in: ['DELIVERED', 'PARTIALLY_DELIVERED'] },
        },
        _sum: { collectedAmount: true, totalAmount: true },
      }),
      db.landingPage.groupBy({
        by: ['storeId'],
        where: { companyId, storeId: { in: ids }, isPublished: true },
        _count: { _all: true },
      }),
    ]);

    const num = (rows: { storeId: string | null; _count?: { _all: number } }[], id: string) =>
      rows.find((r) => r.storeId === id)?._count?._all ?? 0;

    const list = stores.map((s) => {
      const money = revenue.find((r) => r.storeId === s.id);
      return {
        id: s.id,
        name: s.name,
        slug: s.slug,
        logo: s.logo,
        type: s.type,
        status: s.status,
        live: s.storefrontEnabled,
        tagline: s.tagline,
        supportPhone: s.supportPhone,
        domain: s.domain,
        currency: s.country.currencyCode,
        path: `/s/${s.slug}`,
        products: num(productCounts, s.id),
        landingPages: num(pageCounts, s.id),
        orders: num(orderCounts, s.id),
        revenue: Number(
          (Number(money?._sum.collectedAmount ?? 0) || Number(money?._sum.totalAmount ?? 0)).toFixed(2)
        ),
        // What a seller must still do before this shop can sell anything.
        // Stated rather than left to be discovered by opening it.
        blockers: [
          ...(s.status !== 'ACTIVE' ? ['المتجر نفسه موقوف'] : []),
          ...(num(productCounts, s.id) === 0 ? ['لا منتجات فعّالة'] : []),
          ...(s.type === 'SINGLE_PRODUCT' && num(productCounts, s.id) > 1
            ? ['متجر منتج واحد وفيه أكثر من منتج فعّال']
            : []),
          ...(!s.supportPhone ? ['لا رقم دعم للزبون'] : []),
        ],
      };
    });

    return NextResponse.json({ stores: list });
  } catch (e) {
    return apiErrorResponse(e);
  }
}

/**
 * Turn a shopfront on or off.
 *
 * The one write this screen makes. Everything else about a shop — its
 * theme, its about text, its domain — is edited where it already was, in
 * the store's own settings; a second editor for the same fields is a second
 * place for them to disagree.
 */
export async function PATCH(req: Request) {
  try {
    const { user, companyId, countryId } = await requireContext();
    await requirePermission('geo.manage');

    const parsed = z
      .object({ storeId: z.string().uuid(), live: z.boolean() })
      .safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: 'بيانات غير صالحة' }, { status: 400 });
    }
    const { storeId, live } = parsed.data;

    // Access, not the selected store: this screen spans the shops a user may
    // enter, so the check is the same one the switcher makes.
    const accessible = (await listAccessibleStores(user, companyId, countryId)) ?? [];
    if (!accessible.some((s) => s.id === storeId)) {
      return NextResponse.json({ error: 'المتجر غير موجود' }, { status: 404 });
    }

    if (live) {
      // Going live with nothing to sell gives a visitor an empty shop, which
      // is worse than no shop at all.
      const products = await db.product.count({ where: { companyId, storeId, status: 'ACTIVE' } });
      if (products === 0) {
        return NextResponse.json(
          { error: 'لا يمكن فتح متجر بلا منتجات فعّالة — الزائر سيجد رفوفاً فارغة' },
          { status: 400 }
        );
      }
    }

    const store = await db.store.update({
      where: { id: storeId },
      data: { storefrontEnabled: live },
      select: { id: true, name: true, slug: true },
    });

    await logAudit({
      companyId,
      userId: user.id,
      action: live ? 'STOREFRONT_OPENED' : 'STOREFRONT_CLOSED',
      entity: 'Store',
      entityId: store.id,
      newData: { name: store.name, slug: store.slug, live },
    });

    return NextResponse.json({ success: true, live });
  } catch (e) {
    return apiErrorResponse(e);
  }
}
