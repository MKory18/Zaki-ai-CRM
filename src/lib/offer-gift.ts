/**
 * HOW MANY GIFT UNITS A LINE CARRIES — ONE GIFT PER BUNDLE, NOT ONE PER PIECE.
 *
 * An offer says «ثلاث قطع + واحدة هدية»: `quantity` 3, `freeQuantity` 1. The gift is a real unit of the same product —
 * reserved from the shelf, taken off it at delivery, costed like any other (the owner, 22/10: «الهدية مش وهمي… لازم
 * ينحسب سعرو على التكلفة وينخصم من الستوك… هي من نفس صنف المنتج قطعة زيادة») — and it is ONE of them for every bundle
 * bought, so a line of one «3 + 1» is four units, and a line of two is eight.
 *
 * The storefront door has always counted it that way (`offer.freeQuantity × bundles`). The manual door read it as
 * `freeQuantity × line.quantity` — per PIECE — and a moderator who typed «3 + 1» wrote 3 + 3. This is the one rule, and
 * `public-order.ts`'s own formula is held equal to it by a test.
 *
 * A bundle is `quantity` units. A line that is not a whole number of bundles (an API caller's 7 units on a «3 + 1»)
 * earns the gifts of the whole bundles in it — two — and the seventh unit is an ordinary one. A line shorter than one
 * bundle earns none: the customer did not buy the offer.
 */
export function giftUnits(
  offer: { quantity: number; freeQuantity: number } | null | undefined,
  lineQuantity: number
): number {
  if (!offer || !(offer.freeQuantity > 0)) return 0;
  // An offer whose bundle size is nonsense (zero, negative, NaN) is a bundle of ONE piece: never a division by zero.
  const bundleSize = offer.quantity >= 1 ? offer.quantity : 1;
  if (!Number.isFinite(lineQuantity) || lineQuantity < 0) return 0;
  return offer.freeQuantity * Math.floor(lineQuantity / bundleSize);
}
