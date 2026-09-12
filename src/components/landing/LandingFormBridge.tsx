'use client';

import React, { useEffect, useRef, useState } from 'react';

/**
 * LANDING FORM BRIDGE — the ONLY channel between the untrusted custom-HTML
 * iframe and the trusted OrderForm React component.
 *
 * Security contract:
 *  - Listens for postMessage from the sandboxed (opaque-origin) iframe.
 *  - 'zaki:offer'  → offerId is validated against THIS page's own DB offers;
 *                    unknown/foreign/tampered ids are silently ignored.
 *  - 'zaki:scroll-form' → scrolls the trusted form into view (no data).
 *  - Any other message type, non-object payloads, or extra fields are ignored.
 *  - The iframe (sandbox without allow-same-origin) cannot read this
 *    component, the form, cookies, tokens, or any API credentials — it can
 *    only ASK; the trusted side decides.
 */

interface BridgeProps {
  /** server-provided offers of THIS landing page (DB) — the allowlist */
  offers: { id: string }[];
  children: React.ReactNode;
}

export function LandingFormBridge({ offers, children }: BridgeProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [externalOfferId, setExternalOfferId] = useState<string | null>(null);

  const offerIdsRef = useRef<Set<string>>(new Set());
  offerIdsRef.current = new Set(offers.map((o) => o.id));

  useEffect(() => {
    function onMessage(ev: MessageEvent) {
      const d = ev.data;
      if (!d || typeof d !== 'object') return;
      if (d.type === 'zaki:scroll-form') {
        wrapRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
      if (d.type === 'zaki:offer' && typeof d.offerId === 'string') {
        // allowlist: only offers of THIS landing page (from DB props)
        if (offerIdsRef.current.has(d.offerId)) {
          setExternalOfferId(d.offerId);
          wrapRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        return;
      }
      // anything else → ignored
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

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
