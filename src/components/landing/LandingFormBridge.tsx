'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useTracking } from '@/components/tracking/GlobalTrackingProvider';

/**
 * LANDING FORM BRIDGE — the ONLY channel between the untrusted custom-HTML
 * iframe and the trusted OrderForm React component.
 *
 * Security contract:
 *  - Listens for postMessage from the sandboxed (opaque-origin) iframe.
 *  - 'ZAKI_ORDER' protocol (Phase 2): {action:'open'|'scroll'|'select-offer'}
 *    + legacy 'zaki:offer' / 'zaki:scroll-form'. Strict shape validation.
 *  - select-offer → offerId is validated against THIS page's own DB offers;
 *                    unknown/foreign/tampered ids are silently ignored.
 *  - Never reads price/totalAmount/companyId/productId from messages —
 *    event payloads for tracking are built ONLY from trusted props (DB).
 *  - The iframe cannot read this component, the form, cookies, tokens or
 *    API credentials — it can only ASK; the trusted side decides.
 *
 * Global Tracking: fires InitiateCheckout ONCE per page session via the
 * central engine (all enabled, scope-matching pixels of the platform set).
 * Payloads use DB product/offer values only. The iframe itself has NO
 * access to fbq/ttq/snaptr.
 */

interface BridgeOffer {
  id: string;
  price: number;
}
interface BridgeProps {
  /** server-provided offers of THIS landing page (DB) — the allowlist */
  offers: BridgeOffer[];
  children: React.ReactNode;
  /** page currency (DB) — message data can never supply it */
  currency?: string;
  /** DB product of THIS landing page (for content_ids) */
  product?: { id: string; name: string } | null;
}

export function LandingFormBridge({ offers, children, currency, product }: BridgeProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [externalOfferId, setExternalOfferId] = useState<string | null>(null);
  const { trackEvent } = useTracking();

  const offerIdsRef = useRef<Set<string>>(new Set());
  offerIdsRef.current = new Set(offers.map((o) => o.id));

  // InitiateCheckout dedup: once per page session (per actual page load);
  // the central engine dedupes per-pixel on top of this.
  const checkoutFiredRef = useRef(false);
  function trackInitiateCheckout(offer?: BridgeOffer) {
    if (checkoutFiredRef.current) return; // never duplicate for re-posts
    checkoutFiredRef.current = true;
    const payload: Record<string, unknown> = {
      content_type: 'product',
      content_ids: product ? [product.id] : [],
    };
    if (offer) {
      // DB offer price only — message can never supply value/currency
      payload.value = offer.price;
      payload.currency = currency || 'USD';
    }
    try {
      trackEvent('InitiateCheckout', payload);
    } catch {
      /* tracking is non-fatal */
    }
  }

  useEffect(() => {
    function onMessage(ev: MessageEvent) {
      const d = ev.data;
      if (!d || typeof d !== 'object') return;

      // ── Phase 2 protocol: {type:'ZAKI_ORDER', action, offerId?} ──
      if (d.type === 'ZAKI_ORDER') {
        if (d.action === 'open' || d.action === 'scroll') {
          trackInitiateCheckout();
          wrapRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          return;
        }
        if (d.action === 'select-offer' && typeof d.offerId === 'string') {
          // allowlist: only offers of THIS landing page (from DB props)
          if (offerIdsRef.current.has(d.offerId)) {
            const dbOffer = offers.find((o) => o.id === d.offerId);
            trackInitiateCheckout(dbOffer);
            setExternalOfferId(d.offerId);
            wrapRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
          return;
        }
        return; // unknown action → ignored
      }

      // ── Legacy messages (kept for older served pages) ──
      if (d.type === 'zaki:scroll-form') {
        trackInitiateCheckout();
        wrapRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
      if (d.type === 'zaki:offer' && typeof d.offerId === 'string') {
        if (offerIdsRef.current.has(d.offerId)) {
          const dbOffer = offers.find((o) => o.id === d.offerId);
          trackInitiateCheckout(dbOffer);
          setExternalOfferId(d.offerId);
          wrapRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        return;
      }
      // anything else → ignored
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offers]);

  return (
    <div ref={wrapRef} id="zaki-order-form">
      {React.Children.map(children, (child) => {
        if (React.isValidElement(child)) {
          return React.cloneElement(child as React.ReactElement<{ externalSelectedOfferId?: string | null }>, {
            externalSelectedOfferId: externalOfferId,
          });
        }
        return child;
      })}
    </div>
  );
}