'use client';

import React, { useState } from 'react';
import type { NavGroup } from '@/lib/route-registry';
import { Sidebar } from './Sidebar';
import { Header, type ShellContextInfo } from './Header';

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
    <div className="min-h-screen bg-[#f8fafc] flex flex-col">
      <Sidebar groups={groups} mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />
      <div className="flex-1 flex flex-col min-w-0 transition-all duration-200 md:mr-[280px]">
        <Header
          onMenuClick={() => setMobileOpen(true)}
          userName={userName}
          userRole={userRole}
          context={context}
        />
        <main className="flex-1 p-4 md:p-6 w-full">{children}</main>
      </div>
    </div>
  );
}
