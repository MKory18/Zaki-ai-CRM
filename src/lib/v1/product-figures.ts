import { db } from '../db';
import { productCosts } from '../product-cost';
import { reservedElsewhere } from '../reservation';
import { MAX_WINDOW_DAYS, stockHealth } from '../stock-health';
import { DAY_MS, deliveredPerProduct, ledgerDepthDays } from '../stock-ledger';
import { V1_CODE, V1Fault } from './door';
import { amountString } from './shape';
import type { SystemCaller } from './system-token';

/**
 * THE PRODUCT FIGURES THE MEDIA BUYER ASKS FOR — `?fields=…` on the catalogue.
 *
 * Every figure is one this system already computes for its own screens, read
 * through the same function, and where there is no single source the answer
 * is null and the PR says why. Nothing here is a new formula:
 *
 *   unit_cost_usd  `productCosts(...).average` — the weighted cost of what is
 *                  still on the shelf, the figure the inventory screen
 *                  estimates an unshipped order's cost from. Only when the
 *                  store keeps its books in dollars: there is no exchange
 *                  rate table here, and converting a lira cost at a rate
 *                  somebody typed into this file would be inventing money.
 *   stock_days     `stockHealth(...).coverDays` — «تكفي كم يوم» exactly as
 *                  the inventory screen prints it, from the same facts.
 *   delivery_fee   null. The fee is per COURIER per REGION (`DeliveryFee`),
 *   return_fee     not per product; any one figure would be a choice of
 *                  courier and city nobody made.
 *   cod_fee_pct    null. No courier, store or company here carries a COD
 *                  percentage at all.
 *
 * ── AND THEY ARE BEHIND THEIR OWN SCOPE ──
 *
 * The catalogue was built «بلا تكلفة ولا مخزون رقمي حساس» for the replies
 * system, and that stays true for it: asking for any of these without
 * `products.costs` is refused, not quietly answered.
 */

/** The optional fields the catalogue may be asked for. Anything else in `fields` is ignored. */
export const PRODUCT_FIELDS = [
  'aliases',
  'unit_cost_usd',
  'price_options',
  'stock_days',
  'delivery_fee',
  'return_fee',
  'cod_fee_pct',
] as const;
export type ProductField = (typeof PRODUCT_FIELDS)[number];

/** The ones that say what a thing costs or how long the shelf lasts. */
export const COST_FIELDS: ReadonlySet<ProductField> = new Set<ProductField>([
  'unit_cost_usd',
  'stock_days',
  'delivery_fee',
  'return_fee',
  'cod_fee_pct',
]);

/** `?fields=code,name,aliases` → the optional ones named. `code` and `name` are always sent. */
export function readFields(raw: string | null): Set<ProductField> {
  const out = new Set<ProductField>();
  for (const part of (raw ?? '').split(',')) {
    const f = part.trim();
    if ((PRODUCT_FIELDS as readonly string[]).includes(f)) out.add(f as ProductField);
  }
  return out;
}

/** Refuses a cost field to a key that was not granted `products.costs`. */
export function requireCostScope(caller: SystemCaller, wanted: Set<ProductField>): void {
  const asked = [...wanted].filter((f) => COST_FIELDS.has(f));
  if (asked.length > 0 && !caller.scopes.includes('products.costs')) {
    throw new V1Fault(403, V1_CODE.SCOPE_MISSING, 'The token lacks the scope products.costs', {
      required: 'products.costs',
      fields: asked,
    });
  }
}

export interface FigureProduct {
  id: string;
  storeId: string | null;
  currency: string;
  minorUnit: number;
}

export interface Figures {
  unit_cost_usd?: string | null;
  stock_days?: number | null;
  delivery_fee?: null;
  return_fee?: null;
  cod_fee_pct?: null;
}

/** One decimal, the precision the inventory screen states a cover in. */
const round1 = (n: number) => Math.round(n * 10) / 10;

/** The cost figures for each product, only the ones asked for. */
export async function productFigures(
  companyId: string,
  products: FigureProduct[],
  wanted: Set<ProductField>,
  now: Date = new Date()
): Promise<Map<string, Figures>> {
  const out = new Map<string, Figures>(products.map((p) => [p.id, {}]));
  if (products.length === 0) return out;
  const ids = products.map((p) => p.id);

  if (wanted.has('unit_cost_usd')) {
    const costs = await productCosts(db, companyId, ids);
    for (const p of products) {
      const c = costs.get(p.id);
      // No costed stock is «unknown», not «free».
      out.get(p.id)!.unit_cost_usd =
        p.currency === 'USD' && c && c.batchCount > 0 ? amountString(c.average, p.minorUnit) : null;
    }
  }

  if (wanted.has('stock_days')) {
    const batches = await db.productionBatch.findMany({
      where: { companyId, productId: { in: ids } },
      select: { productId: true, quantityRemaining: true, productionDate: true },
    });
    const since = new Date(now.getTime() - MAX_WINDOW_DAYS * DAY_MS);
    // The delivery record is the STORE's, read once per store.
    const ledger = new Map<string, { days: number; delivered: Awaited<ReturnType<typeof deliveredPerProduct>> }>();
    for (const storeId of new Set(products.map((p) => p.storeId).filter((s): s is string => !!s))) {
      const [days, delivered] = await Promise.all([
        ledgerDepthDays(companyId, storeId, now),
        deliveredPerProduct(companyId, storeId, since),
      ]);
      ledger.set(storeId, { days, delivered });
    }

    for (const p of products) {
      const mine = batches.filter((b) => b.productId === p.id);
      const store = p.storeId ? ledger.get(p.storeId) : undefined;
      const sales = store?.delivered.get(p.id);
      const firstStocked = mine.reduce<Date | null>(
        (oldest, b) => (oldest === null || b.productionDate < oldest ? b.productionDate : oldest),
        null
      );
      const health = stockHealth(
        {
          onHand: mine.reduce((sum, b) => sum + b.quantityRemaining, 0),
          reserved: await reservedElsewhere(db, companyId, p.id, undefined, p.storeId),
          batchCount: mine.length,
          deliveredUnits: sales?.units ?? 0,
          deliveredLines: sales?.lines ?? 0,
          ledgerDays: store?.days ?? 0,
          daysSinceLastSale: sales ? Math.max(0, (now.getTime() - sales.lastAt.getTime()) / DAY_MS) : null,
          daysStocked: firstStocked ? Math.max(0, (now.getTime() - firstStocked.getTime()) / DAY_MS) : null,
        },
        MAX_WINDOW_DAYS
      );
      out.get(p.id)!.stock_days = health.coverDays === null ? null : round1(health.coverDays);
    }
  }

  for (const p of products) {
    const f = out.get(p.id)!;
    if (wanted.has('delivery_fee')) f.delivery_fee = null;
    if (wanted.has('return_fee')) f.return_fee = null;
    if (wanted.has('cod_fee_pct')) f.cod_fee_pct = null;
  }
  return out;
}
