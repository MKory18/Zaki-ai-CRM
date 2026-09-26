import React from 'react';
import { Shell } from '@/components/shell/Shell';
import { ConfirmProvider } from '@/components/ui/Confirm';
import { ToastProvider } from '@/components/ui/Toast';
import { AiDock } from '@/components/ai/AiDock';
import { can } from '@/lib/authorization';
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
      groups={visibleNav(user, can)}
      userName={user.name}
      userRole={user.role}
      viewer={{ name: user.name, id: user.id }}
      context={{
        storeName: store.name,
        storePaused: store.status !== 'ACTIVE',
        countryName: store.country.name,
        currencyCode: store.country.currencyCode,
        canSwitch,
      }}
    >
      {/* One dialog for the whole app: every screen that needs to ask
          before doing something asks in here, not in a browser box. */}
      <ConfirmProvider>
        {/* One place a screen says what just happened — beside the one
            place it asks before doing something. A message that appears at
            the top of a long form, after a button at the bottom, is a
            message nobody sees. */}
        <ToastProvider>
        {children}
        {/*
          The assistant lives HERE and not on a page.

          In the layout it survives moving between screens, so a question
          asked on the orders list is still answered when you are on the
          profit screen — and asking one no longer costs you the screen you
          were working on, which is why most people did not ask.

          Rendered only for a user who may use it. What it can SEE is
          decided on the server regardless: /api/ai/chat resolves the
          company, the store and the permissions itself.
        */}
        {can(user, 'ai.use') && <AiDock />}
        </ToastProvider>
      </ConfirmProvider>
    </Shell>
  );
}
