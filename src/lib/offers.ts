import { z } from 'zod';
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
 *   compareAtPrice         — a struck-through "was", for display ONLY
 *   discount               — a real reduction, and the only one computeCod sees
 *   deliveryIncluded       — whether the price already carries the fee
 *
 * The separation between compareAtPrice and discount is deliberate. One is a
 * marketing number and must never touch the money; the other is money. Mixing
 * them would let a display decision change what a customer is charged.
 */

export const offerInputSchema = z.object({
  name: z.string().min(1, 'اسم العرض مطلوب').max(120),
  quantity: z.coerce.number().int().min(1).max(999).default(1),
  freeQuantity: z.coerce.number().int().min(0).max(999).default(0),
  sellingPrice: z.coerce.number().min(0).max(1_000_000),
  compareAtPrice: z.coerce.number().min(0).max(1_000_000).nullable().optional(),
  discount: z.coerce.number().min(0).max(1_000_000).default(0),
  deliveryIncluded: z.coerce.boolean().default(true),
  isDefault: z.coerce.boolean().default(false),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
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
 * The active offers a customer may be shown for this product, in order.
 * Inactive bundles are withheld everywhere, not merely greyed out in the UI:
 * a price that is not for sale must not be reachable by guessing its id.
 */
export async function activeOffersFor(tx: Tx, companyId: string, productId: string) {
  return tx.offer.findMany({
    where: { companyId, productId, status: 'ACTIVE' },
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
    },
  });
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
  compareAtPrice: number | null;
  isDefault: boolean;
}

export function toOfferView(o: {
  id: string;
  name: string;
  quantity: number;
  freeQuantity: number;
  sellingPrice: number;
  compareAtPrice: number | null;
  isDefault: boolean;
}): OfferView {
  return {
    id: o.id,
    name: o.name,
    quantity: o.quantity,
    freeQuantity: o.freeQuantity,
    price: o.sellingPrice,
    // A "was" price that is not above the price is not a saving; it is noise.
    compareAtPrice: o.compareAtPrice !== null && o.compareAtPrice > o.sellingPrice ? o.compareAtPrice : null,
    isDefault: o.isDefault,
  };
}
