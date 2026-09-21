'use client';

import React from 'react';

/**
 * The quantity tiers, as cards.
 *
 * Clicking one does NOT set a price anywhere. It posts the offer id to this
 * same window, where LandingFormBridge validates it against the page's own
 * offers from the database and tells the form to select it. The card is a
 * request; the trusted side decides — the identical rule that governs the
 * sandboxed iframe, kept here so there is only one path a price can take.
 */

interface Offer {
  id: string;
  name: string;
  quantity: number;
  freeQuantity: number;
  price: number;
  /** The struck-through "was" price. Display only — never charged. */
  compareAtPrice?: number | null;
  isDefault?: boolean;
}

export function OfferCards({ offers, currency }: { offers: Offer[]; currency: string }) {
  function choose(id: string) {
    window.postMessage({ type: 'ZAKI_ORDER', action: 'select-offer', offerId: id }, '*');
  }

  // The cheapest per-unit tier is the one worth pointing at.
  const best = offers.reduce<Offer | null>((winner, o) => {
    const units = o.quantity + o.freeQuantity;
    if (units <= 0) return winner;
    if (!winner) return o;
    const wUnits = winner.quantity + winner.freeQuantity;
    return o.price / units < winner.price / wUnits ? o : winner;
  }, null);

  return (
    <div className="lp-offers">
      {offers.map((o) => {
        const units = o.quantity + o.freeQuantity;
        const perUnit = units > 0 ? o.price / units : o.price;
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => choose(o.id)}
            className={`lp-offer${best?.id === o.id ? ' lp-offer-best' : ''}`}
          >
            <span className="lp-offer-name">
              {o.name}
              {best?.id === o.id && <b className="lp-offer-tag">الأوفر</b>}
            </span>
            <span className="lp-offer-qty">
              {o.quantity} قطعة
              {o.freeQuantity > 0 && <em> + {o.freeQuantity} مجاناً</em>}
            </span>
            <span className="lp-offer-price" dir="ltr">
              {o.compareAtPrice && o.compareAtPrice > o.price && (
                <s>{o.compareAtPrice.toLocaleString('en-US')}</s>
              )}
              {o.price.toLocaleString('en-US')} {currency}
            </span>
            {units > 1 && (
              <span className="lp-offer-unit" dir="ltr">
                {perUnit.toFixed(2)} / قطعة
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
