import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireCompanyTenant } from '@/lib/auth';
import { requirePermission } from '@/lib/authorization';
import { apiErrorResponse } from '@/lib/api-error';
import { standingStoreId } from '@/lib/geo-context';
import { storeBlockers } from '@/lib/geo-removal';

/**
 *   GET /api/geo/stores/usage  (geo.manage)
 *
 * For every store of the company: why it may NOT be deleted — an empty list
 * means it may. The settings screen reads this to say, beside each store and
 * BEFORE any click, whether the delete button is live and, if not, what is in
 * the way. The DELETE route asks the same question again inside the
 * transaction that deletes (`storeBlockers`), so this answer is advice and
 * that one is the guard.
 *
 * Behind `geo.manage` and not `geo.view`: the reasons are counts of orders,
 * customers and wallets per store, which a person who may only look at the
 * list of stores has no need of — and no button to press.
 */
export async function GET() {
  try {
    const { user, companyId } = await requireCompanyTenant();
    await requirePermission('geo.manage');

    const stores = await db.store.findMany({
      where: { companyId },
      select: { id: true, storefrontEnabled: true, domain: true, landingPageId: true },
    });
    const blockers = await storeBlockers(db, stores, { companyId, selectedStoreId: await standingStoreId(user.id) });

    return NextResponse.json({
      stores: Object.fromEntries(stores.map((s) => [s.id, { blockers: blockers.get(s.id) ?? [] }])),
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
