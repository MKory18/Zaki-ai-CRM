'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  addToCart,
  cartCount,
  cartKey,
  cartToOrderItems,
  parseCart,
  removeFromCart,
  setCartQuantity,
  type CartLine,
} from '@/lib/cart';
import { shopFetch } from '@/lib/storefront-fetch';

/**
 * THE CART, ON THE DEVICE — AND ITS PRICE, FROM THE SERVER.
 *
 * The rules live in `cart.ts`, which is pure and has no idea a browser
 * exists. This is the small amount of browser around them: reading the one
 * key this shop owns, writing it back, and asking the server what the
 * basket costs.
 *
 * NOTHING HERE ADDS UP A PRICE. Not a subtotal, not «×2», not a saving.
 * Every figure comes from `/quote`, which is the same resolver and the
 * same `computeCod` the order will be charged by — so the number in the
 * cart and the number at the door cannot disagree.
 *
 * AND IT SURVIVES A BROWSER THAT SAYS NO. Private windows, blocked site
 * data and a storage quota all throw on read or write, so every access is
 * wrapped: the shop works with an empty cart rather than a blank page.
 */

export interface QuoteLine {
  productId: string;
  name: string;
  image: string | null;
  offerId: string | null;
  offerName: string | null;
  quantity: number;
  freeQuantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface Quote {
  lines: QuoteLine[];
  subtotal: number;
  cod: number;
  currency: string;
  minorUnit?: number;
  pieces: number;
}

function read(key: string): CartLine[] {
  try {
    return parseCart(window.localStorage.getItem(key));
  } catch {
    return [];
  }
}

function write(key: string, lines: CartLine[]): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(lines));
  } catch {
    // A full or blocked store loses the cart, not the shop.
  }
}

export function useCart(slug: string) {
  const key = cartKey(slug);
  // Empty on the first render, always: the server rendered an empty cart
  // and reading storage during render would make the two disagree.
  const [lines, setLines] = useState<CartLine[]>([]);
  const [ready, setReady] = useState(false);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [pricing, setPricing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLines(read(key));
    setReady(true);
  }, [key]);

  const commit = useCallback(
    (next: CartLine[]) => {
      setLines(next);
      write(key, next);
    },
    [key]
  );

  // Re-priced on every change. The server decides; this only asks.
  useEffect(() => {
    if (!ready) return;
    if (lines.length === 0) {
      setQuote(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setPricing(true);
    shopFetch(`/api/public/stores/${slug}/quote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: cartToOrderItems(lines) }),
    })
      .then(async (res) => {
        const body = await res.json();
        if (cancelled) return;
        if (res.ok) {
          setQuote(body as Quote);
          setError(null);
        } else {
          setQuote(null);
          setError(typeof body?.error === 'string' ? body.error : 'تعذّر تسعير السلة');
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setQuote(null);
          setError(e instanceof Error && e.message ? e.message : 'تعذّر الاتصال');
        }
      })
      .finally(() => {
        if (!cancelled) setPricing(false);
      });
    return () => {
      cancelled = true;
    };
  }, [slug, lines, ready]);

  return {
    lines,
    ready,
    quote,
    pricing,
    error,
    /** Pieces, not lines — what the customer is about to receive. */
    count: cartCount(lines),
    add: (line: { productId: string; offerId: string | null; quantity?: number }) =>
      commit(addToCart(lines, line)),
    setQuantity: (where: { productId: string; offerId: string | null }, quantity: number) =>
      commit(setCartQuantity(lines, where, quantity)),
    remove: (where: { productId: string; offerId: string | null }) =>
      commit(removeFromCart(lines, where)),
    clear: () => commit([]),
  };
}
