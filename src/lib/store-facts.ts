import type { Prisma } from '@prisma/client';
import type { db as prisma } from './db';

/**
 * WHAT OTHER CUSTOMERS ACTUALLY DID.
 *
 * Every number on a shop's pages that says something about other people is
 * computed here, from delivered orders, or it is not shown at all. Three
 * rules run through all of them and each one is a decision, not a detail:
 *
 * DELIVERED, NOT PLACED. An order cancelled at the door is not a sale. A
 * «الأكثر مبيعاً» counted from placed orders would rank the product this
 * shop's customers most often change their mind about.
 *
 * A MINIMUM SAMPLE, AND BELOW IT THE SECTION DISAPPEARS. Not a smaller
 * number, not a greyed-out box — nothing. «اشتراه ٢» is not social proof,
 * it is an admission, and a shopper reads it as one. This is the same rule
 * `delivery-time.ts` already applies to a delivery estimate and
 * `price-honesty.ts` to a struck-through price; a shop either knows
 * something about its customers or says nothing about them.
 *
 * AND A HAND-PICKED ROW IS «مختارات». Never «الأكثر مبيعاً» — the second
 * is a claim about what other people bought, and a seller choosing their
 * own favourites has not made that claim true. `catalog-query.ts` holds
 * that rule for the shelf; this file is what lets it ever be otherwise.
 */

type Tx = Prisma.TransactionClient | typeof prisma;

export interface FactScope {
  companyId: string;
  storeId: string;
  /** Older sales stop describing what this shop sells now. */
  lookbackDays?: number;
}

const DEFAULT_LOOKBACK = 180;

/**
 * How many delivered orders a product needs before «الأكثر مبيعاً» is a
 * sentence about customers rather than about three of them.
 *
 * Five, like the delivery window and the former price. They are kept as
 * separate constants rather than one shared number because they answer
 * different questions and will move apart the first time any is tuned.
 */
export const MIN_SALES = 5;

/**
 * How many orders must contain BOTH products before «يُشترى معه عادةً» is
 * a pattern.
 *
 * Higher than MIN_SALES on purpose. A pair is a coincidence far more
 * easily than a single product is popular — two things landing in the same
 * basket three times says nothing, and the section that shows it is asking
 * the customer to add something to their order.
 */
export const MIN_PAIR = 8;

const since = (scope: FactScope) =>
  new Date(Date.now() - (scope.lookbackDays ?? DEFAULT_LOOKBACK) * 86_400_000);

/** Delivered orders of this shop, in the window, as their lines. */
async function deliveredLines(tx: Tx, scope: FactScope) {
  return tx.orderItem.findMany({
    where: {
      companyId: scope.companyId,
      order: {
        companyId: scope.companyId,
        storeId: scope.storeId,
        // The door, not the placing.
        deliveredAt: { not: null, gte: since(scope) },
      },
    },
    select: { orderId: true, productId: true, quantity: true },
  });
}

/**
 * HOW MANY OF EACH THIS SHOP ACTUALLY DELIVERED.
 *
 * The map `catalog-query.ts` asks for before it will order a shelf by
 * «الأكثر مبيعاً». A product below the floor is ABSENT from the map rather
 * than present with a small number: the shelf sorts by what is in it, and
 * a product that has sold twice must not outrank one that has sold none
 * on the strength of two.
 *
 * An empty map is the honest answer for a shop that has not delivered
 * enough of anything — and `catalogPage` reads that as «cannot prove it»
 * and writes «مختارات» over the grid.
 */
export async function bestSellers(tx: Tx, scope: FactScope): Promise<Map<string, number>> {
  const lines = await deliveredLines(tx, scope);

  // Orders, not pieces. Somebody who bought six of one thing in one order
  // is one customer who wanted it — counting the pieces would let a single
  // bulk order crown a product.
  const orders = new Map<string, Set<string>>();
  for (const l of lines) {
    const seen = orders.get(l.productId) ?? new Set<string>();
    seen.add(l.orderId);
    orders.set(l.productId, seen);
  }

  const out = new Map<string, number>();
  for (const [productId, ids] of orders) {
    if (ids.size >= MIN_SALES) out.set(productId, ids.size);
  }
  return out;
}

/**
 * WHAT REALLY ARRIVES IN THE SAME BASKET AS THIS.
 *
 * Counted from orders that carried both and were delivered. Below
 * `MIN_PAIR` a pair is dropped, and a product with no pair above the floor
 * returns an empty list — which the page reads as «draw nothing», not as
 * «draw an empty row».
 */
export async function boughtTogether(
  tx: Tx,
  scope: FactScope,
  productId: string,
  limit = 4
): Promise<{ productId: string; orders: number }[]> {
  const lines = await deliveredLines(tx, scope);

  const byOrder = new Map<string, Set<string>>();
  for (const l of lines) {
    const set = byOrder.get(l.orderId) ?? new Set<string>();
    set.add(l.productId);
    byOrder.set(l.orderId, set);
  }

  const counts = new Map<string, number>();
  for (const products of byOrder.values()) {
    if (!products.has(productId)) continue;
    for (const other of products) {
      if (other === productId) continue;
      counts.set(other, (counts.get(other) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .filter(([, n]) => n >= MIN_PAIR)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([id, orders]) => ({ productId: id, orders }));
}

/**
 * EVERY FACT THIS SHOP CAN CURRENTLY STATE, in one read.
 *
 * A page that wanted both would otherwise scan the same delivered orders
 * twice. `catalogPage` takes `sales` directly; `related` is for a product
 * page.
 */
export async function factsFor(
  tx: Tx,
  scope: FactScope,
  options: { relatedTo?: string } = {}
): Promise<{ sales: Map<string, number>; related: { productId: string; orders: number }[] }> {
  const [sales, related] = await Promise.all([
    bestSellers(tx, scope),
    options.relatedTo ? boughtTogether(tx, scope, options.relatedTo) : Promise.resolve([]),
  ]);
  return { sales, related };
}
