import { ShopNotFound } from '@/components/storefront/ShopNotFound';

/**
 * The same for a landing page that is gone: a visitor who followed an old
 * advert is a customer, not a member of staff, and the root 404 would show
 * them the back office.
 */
export default function LandingNotFound() {
  return <ShopNotFound />;
}
