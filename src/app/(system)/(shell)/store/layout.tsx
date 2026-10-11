import { EditingStoreBar } from '@/components/shell/EditingStoreBar';

/**
 * EVERY STOREFRONT SCREEN SAYS WHICH STORE IT EDITS.
 *
 * Eight screens used to edit the store the header cookie happened to
 * hold without naming it. The bar above names it and carries the
 * switcher — mounted here once, so all /store/* screens share it and no
 * screen carries its own copy.
 */
export default function StoreLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <EditingStoreBar />
      {children}
    </>
  );
}
