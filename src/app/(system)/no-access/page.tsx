import { redirect } from 'next/navigation';
import { requireActiveUser } from '@/lib/page-guard';
import { landingRoute, NO_ACCESS } from '@/lib/route-registry';
import { can } from '@/lib/authorization';
import { NoAccessScreen } from '@/components/shell/AccountScreens';

export const metadata = { title: 'لا توجد شاشة متاحة' };

/**
 * WHERE `landingRoute` SENDS SOMEBODY WHOSE MENU IS EMPTY.
 *
 * It answered with this address for years and nothing lived here. See
 * `NO_ACCESS` in the registry for why nobody noticed.
 *
 * A person who HAS something to open is sent on to it instead of being
 * shown this: «تحديث» after the manager grants a role must take them in,
 * and a page that stayed put would tell somebody with a working menu that
 * they have none. The loop is closed from this side — `landingRoute` only
 * returns this path when there is nothing else to return, so the redirect
 * below can never point back here.
 */
export default async function Page() {
  const { user } = await requireActiveUser();
  const next = landingRoute(user, can);
  if (next !== NO_ACCESS) redirect(next);
  return <NoAccessScreen />;
}
