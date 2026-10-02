/**
 * THE CART — WHAT THE SHOPPER CHOSE, AND NOTHING ELSE.
 *
 * It holds identities and counts. It does not hold a price, a name, an
 * image, a total, or one character about the person carrying it.
 *
 * WHY NO PRICES. A cart that carries prices is a price the browser can
 * edit. Everything a customer is charged is computed on the server from the
 * offers table at the moment the order is placed — `computeCod`, one
 * function, for every door — and a total kept beside it would be a second
 * answer that disagrees the first time a shop changes a price while a
 * phone has the page open. The page shows what the server last said; the
 * order is priced when it is placed.
 *
 * WHY NO PERSONAL DATA. This lives in the visitor's own browser and is
 * never sent anywhere except as part of an order they submit. A shop's
 * storefront promises no personal data on the device, and the cheapest way
 * to keep that promise is to have nowhere to put any.
 *
 * WHY IT SURVIVES NONSENSE. `localStorage` is shared with anything else on
 * the origin, it survives a deploy that changed this shape, and a visitor
 * may edit it by hand. So `parseCart` never throws and never returns
 * something the rest of the code has to check again: it drops what it
 * cannot read and keeps what it can.
 */

/** One chosen thing: a product, a bundle of it or none, and how many. */
export interface CartLine {
  productId: string;
  /** The bundle chosen, or null for the product at its base price. */
  offerId: string | null;
  quantity: number;
}

/**
 * Bounds, so a cart cannot become a denial of service against the order
 * screen, the picker, or the person who has to pack it.
 */
export const MAX_CART_LINES = 20;
export const MAX_LINE_QUANTITY = 99;

/**
 * One key per store.
 *
 * A device may hold carts for two shops at once, and merging them would put
 * one seller's products in another's order — which the order path would
 * refuse, after the customer had filled in their address.
 */
export function cartKey(storeSlug: string): string {
  return `zaki.cart.${storeSlug}`;
}

const id = (v: unknown): string | null =>
  typeof v === 'string' && v.length > 0 && v.length <= 64 ? v : null;

const qty = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(MAX_LINE_QUANTITY, Math.trunc(n)));
};

/**
 * A cart out of whatever was in storage. Never throws, never returns junk.
 *
 * Two lines for the same product AND the same bundle are one line with the
 * quantities added: the same thing chosen twice is two of it, and leaving
 * them apart would show a customer «قطعة ×1» twice and charge them for both
 * under one heading.
 */
export function parseCart(raw: unknown): CartLine[] {
  let value = raw;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(value)) return [];

  const out: CartLine[] = [];
  for (const row of value) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const productId = id(r.productId);
    if (!productId) continue;
    const offerId = id(r.offerId);
    const n = qty(r.quantity);
    if (n <= 0) continue;

    const same = out.find((l) => l.productId === productId && l.offerId === offerId);
    if (same) same.quantity = Math.min(MAX_LINE_QUANTITY, same.quantity + n);
    else if (out.length < MAX_CART_LINES) out.push({ productId, offerId, quantity: n });
  }
  return out;
}

/** The cart with one more of this thing in it. Pure — the caller stores it. */
export function addToCart(cart: CartLine[], line: Omit<CartLine, 'quantity'> & { quantity?: number }): CartLine[] {
  return parseCart([...cart, { ...line, quantity: line.quantity ?? 1 }]);
}

/** Set a line's count. Zero removes it — there is no «0 × قطعة» to show. */
export function setCartQuantity(
  cart: CartLine[],
  where: { productId: string; offerId: string | null },
  quantity: number
): CartLine[] {
  return parseCart(
    cart.map((l) =>
      l.productId === where.productId && l.offerId === where.offerId ? { ...l, quantity } : l
    )
  );
}

export function removeFromCart(
  cart: CartLine[],
  where: { productId: string; offerId: string | null }
): CartLine[] {
  return cart.filter((l) => !(l.productId === where.productId && l.offerId === where.offerId));
}

/**
 * The number on the header's basket: PIECES, not lines.
 *
 * «٣» beside a basket holding one bundle of three is the honest number —
 * it is what the customer is about to receive. Counting lines would read
 * «١», and a shopper who added three things and sees «١» thinks two were
 * lost.
 */
export function cartCount(cart: CartLine[]): number {
  return cart.reduce((sum, l) => sum + l.quantity, 0);
}

/** What the order path is handed. The same shape, and still no money. */
export function cartToOrderItems(cart: CartLine[]): { productId: string; offerId?: string; quantity: number }[] {
  return cart.map((l) => ({
    productId: l.productId,
    ...(l.offerId ? { offerId: l.offerId } : {}),
    quantity: l.quantity,
  }));
}
