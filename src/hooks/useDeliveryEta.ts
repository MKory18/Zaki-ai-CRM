'use client';

import { useEffect, useState } from 'react';
import { apiJson } from '@/lib/api-client';

export interface DeliveryEta {
  window: { medianDays: number; slowDays: number; samples: number } | null;
  /** The sentence, in the words a person says. Null when nothing is known. */
  ar: string | null;
  level: 'address' | 'region' | 'country' | null;
  levelAr: string | null;
  /** Why there is no sentence, when there is none. */
  reason: string | null;
}

/**
 * HOW LONG THIS ORDER WILL TAKE, refined as the form is filled.
 *
 * `useRegions` already carries each governorate's window, so the sentence
 * appears the instant a governorate is picked and costs nothing. This asks
 * the finer question — the customer's own street — and only once there is
 * an address to ask about.
 *
 * DEBOUNCED, because the address is typed. Without it every keystroke of
 * «شارع الملك الحسين» is a query over the shop's delivered orders.
 *
 * AND THE LAST ANSWER IS KEPT while a newer one is in flight: a sentence
 * that blinks out and back on every pause reads as a bug, and the stale
 * one it replaces is the same number for the same street.
 */
export function useDeliveryEta(regionId: string | null, address: string | null, delayMs = 500) {
  const [eta, setEta] = useState<DeliveryEta | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // No governorate, no question: the address alone cannot be placed.
    if (!regionId) {
      setEta(null);
      return;
    }
    const text = (address ?? '').trim();
    let cancelled = false;
    const timer = setTimeout(() => {
      setLoading(true);
      const params = new URLSearchParams({ regionId });
      if (text) params.set('address', text);
      apiJson<DeliveryEta>(`/api/orders/eta?${params.toString()}`)
        .then((d) => !cancelled && setEta(d))
        // Silent: an unknown duration is the same as no duration, and an
        // error banner over a form field the seller did not ask about is
        // noise in the middle of taking an order.
        .catch(() => undefined)
        .finally(() => !cancelled && setLoading(false));
    }, text ? delayMs : 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [regionId, address, delayMs]);

  return { eta, loading };
}
