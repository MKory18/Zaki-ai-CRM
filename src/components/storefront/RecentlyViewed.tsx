'use client';

import { useEffect, useState } from 'react';
import { ProductCard } from './ProductCard';
import type { CardVariant } from '@/lib/store-theme';
import { noteViewed, parseRecent, recentKey, recentToShow } from '@/lib/recently-viewed';
import { shopFetch } from '@/lib/storefront-fetch';

/**
 * «شوهد مؤخراً» — the row, and the thing that remembers.
 *
 * ONE COMPONENT DOES BOTH on purpose: the page that shows the row is the
 * page that should be added to it, and splitting them would be two places
 * that have to agree about one key.
 *
 * NOTHING LEAVES THE DEVICE EXCEPT IDS, and they go only as far as asking
 * what those products are. No page view is reported, nothing is stored
 * against a person, and the server learns a list of product ids it
 * already serves to everybody.
 *
 * IT RENDERS NOTHING UNTIL IT HAS SOMETHING. A heading over an empty row
 * is a shop telling a first-time visitor that it remembers them and has
 * nothing to show for it.
 */

interface Card {
  id: string;
  handle: string;
  sku: string;
  name: string;
  image: string | null;
  fromPrice: number;
}

export function RecentlyViewed({
  slug,
  minorUnit,
  currentProductId,
  variant = 'portrait',
}: {
  slug: string;
  minorUnit: number;
  /** Added to the memory, and never drawn in its own row. */
  currentProductId?: string;
  /** The shop's card variant, so this row is not the one that looks odd. */
  variant?: CardVariant;
}) {
  const [cards, setCards] = useState<Card[]>([]);
  const [currency, setCurrency] = useState<string | null>(null);

  useEffect(() => {
    const key = recentKey(slug);
    let stored: string[] = [];
    try {
      stored = parseRecent(window.localStorage.getItem(key));
    } catch {
      // A private window or blocked site data costs a row, not the page.
    }

    // What to draw is decided BEFORE this page joins the memory, so the
    // product somebody is standing on never appears in its own row.
    const show = recentToShow(stored, currentProductId);

    if (currentProductId) {
      try {
        window.localStorage.setItem(key, JSON.stringify(noteViewed(stored, currentProductId)));
      } catch {
        /* nothing to do, and nothing worth telling the shopper */
      }
    }

    if (show.length === 0) return;
    let cancelled = false;
    shopFetch(`/api/public/stores/${slug}/cards`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: show }),
    })
      .then(async (res) => {
        if (!res.ok) return;
        const body = await res.json();
        if (cancelled) return;
        setCards(Array.isArray(body?.products) ? body.products : []);
        setCurrency(typeof body?.currency === 'string' ? body.currency : null);
      })
      .catch(() => {
        // A row of thumbnails is not worth an error message.
      });
    return () => {
      cancelled = true;
    };
  }, [slug, currentProductId]);

  if (cards.length === 0) return null;

  return (
    <section className="sf-row" aria-labelledby="sf-recent">
      <h2 id="sf-recent">شوهد مؤخراً</h2>
      <div className="sf-grid">
        {cards.map((p) => (
          <ProductCard
            key={p.id}
            slug={slug}
            product={p}
            currency={currency}
            minorUnit={minorUnit}
            variant={variant}
          />
        ))}
      </div>
    </section>
  );
}
