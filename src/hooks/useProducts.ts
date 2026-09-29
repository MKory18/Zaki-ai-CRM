'use client';

import { useEffect, useState } from 'react';
import { apiJson } from '@/lib/api-client';
import type { PickableProduct } from '@/components/ui/ProductPicker';

/**
 * THE CATALOGUE, FETCHED IN ONE PLACE AND WHOLE.
 *
 * Seven screens each wrote this fetch by hand, through three different
 * clients, and two of them asked for `?limit=200` — which the route caps at
 * 100 (`src/app/api/products/route.ts`: `Math.min(…, 100)`). So on a
 * catalogue larger than a hundred those two screens quietly could not reach
 * its tail, and a search box over a truncated list is worse than a dropdown
 * over a whole one: it answers «لا يوجد» about a product that exists.
 *
 * Hence NO limit. The route returns the store's catalogue when none is
 * given, and `ProductPicker` narrows it in the browser, where the typing is.
 *
 * IT CARRIES THE CATEGORY THROUGH, and that needed no change to the fetch:
 * the route already selects it (`category: { select: { id: true, name: true } }`)
 * and this hook never dropped it — `PickableProduct` simply did not name it,
 * so every caller was typed as if it were not there. `ProductPicker` groups
 * its list under it while nothing is typed, so a catalogue can be BROWSED
 * and not only searched. Nothing extra is asked of the route, and the
 * no-limit rule above is untouched.
 *
 * `products.view` is held by the moderator, the confirmation agent and the
 * warehouse (see cost-visibility.ts), so every screen that offers a product
 * choice may read this. A refusal is not thrown at the caller: the list
 * stays empty and `loading` ends, so a picker says «لا نتائج» instead of a
 * dialog breaking around it.
 */
export function useProducts() {
  const [products, setProducts] = useState<PickableProduct[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    apiJson<{ products: PickableProduct[] }>('/api/products')
      .then((data) => {
        if (!cancelled) setProducts(data.products ?? []);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { products, loading };
}
