'use client';

import React, { useEffect, useRef, useState } from 'react';
import { RiWhatsappLine } from '@/components/storefront/icons';
import { OrderCta } from './OrderCta';
import { ORDER_PLACED } from '@/lib/order-placed-event';

/**
 * THE BAR THAT KEEPS THE ORDER ONE TAP AWAY — at any scroll position.
 *
 * «النموذج على بُعد ضغطة واحدة من أي موضع تمرير · تواصل واتساب». Those are
 * the two things a visitor two screens down a COD page needs and cannot
 * reach: the form, and a person to ask. So the bar carries both — the
 * button that lands them in the first field, and the shop's own WhatsApp
 * when it has a number.
 *
 * WHY THE CONTACT IS HERE AND NOT A SECOND FLOATING BUBBLE. A bubble of its
 * own is a second fixed element on a 360px screen, and the two then argue
 * over the same corner — which is what the shop's home page and this page
 * did when both were open in one session. One bar, two destinations, and
 * they leave the screen together when the form arrives.
 *
 * The price shown is the one the visitor is actually buying: it listens for
 * the form's `ZAKI_OFFER_SELECTED` and resolves that id against ITS OWN
 * server-provided offers — the price never arrives in the message. Without
 * this the button sat there advertising the base price while the form below
 * it had a three-pack selected, and the two numbers on one screen disagreed.
 */

interface Props {
  text: string;
  showPrice: boolean;
  /** DB offers of this page: the only prices this component will display. */
  offers: { id: string; price: number; isDefault?: boolean }[];
  /** Shown when the page sells no offers at all. */
  basePrice: number;
  currency: string;
  /**
   * The shop's WhatsApp, already built into a link by `whatsappHref`, or
   * null. Null draws no contact at all: a button that opens nothing looks
   * to a shopper exactly like a shop that does not answer.
   */
  whatsapp?: string | null;
  /** The block's chosen movement; `none` (or absent) is still. */
  motion?: 'none' | 'bounce' | 'sway';
  /** How fast it moves; `normal` (or absent) is the speed it always had. */
  motionSpeed?: 'slow' | 'normal' | 'fast';
}

export function StickyCta({ text, showPrice, offers, basePrice, currency, whatsapp, motion = 'none', motionSpeed = 'normal' }: Props) {
  // Start on what the form starts on, so the two agree before any click.
  const initial = offers.find((o) => o.isDefault)?.id ?? offers[0]?.id ?? '';
  const [offerId, setOfferId] = useState(initial);
  const [ordered, setOrdered] = useState(false);

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

  // The order is in: «اطلب الآن» would only cover the thank-you screen — its
  // offer, its suggestions, its WhatsApp — and invite a second order.
  useEffect(() => {
    const leave = () => setOrdered(true);
    window.addEventListener(ORDER_PLACED, leave);
    return () => window.removeEventListener(ORDER_PLACED, leave);
  }, []);

  /**
   * Step aside while the order form is on the screen.
   *
   * The button's whole job is to carry somebody down to the form. Once they
   * are at the form it has no job left, and it was sitting across two of the
   * fields on a 375px phone — a button offering to start something the
   * visitor has already started, in the way of them finishing it.
   *
   * An observer rather than a scroll handler: the browser reports the
   * crossing itself, off the main thread, and there is no position maths
   * here to get wrong at one zoom level or one screen height.
   *
   * The whole BAR moves, not the button alone: half a bar sliding out from
   * under a WhatsApp icon that stays is two objects where there is one.
   */
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const form = document.getElementById('zaki-order-form');
    const el = ref.current;
    if (!form || !el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      ([entry]) => {
        // `data-away` rather than unmounting: the element keeps its place in
        // the DOM, so it slides out and back instead of blinking.
        if (entry.isIntersecting) el.setAttribute('data-away', '');
        else el.removeAttribute('data-away');
      },
      // A sliver of the form counts as "here" — waiting for half of it means
      // the button hangs over the first fields on a small screen.
      { threshold: 0.01 }
    );
    io.observe(form);
    return () => io.disconnect();
  }, []);

  const price = offers.find((o) => o.id === offerId)?.price ?? (offers.length ? undefined : basePrice);

  if (ordered) return null;

  return (
    <div className="lp-sticky-bar" ref={ref}>
      {whatsapp && (
        <a
          className="lp-sticky-wa"
          href={whatsapp}
          target="_blank"
          rel="noopener noreferrer"
          /* The icon alone would be an unlabelled button to a screen reader,
             and «واتساب» under it would cost the button beside it its words
             on a 360px screen. */
          aria-label="تواصل معنا على واتساب"
        >
          <RiWhatsappLine size={22} aria-hidden />
        </a>
      )}
      <OrderCta
        className="lp-sticky"
        data-motion={motion === 'none' ? undefined : motion}
        data-speed={motion === 'none' || motionSpeed === 'normal' ? undefined : motionSpeed}
      >
        <span>{text || 'اطلب الآن'}</span>
        {showPrice && price !== undefined && price > 0 && (
          <b dir="ltr">
            {price.toLocaleString('en-US')} {currency}
          </b>
        )}
      </OrderCta>
    </div>
  );
}
