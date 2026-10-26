import { db } from './db';
import { inStore } from './store-filter';

/**
 * WHAT THE STOCK VERDICT IS MEASURED AGAINST — the delivered-order record.
 *
 * Moved here, unchanged, from `api/inventory/route.ts`, because a second
 * door needs the same two facts: `/api/v1/products?fields=stock_days` hands
 * the media buyer the same «تكفي كم يوم» the inventory screen prints, and a
 * copy of these two functions in a second route would be a second answer to
 * one question the day either is edited.
 */

export const DAY_MS = 86_400_000;

/**
 * HOW FAR BACK THIS STORE'S DELIVERY RECORD GOES.
 *
 * The one number the whole reading rests on. A rate is units divided by a
 * window, and a window taken from a wish rather than from the record turns a
 * product selling 7.7 a day into one selling 1.2 a day — measured on this
 * database, where the delivered record is 13.4 days deep and the caller asks
 * for 90.
 *
 * Zero when nothing has ever been delivered, which `stock-health` reads as
 * «no rate may be stated» rather than as a rate of zero.
 */
export async function ledgerDepthDays(companyId: string, storeId: string | null, now: Date): Promise<number> {
  const first = await db.order.findFirst({
    where: { ...inStore(companyId, storeId), shippingStatus: 'DELIVERED', deliveredAt: { not: null } },
    orderBy: { deliveredAt: 'asc' },
    select: { deliveredAt: true },
  });
  if (!first?.deliveredAt) return 0;
  return Math.max(0, (now.getTime() - first.deliveredAt.getTime()) / DAY_MS);
}

/**
 * WHAT ACTUALLY LEFT, PER PRODUCT, AND WHEN.
 *
 * Read from DELIVERED ORDERS, not from the stock ledger, and the difference
 * is not academic. `inventory_movements` of type SALE were backfilled onto
 * this database on 2026-09-21 by `scripts/backfill-delivered-stock.ts`, so
 * every one of the 119 rows carries the backfill's timestamp: the movement
 * ledger reads 8.1 days deep where the orders read 13.4, and «last sold»
 * taken from it would be the day somebody ran a script. The order knows when
 * the customer took the parcel. Nothing else does.
 *
 * SHIPPED IS NOT SOLD. Only DELIVERED counts — a parcel that went out and
 * came back sold nothing, and counting it as velocity buys stock against a
 * sale that did not happen. The 32 RETURNED orders on this database fall out
 * of this filter by themselves.
 *
 * `deliveredQty` first where a partial delivery recorded it, and the ordered
 * quantity plus gift units otherwise. Gift units are real stock off a real
 * shelf; leaving them out understates how fast the shelf empties.
 */
export async function deliveredPerProduct(
  companyId: string,
  storeId: string | null,
  since: Date
): Promise<Map<string, { units: number; lines: number; lastAt: Date }>> {
  const lines = await db.orderItem.findMany({
    where: {
      order: { ...inStore(companyId, storeId), shippingStatus: 'DELIVERED', deliveredAt: { gte: since } },
    },
    select: {
      productId: true,
      quantity: true,
      freeQuantity: true,
      deliveredQty: true,
      order: { select: { deliveredAt: true } },
    },
  });

  const out = new Map<string, { units: number; lines: number; lastAt: Date }>();
  for (const line of lines) {
    const at = line.order.deliveredAt;
    if (!at) continue;
    const units = line.deliveredQty ?? line.quantity + line.freeQuantity;
    // A line that delivered nothing is not an observation of selling.
    if (units <= 0) continue;
    const seen = out.get(line.productId);
    if (!seen) {
      out.set(line.productId, { units, lines: 1, lastAt: at });
      continue;
    }
    seen.units += units;
    seen.lines += 1;
    if (at > seen.lastAt) seen.lastAt = at;
  }
  return out;
}
