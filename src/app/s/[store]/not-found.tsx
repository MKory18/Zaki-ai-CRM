import { ShopNotFound } from '@/components/storefront/ShopNotFound';

/**
 * A shopper's 404, inside the shop.
 *
 * Without this file every `notFound()` under `/s/…` fell through to the
 * root one, which wears the dashboard's frame and colours and tells a
 * customer about «شاشات النظام». See the note in ShopNotFound.
 */
export default function StoreNotFound() {
  return <ShopNotFound />;
}
