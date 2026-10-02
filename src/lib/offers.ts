import { z } from 'zod';
import { count, money } from './numeric-input';
import { evidencedWasPrices, struckThroughPrice } from './price-honesty';
import type { Prisma } from '@prisma/client';
import type { db } from './db';

/**
 * OFFERS — a product's bundles, and the one place their prices live.
 *
 * A landing page used to carry its own copy of the same three tiers. Two
 * copies of a price is one price too many: raising it in the catalogue left
 * the page selling at the old one, and nothing in the system noticed. So the
 * product owns its offers and every surface reads them from the product.
 *
 * What an offer says:
 *   quantity + freeQuantity — what the customer receives
 *   sellingPrice           — what they pay for the whole bundle
 *   compareAtPrice         — the CEILING on a struck-through "was". Display
 *                            only, and shown only as far as real delivered
 *                            orders support it — see price-honesty.ts
 *   endsAt                 — when this bundle stops being for sale
 *   discount               — a real reduction, and the only one computeCod sees
 *   deliveryIncluded       — whether the price already carries the fee
 *
 * The separation between compareAtPrice and discount is deliberate. One is a
 * marketing number and must never touch the money; the other is money. Mixing
 * them would let a display decision change what a customer is charged.
 */

export const offerInputSchema = z.object({
  name: z.string().min(1, 'اسم العرض مطلوب').max(120),
  quantity: count(999, 1).default(1),
  freeQuantity: count(999).default(0),
  sellingPrice: money(1_000_000),
  compareAtPrice: money(1_000_000).nullable().optional(),
  /**
   * When this bundle stops. Null means it does not.
   *
   * A countdown must be bound to a real ending, and the only way to keep
   * those two honest is to make them ONE FACT: the clock the customer sees
   * and the moment the price stops applying read this same column. A
   * countdown with a timer of its own is a countdown that reaches zero
   * while the offer carries on, which teaches the customer the number is
   * decoration.
   */
  endsAt: z.coerce.date().nullable().optional(),
  discount: money(1_000_000).default(0),
  deliveryIncluded: z.coerce.boolean().default(true),
  isDefault: z.coerce.boolean().default(false),
  sortOrder: count(9999).default(0),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
});

export type OfferInput = z.infer<typeof offerInputSchema>;

type Tx = Prisma.TransactionClient | typeof db;

/**
 * Exactly one default per product.
 *
 * Two defaults is not a cosmetic problem: the landing page preselects one and
 * the quick-order screen preselects the other, so the same customer is quoted
 * two prices depending on which door they came through.
 */
export async function clearOtherDefaults(
  tx: Tx,
  offer: { id: string; productId: string; companyId: string; isDefault: boolean }
) {
  if (!offer.isDefault) return;
  await tx.offer.updateMany({
    where: {
      companyId: offer.companyId,
      productId: offer.productId,
      id: { not: offer.id },
      isDefault: true,
    },
    data: { isDefault: false },
  });
}

/**
 * WHAT «ON SALE RIGHT NOW» MEANS, in one place.
 *
 * Three queries used to spell `status: 'ACTIVE'` themselves — this one and
 * the two in storefront.ts. Adding an ending would have been three edits,
 * and the one that was forgotten would have gone on selling an offer that
 * had finished. A predicate instead, so there is one answer.
 */
export function liveOfferWhere(now: Date) {
  return {
    status: 'ACTIVE',
    OR: [{ endsAt: null }, { endsAt: { gt: now } }],
  };
}

/**
 * The offers a customer may be shown for this product, in order, in the
 * shape every public surface renders.
 *
 * Inactive and finished bundles are withheld everywhere, not merely greyed
 * out in the UI: a price that is not for sale must not be reachable by
 * guessing its id.
 *
 * It returns the VIEW, not the rows. `toOfferView` existed and nothing
 * called it — four surfaces hand-copied the same mapping, each free to get
 * the struck-through rule a little wrong, and one of them was the raw HTML
 * page nobody looks at. The raw `compareAtPrice` now never leaves this
 * file.
 */
export async function activeOffersFor(
  tx: Tx,
  companyId: string,
  productId: string,
  now: Date = new Date()
): Promise<OfferView[]> {
  const rows = await tx.offer.findMany({
    where: { companyId, productId, ...liveOfferWhere(now) },
    orderBy: [{ sortOrder: 'asc' }, { quantity: 'asc' }],
    select: {
      id: true,
      name: true,
      quantity: true,
      freeQuantity: true,
      sellingPrice: true,
      compareAtPrice: true,
      isDefault: true,
      deliveryIncluded: true,
      endsAt: true,
    },
  });

  const evidence = await evidencedWasPrices(tx, rows);
  return rows.map((o) => toOfferView(o, evidence.get(o.id)));
}

/**
 * The shape every public surface renders an offer in.
 *
 * `price` is the bundle's total — never a unit price. Every caller that
 * divides by the quantity does so from this one number, so a per-unit figure
 * shown to a customer can never disagree with what they are charged.
 */
export interface OfferView {
  id: string;
  name: string;
  quantity: number;
  freeQuantity: number;
  price: number;
  /** Already measured against real delivered orders. Null means show nothing. */
  compareAtPrice: number | null;
  isDefault: boolean;
  deliveryIncluded: boolean;
  /** The moment this bundle stops — the countdown's only source. */
  endsAt: Date | null;
}

export function toOfferView(
  o: {
    id: string;
    name: string;
    quantity: number;
    freeQuantity: number;
    sellingPrice: number;
    compareAtPrice: number | null;
    isDefault: boolean;
    deliveryIncluded?: boolean;
    endsAt?: Date | null;
  },
  /**
   * What this bundle was really delivered at before, from
   * `evidencedWasPrices`. Absent means «not proven», which shows nothing —
   * so a caller that forgets to look understates the discount rather than
   * inventing one.
   */
  evidence?: number
): OfferView {
  return {
    id: o.id,
    name: o.name,
    quantity: o.quantity,
    freeQuantity: o.freeQuantity,
    price: o.sellingPrice,
    compareAtPrice: struckThroughPrice({
      price: o.sellingPrice,
      claim: o.compareAtPrice,
      evidence,
    }),
    isDefault: o.isDefault,
    deliveryIncluded: o.deliveryIncluded ?? true,
    endsAt: o.endsAt ?? null,
  };
}
