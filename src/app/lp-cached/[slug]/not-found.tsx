import { ShopNotFound } from '@/components/storefront/ShopNotFound';

/** A cached page that is gone (unpublished, deleted) answers like `/lp`: a shop's 404, never the back office's. */
export default function LandingNotFound() {
  return <ShopNotFound />;
}
