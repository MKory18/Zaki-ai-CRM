import { PublicNotFound } from '@/components/public/PublicLayout';

/**
 * AN ADDRESS THAT BELONGS TO NOBODY.
 *
 * This is the LAST 404 — the one for a URL that matched no segment at all.
 * A shop has its own (`/s/[store]/not-found.tsx`), a landing page has its
 * own, and the dashboard now has its own (`(system)/not-found.tsx`). What
 * reaches here is a typo, a dead advert or a crawler, and the visitor is
 * as likely to be a shopper as a seller.
 *
 * WHY IT MOVED. It used to render inside `SystemFrame`, which is the
 * dashboard's frame and declares the dashboard's two font families. Next
 * renders the root `not-found` into the tree of EVERY route, so that
 * frame's stylesheet was linked into every storefront page and React
 * preloaded its nine faces: 218 KB fetched at the highest priority a
 * browser has, on pages that never applied a rule of it. Measured in a
 * production build, on the shelf of a shop with twelve products.
 *
 * AND IT IS `PublicNotFound`, NOT A SECOND ONE. The first version of this
 * file was a hand-written neutral page with its own hexes — a duplicate of
 * a component that already existed for exactly this, under exactly this
 * description («A public address with nothing behind it»). The palette
 * guard caught the hexes, which is how the duplicate was noticed at all.
 */
export default function NotFound() {
  return <PublicNotFound />;
}
