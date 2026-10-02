import { ShopSkeleton } from '@/components/storefront/ShopSkeleton';

/**
 * The shelf, before it has been fetched.
 *
 * Eight tiles: two rows at 360px, two at 768, two at 1440 — enough to fill
 * the first screen at every width the shop is held to, and not so many
 * that the skeleton is longer than the page it stands in for.
 */
export default function Loading() {
  return <ShopSkeleton tiles={8} />;
}
