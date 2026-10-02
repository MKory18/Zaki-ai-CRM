'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { RiShoppingBag3Line } from './icons';
import { cartCount, cartKey, parseCart } from '@/lib/cart';

/**
 * THE BASKET IN THE HEADER, WITH WHAT IS IN IT.
 *
 * PIECES, NOT LINES. «٣» beside the bag is what the customer is about to
 * receive; counting lines would read «١» for one bundle of three, and a
 * shopper who added three things and sees «١» thinks two were lost.
 *
 * IT RENDERS THE BAG BEFORE IT KNOWS THE COUNT. The server has no idea
 * what is on the device, so the badge appears after the first read —
 * never the bag itself. A header that grows a button once JavaScript
 * lands is a header that moves under a thumb already reaching for it.
 *
 * And the count is read inside a try: a private window or blocked site
 * data costs a badge, never the way into the basket.
 */
export function CartLink({ slug }: { slug: string }) {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    const read = () => {
      try {
        setCount(cartCount(parseCart(window.localStorage.getItem(cartKey(slug)))));
      } catch {
        setCount(null);
      }
    };
    read();
    // Another tab of the same shop is the same basket.
    const onStorage = (e: StorageEvent) => {
      if (e.key === cartKey(slug)) read();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [slug]);

  return (
    <Link href={`/s/${slug}/cart`} className="sf-cart" aria-label="السلة">
      <RiShoppingBag3Line size={20} aria-hidden />
      {count !== null && count > 0 && (
        <span className="sf-cart-count" aria-hidden>
          {count}
        </span>
      )}
      {/* The number said out loud, because the badge is decoration to a
          screen reader and the count is the whole point of it. */}
      <span className="sr-only">{count && count > 0 ? `السلة — ${count} قطعة` : 'السلة فارغة'}</span>
    </Link>
  );
}
