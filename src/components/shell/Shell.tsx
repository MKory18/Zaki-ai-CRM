'use client';

import React, { useState } from 'react';
import type { NavGroup } from '@/lib/route-registry';
import { Sidebar } from './Sidebar';
import { Header, type ShellContextInfo } from './Header';
import { MobileNav } from './MobileNav';
import { OfflineWatch } from './OfflineWatch';
import { Watermark } from './Watermark';
import { IdleGuard } from './IdleGuard';

/** Frame for every contract screen: fixed RTL sidebar + context header. */
export function Shell({
  groups,
  userName,
  userRole,
  viewer,
  context,
  children,
}: {
  groups: NavGroup[];
  userName: string;
  userRole: string;
  /** Whose screen this is — for the mark a photograph of it will carry. */
  viewer: { name: string; id: string };
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

      {/* A personal device, and the two things a web page can honestly do
          about that: put a name in any photograph of the screen, and stop
          being signed in on a phone nobody is holding. Neither prevents a
          screenshot — nothing can. See src/lib/exposure.ts. */}
      <Watermark viewer={viewer} />
      <IdleGuard />
    </div>
  );
}
