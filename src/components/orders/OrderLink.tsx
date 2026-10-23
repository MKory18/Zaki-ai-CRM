'use client';

import Link from 'next/link';
import { useMayOpen } from '@/hooks/useMayOpen';

/**
 * AN ORDER NUMBER THAT OPENS THE ORDER IT NAMES.
 *
 * Seven screens printed the number as plain text — custody, the postponed
 * list, win-back, the issues list, the Telegram inbox — so the person who
 * read «ORD-26-5011» and wanted to see it had to go to the orders screen and
 * search for what the first screen had just said.
 *
 * The address is the canonical one: `/orders/<id>` redirects to
 * `/orders?highlight=<id>` and opens that order's panel over the list (see
 * `an-order-link-opens-the-order-it-names.test.tsx`). Nothing here is a second
 * way to open an order.
 *
 * IT IS A PROMISE, SO IT IS ONLY MADE TO WHOEVER CAN KEEP IT. `useMayOpen` is
 * `canAccessRoute` — the question the sidebar and the page guard ask — so a
 * person who may not open `/orders` sees the number exactly as before, as
 * text, and never a link that ends in «لا تملك صلاحية». The door behind the
 * link still decides on its own; this only decides whether to draw it.
 */
export function OrderLink({
  id,
  number,
  className = '',
}: {
  /** The order's id — NOT its number. */
  id: string;
  /** What is printed: the order number (or the merchant reference, where a screen shows that). */
  number: string;
  className?: string;
}) {
  const mayOpen = useMayOpen();
  if (!mayOpen('/orders')) {
    return (
      <span className={className} dir="ltr">
        {number}
      </span>
    );
  }
  return (
    <Link href={`/orders/${id}`} className={`${className} hover:underline`} dir="ltr">
      {number}
    </Link>
  );
}
