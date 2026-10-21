import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { inStore } from '@/lib/store-filter';
import { requireContext } from '@/lib/geo-context';
import { authorize, getPermissionScope } from '@/lib/authorization';
import { applyQueueFilter } from '@/lib/rbac';
import { ordersWhere } from '@/lib/order-filters';
import { deriveCoreState } from '@/lib/order-state';
import { apiErrorResponse, forbiddenAr } from '@/lib/api-error';

/**
 * GET /api/products/[id]/orders — the latest orders on this product, for the product's OWN page.
 *
 * «أحدث الطلبات على هذا المنتج شغالة؟» — it was not. The page read `product.orders`, a key that `GET /api/products/[id]`
 * has never sent, so the card said «لا طلبات على هذا المنتج بعد» about a product with 305 orders, 124 of them delivered
 * (measured on the local database: LEG-23, «طاقية إنبات الشعر»).
 *
 * WHY NOT `GET /api/orders?productId=`. It answers the question, but it answers it with the whole customer — phone,
 * alternative phone and address, for every row — and every call is counted by `noteCustomersHandedOut` as a person
 * pulling that many customers' contact details. A product page opened six times in a morning would read, to the
 * people who watch for harvesting, like somebody walking off with the customer list. This card prints a name and a city;
 * so this door SELECTS a name and a city, and nothing else of the customer.
 *
 * THE SAME QUESTIONS, ASKED THE SAME WAY:
 *
 *   · who may read orders — `getPermissionScope('orders.view')`, the list's own gate, with the list's own sentence;
 *   · which orders THIS reader may see — `applyQueueFilter(…, null)`, the one place every multi-order read passes
 *     through, so an agent whose «الطلبات» is her own work sees her own orders on a product page too, never the pool;
 *   · which orders are «of this product» — `ordersWhere`'s `productId`, the filter «كل الطلبات على هذا المنتج» (the link
 *     under the card) opens on the orders screen, so the card and the list behind it cannot disagree;
 *   · whether the PRODUCT may be seen — `authorize('products.view', product)`, as on the product's own page: an id outside
 *     this caller's scope is a 404, never a list.
 *
 * The state is derived, as everywhere (`deriveCoreState`); the legacy `status` column is not read.
 */

/** Eight read well on a page that has five other cards; the screen says how many there are in all. (Not exported: a route file may export only its verbs.) */
const RECENT_ORDERS = 8;

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const { user, companyId, storeId, country } = await requireContext();

    if (!getPermissionScope(user, 'orders.view')) {
      // In Arabic in BOTH fields: a new door adds no English refusal (`arabic-refusals.test.ts` only lets that number fall).
      return NextResponse.json(
        { error: 'لا تملك صلاحية عرض الطلبات.', errorAr: 'لا تملك صلاحية عرض الطلبات.' },
        { status: 403 }
      );
    }

    const product = await db.product.findFirst({
      where: { id, ...inStore(companyId, storeId) },
      select: { id: true, companyId: true, categoryId: true },
    });
    const viewAuth = product ? authorize(user, 'products.view', product) : { allowed: false, reason: 'NO_TENANT' as const };
    if (!product || viewAuth.reason === 'NO_TENANT' || viewAuth.reason === 'OUT_OF_SCOPE') {
      return NextResponse.json({ error: 'المنتج غير موجود' }, { status: 404 });
    }
    if (!viewAuth.allowed) {
      const refusal = forbiddenAr('Forbidden: missing required permission products.view');
      return NextResponse.json({ error: refusal, errorAr: refusal }, { status: 403 });
    }

    const built = ordersWhere(new URLSearchParams({ productId: product.id }));
    if (!built.ok) return NextResponse.json({ error: built.error }, { status: 400 });
    const where = applyQueueFilter(user, { ...inStore(companyId, storeId), ...built.where }, null);

    const [total, rows] = await Promise.all([
      db.order.count({ where }),
      db.order.findMany({
        where,
        // The id ends the order so two orders made in the same second never swap places between two reads.
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        take: RECENT_ORDERS,
        select: {
          id: true,
          orderNumber: true,
          createdAt: true,
          totalAmount: true,
          // What `deriveCoreState` reads, and nothing more.
          confirmationStatus: true,
          shippingStatus: true,
          claimedById: true,
          shippedAt: true,
          labelPrintedAt: true,
          customer: { select: { fullName: true, city: true } },
          moderator: { select: { name: true } },
        },
      }),
    ]);

    return NextResponse.json({
      total,
      orders: rows.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        state: deriveCoreState(o),
        totalAmount: o.totalAmount,
        createdAt: o.createdAt,
        customer: { fullName: o.customer?.fullName ?? null, city: o.customer?.city ?? null },
        moderator: o.moderator?.name ?? null,
      })),
      // The store's own currency, sent with the rows — never assumed.
      currency: { code: country.currencyCode, minorUnit: country.minorUnit },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
