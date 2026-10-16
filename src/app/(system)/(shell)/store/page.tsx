import { forbidden } from 'next/navigation';
import { guardRoute } from '@/lib/page-guard';
import { can } from '@/lib/authorization';
import {
  STORE_TABS, canOpenSection, canOpenTab, findTab, openSections, readSection,
} from '@/lib/store-admin';
import { StoreAdminScreen } from '@/components/store-admin/StoreAdminScreen';

/**
 * ONE ADDRESS FOR THE WHOLE SHOP.
 *
 * `/store` with no `?tab=` is every shop, one card each. `/store?tab=…`
 * is ONE shop — the one the header is editing — with the three tabs of
 * `src/lib/store-admin.ts`. The eight old addresses redirect here
 * permanently (next.config.ts).
 *
 * THE GATE IS HERE, NOT IN THE TAB STRIP.
 *
 * `/store` opens for `geo.manage` too — the person who decides which
 * shops EXIST — and none of the panels is his. Hiding a chip from him
 * would leave the panel one typed address away, so the permission is
 * asked on the server, before anything is rendered, and a panel he may
 * not open is a real 403. The strip is then drawn from the same answer,
 * so he is not shown a door that would slam.
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; sec?: string }>;
}) {
  const { user } = await guardRoute('/store');
  const sp = await searchParams;

  const tab = findTab(sp.tab);
  if (!tab) {
    // No tab asked for (or a tab that does not exist): the list of shops.
    return <StoreAdminScreen tab={null} section={null} allowed={[]} />;
  }
  if (!canOpenTab(user, tab, can)) forbidden();

  const section = readSection(tab, sp.sec);
  if (!canOpenSection(user, section, can)) forbidden();

  /**
   * The strip, as THIS user may see it — computed with the server's own
   * `can`, so a chip exists only where the guard above would let him
   * through.
   */
  const allowed = STORE_TABS.filter((t) => canOpenTab(user, t, can)).map((t) => ({
    tab: t.key,
    sections: openSections(user, t, can).map((s) => s.key),
  }));

  return <StoreAdminScreen tab={tab.key} section={section.key} allowed={allowed} />;
}
