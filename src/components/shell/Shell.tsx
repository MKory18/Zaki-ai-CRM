'use client';

import React, { useState } from 'react';
import type { NavGroup } from '@/lib/route-registry';
import { Sidebar } from './Sidebar';
import { Header, type ShellContextInfo } from './Header';
import { MobileNav } from './MobileNav';
import { OfflineWatch } from './OfflineWatch';

/** Frame for every contract screen: fixed RTL sidebar + context header. */
export function Shell({
  groups,
  userName,
  userRole,
  context,
  children,
}: {
  groups: NavGroup[];
  userName: string;
  userRole: string;
  context: ShellContextInfo;
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[var(--sys-surface)] flex flex-col">
      {/* Registers the worker, and says when the line is down — which
          matters because the worker queues NOTHING. */}
      <OfflineWatch />
      <Sidebar groups={groups} mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />
      <div className="flex-1 flex flex-col min-w-0 transition-all duration-200 md:mr-[280px]">
        <Header
          onMenuClick={() => setMobileOpen(true)}
          userName={userName}
          userRole={userRole}
          context={context}
        />
        {/* The bar at the bottom is fixed, so the page needs room under it
            or the last row of every screen sits behind the thumb that is
            trying to read it. */}
        <main className="w-full flex-1 p-4 pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:p-6 md:pb-6">
          {children}
        </main>
      </div>

      <MobileNav groups={groups} />
    </div>
  );
}
