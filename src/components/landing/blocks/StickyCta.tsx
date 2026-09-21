'use client';

import React, { useEffect, useState } from 'react';
import { OrderCta } from './OrderCta';

/**
 * The floating button, showing the price the visitor is actually buying.
 *
 * It listens for the form's `ZAKI_OFFER_SELECTED` and resolves that id
 * against ITS OWN server-provided offers — the price never arrives in the
 * message. Without this the button sat there advertising the base price
 * while the form below it had a three-pack selected, and the two numbers
 * on one screen disagreed.
 */

interface Props {
  text: string;
  showPrice: boolean;
  /** DB offers of this page: the only prices this component will display. */
  offers: { id: string; price: number; isDefault?: boolean }[];
  /** Shown when the page sells no offers at all. */
  basePrice: number;
  currency: string;
}

export function StickyCta({ text, showPrice, offers, basePrice, currency }: Props) {
  // Start on what the form starts on, so the two agree before any click.
  const initial = offers.find((o) => o.isDefault)?.id ?? offers[0]?.id ?? '';
  const [offerId, setOfferId] = useState(initial);

  useEffect(() => {
    function onMessage(ev: MessageEvent) {
      const d = ev.data;
      if (!d || typeof d !== 'object' || d.type !== 'ZAKI_OFFER_SELECTED') return;
      if (typeof d.offerId !== 'string') return;
      // Allowlist: only an offer of this page, resolved from our own props.
      if (offers.some((o) => o.id === d.offerId)) setOfferId(d.offerId);
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [offers]);

  const price = offers.find((o) => o.id === offerId)?.price ?? (offers.length ? undefined : basePrice);

  return (
    <OrderCta className="lp-sticky">
      <span>{text || 'اطلب الآن'}</span>
      {showPrice && price !== undefined && price > 0 && (
        <b dir="ltr">
          {price.toLocaleString('en-US')} {currency}
        </b>
      )}
    </OrderCta>
  );
}
