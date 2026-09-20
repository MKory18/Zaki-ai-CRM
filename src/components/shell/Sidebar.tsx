'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';
import { Hammer } from 'lucide-react';
import type { NavGroup } from '@/lib/route-registry';
import { iconFor } from './icons';

/**
 * The ten contract groups, RTL. The server already removed every route this
 * user may not open (visibleNav) — nothing here decides access.
 */
export function Sidebar({
  groups,
  mobileOpen,
  onClose,
}: {
  groups: NavGroup[];
  mobileOpen?: boolean;
  onClose?: () => void;
}) {
  const pathname = usePathname();

  return (
    <>
      {mobileOpen && <div className="fixed inset-0 z-40 bg-black/50 md:hidden" onClick={onClose} />}

      <aside
        className={clsx(
          'fixed top-0 bottom-0 right-0 z-40 flex flex-col w-[280px] bg-[#121926] text-[#697586] transition-transform duration-200 md:translate-x-0',
          mobileOpen ? 'translate-x-0' : 'translate-x-full md:translate-x-0'
        )}
      >
        <div className="flex items-center h-[72px] px-5 border-b border-[#202939] shrink-0">
          <Link href="/" className="flex items-center gap-3" onClick={onClose}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.svg" alt="Zaki AI" className="w-11 h-9 object-contain" />
            <div>
              <span className="font-bold text-white tracking-wide text-base leading-tight block" dir="ltr">
                Zaki <span className="text-[#b8256e]">AI</span> Store
              </span>
              <span className="block text-[10px] text-[#697586] font-semibold uppercase tracking-[0.18em]" dir="ltr">
                Operations
              </span>
            </div>
          </Link>
        </div>

        <nav className="flex-1 overflow-y-auto sidebar-scroll py-3 space-y-0.5">
          {groups.map((group) => (
            <div key={group.key} className="pb-1">
              <p className="px-5 pt-3 pb-2 text-[10px] font-semibold tracking-[0.12em] text-[#5b6474]">
                {group.label}
              </p>
              {group.routes.map((route) => {
                const Icon = iconFor(route.icon);
                const isActive = pathname === route.path || pathname.startsWith(route.path + '/');
                return (
                  <Link
                    key={route.path}
                    href={route.path}
                    onClick={onClose}
                    className={clsx(
                      'flex items-center justify-between mx-3 px-2 py-2.5 rounded-[8px] text-sm font-medium transition-colors group',
                      isActive ? 'bg-[#b8256e] text-white' : 'text-[#697586] hover:text-white hover:bg-[#1a2232]'
                    )}
                  >
                    <span className="flex items-center gap-3">
                      <span
                        className={clsx(
                          'w-8 h-8 rounded-[8px] flex items-center justify-center shrink-0 transition-colors',
                          isActive ? 'bg-white/10 text-white' : 'bg-[#1a2232] text-[#697586] group-hover:text-white'
                        )}
                      >
                        <Icon className="w-[18px] h-[18px]" />
                      </span>
                      <span>{route.label}</span>
                    </span>
                    {route.stage !== null && (
                      <span
                        title={`قيد البناء — المرحلة ${route.stage}`}
                        className="flex items-center gap-1 text-[10px] text-[#5b6474]"
                      >
                        <Hammer className="w-3 h-3" />
                        {route.stage}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
      </aside>
    </>
  );
}
