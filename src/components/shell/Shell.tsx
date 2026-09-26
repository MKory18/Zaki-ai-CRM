'use client';

import React, { useState } from 'react';
import type { NavGroup } from '@/lib/route-registry';
import { Sidebar } from './Sidebar';
import { Header, type ShellContextInfo } from './Header';
import { MobileNav } from './MobileNav';
import { OfflineWatch } from './OfflineWatch';
import { Watermark } from './Watermark';
import { IdleGuard } from './IdleGuard';
import { CommandPalette, useCommandPalette } from './CommandPalette';
import { RAIL_SCRIPT } from '@/lib/sidebar-rail';
import { BulkProvider } from './BulkBar';
import { StoreCurrencyProvider } from '@/context/StoreCurrency';

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
  /** Ctrl/Cmd + K lives here, once, so no screen has to know about it. */
  const palette = useCommandPalette();
  /** The header's own rule, unchanged — see CommandPalette's note. */
  const canSearchRecords = userRole === 'SUPER_ADMIN';

  return (
    <BulkProvider>
    {/* Which currency every figure on every screen is in. The header chip
        has been printing it all along; four money screens had nothing to
        print but a hardcoded «$». */}
    <StoreCurrencyProvider code={context.currencyCode}>
    <div className="min-h-screen bg-[var(--sys-surface)] flex flex-col">
      {/* Before the first paint: was the sidebar left folded? React cannot
          answer that — the server does not know this browser — and answering
          it a frame late means every page load paints a 280px sidebar and
          then snaps it to 76px. See src/lib/sidebar-rail.ts. */}
      <script dangerouslySetInnerHTML={{ __html: RAIL_SCRIPT }} />

      {/* Registers the worker, and says when the line is down — which
          matters because the worker queues NOTHING. */}
      <OfflineWatch />
      <Sidebar groups={groups} mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />
      {/* The margin and the sidebar's width read the SAME variable, so they
          cannot disagree about where the page starts. */}
      <div className="flex-1 flex flex-col min-w-0 transition-all duration-200 md:mr-[var(--shell-nav)]">
        <Header
          onMenuClick={() => setMobileOpen(true)}
          userName={userName}
          userRole={userRole}
          context={context}
          onSearchClick={() => palette.setOpen(true)}
        />
        {/* The bar at the bottom is fixed, so the page needs room under it
            or the last row of every screen sits behind the thumb that is
            trying to read it. */}
        {/* Room for whatever owns the bottom strip: the navigation at its
            fixed height, or a bulk bar at whatever height it wrapped to. */}
        <main className="w-full flex-1 p-4 pb-[calc(var(--bulk-h,4.5rem)+env(safe-area-inset-bottom))] md:p-6 md:pb-6">
          {children}
        </main>
      </div>

      <MobileNav groups={groups} />

      {/* A personal device, and the two things a web page can honestly do
          about that: put a name in any photograph of the screen, and stop
          being signed in on a phone nobody is holding. Neither prevents a
          screenshot — nothing can. See src/lib/exposure.ts. */}
      {/* One box for records, screens and actions. It is the only global
          search now: the header's box searched orders and nothing else,
          beside a menu of fifty screens that could not be searched at all. */}
      <CommandPalette
        groups={groups}
        canSearchRecords={canSearchRecords}
        canSwitchStore={context.canSwitch}
        open={palette.open}
        onClose={() => palette.setOpen(false)}
      />

      <Watermark viewer={viewer} />
      <IdleGuard />
    </div>
    </StoreCurrencyProvider>
    </BulkProvider>
  );
}
