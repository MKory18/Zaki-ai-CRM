'use client';

import { useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { CREATE_PARAM, isCreateKey, type CreateKey } from '@/lib/create-intent';

/**
 * «+ أنشئ» — THE SCREEN'S HALF: READ THE WORD, OPEN THE FORM IT ALREADY HAS, TAKE THE WORD BACK OUT.
 *
 * The palette goes to `/products?new=product`. A screen that holds that form passes the forms it can open:
 *
 *     useCreateIntent({ product: () => setCreateModalOpen(true) });
 *
 * and this does the rest, once:
 *
 *   • THE SCREEN DECIDES WHAT IT MAY OPEN. The handlers it passes are the ones its own buttons are behind — a screen whose button is
 *     drawn only for `orders.create` passes the handler only for `orders.create` (`canCreate ? open : undefined`). An address typed by
 *     hand for a form the person has no button for opens nothing; the box offers only what the server told it to, and the address is
 *     not a way around that.
 *   • THE VALUE IS UNTRUSTED. It is checked against the closed set (`isCreateKey`) before it is used as a key — a `?new=constructor`
 *     is nothing, not a call to `Object`.
 *   • ONCE. It is taken out of the address (`history.replaceState`, which the router follows) the moment it is read, so a refresh, a
 *     copied link or the back button does not open the form again. The other parameters stay exactly as they were.
 *   • ALSO WHEN THE SCREEN IS ALREADY OPEN. «طلب سريع» chosen while looking at the orders list changes the search, not the screen;
 *     the effect watches the word, not the mount, so it fires then too.
 *
 * It opens a form that exists. It creates nothing, validates nothing and calls no API: what the form does when it is saved is what it
 * did when the button opened it.
 */
export function useCreateIntent(open: Partial<Record<CreateKey, () => void>>): void {
  const asked = useSearchParams();
  const wanted = asked?.get(CREATE_PARAM) ?? null;

  // The handlers are new functions every render; the effect below must not re-run for that, and must call the latest.
  const latest = useRef(open);
  useEffect(() => {
    latest.current = open;
  });

  // The word that has already been acted on — React may run an effect twice on mount (StrictMode), the form must open once.
  const handled = useRef<string | null>(null);

  useEffect(() => {
    if (!wanted) {
      handled.current = null;
      return;
    }
    if (handled.current === wanted || !isCreateKey(wanted)) return;
    handled.current = wanted;

    const url = new URL(window.location.href);
    url.searchParams.delete(CREATE_PARAM);
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);

    latest.current[wanted]?.();
  }, [wanted]);
}
