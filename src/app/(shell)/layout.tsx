import React from 'react';
import { Shell } from '@/components/shell/Shell';
import { requireShellContext } from '@/lib/page-guard';
import { visibleNav } from '@/lib/route-registry';
import { listAccessibleCountries, listAccessibleStores } from '@/lib/geo-context';

/**
 * Every contract screen lives under this layout. It resolves the session and
 * the country + store selection server-side; without a valid selection the
 * user is sent to /entry, never to a half-scoped screen.
 */
export default async function ShellLayout({ children }: { children: React.ReactNode }) {
  const { user, companyId, store } = await requireShellContext();

  const countries = await listAccessibleCountries(user, companyId);
  const stores = countries.length > 0 ? await listAccessibleStores(user, companyId, store.country.id) : [];
  const canSwitch = countries.length > 1 || (stores?.length ?? 0) > 1;

  return (
    <Shell
      groups={visibleNav(user)}
      userName={user.name}
      userRole={user.role}
      context={{
        storeName: store.name,
        storePaused: store.status !== 'ACTIVE',
        countryName: store.country.name,
        currencyCode: store.country.currencyCode,
        canSwitch,
      }}
    >
      {children}
    </Shell>
  );
}
