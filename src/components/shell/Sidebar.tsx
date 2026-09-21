'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';
import { Hammer, ChevronDown, ListTree, List } from 'lucide-react';
import type { NavGroup } from '@/lib/route-registry';
import { iconFor } from './icons';

const OPEN_GROUPS_KEY = 'osm.sidebar.open';
const PINNED_KEY = 'osm.sidebar.pinned';

/**
 * The ten contract groups, RTL. The server already removed every route this
 * user may not open (visibleNav) — nothing here decides access.
 *
 * The groups collapse. Fifty screens in one scroll means hunting for the one
 * you want; folded, the sidebar shows ten headings and you open the one you
 * are working in. The group holding the current page always opens itself, so
 * you are never looking at a closed list that contains where you are, and
 * what you leave open is remembered on this browser.
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

  /** The group the current page lives in — always open, never collapsible shut. */
  const activeGroup = useMemo(
    () =>
      groups.find((g) =>
        g.routes.some((r) => pathname === r.path || pathname.startsWith(r.path + '/'))
      )?.key ?? null,
    [groups, pathname]
  );

  const [open, setOpen] = useState<Set<string>>(new Set());
  /** Everything showing at once, and staying that way. */
  const [pinned, setPinned] = useState(false);

  // What was left open last time, per browser. A missing or unreadable value
  // is not a failure: the active group opens either way.
  useEffect(() => {
    let stored: string[] = [];
    try {
      stored = JSON.parse(localStorage.getItem(OPEN_GROUPS_KEY) ?? '[]');
    } catch {
      stored = [];
    }
    setOpen(new Set(Array.isArray(stored) ? stored : []));
    try {
      setPinned(localStorage.getItem(PINNED_KEY) === '1');
    } catch {
      setPinned(false);
    }
  }, []);

  function togglePinned() {
    setPinned((was) => {
      const next = !was;
      try {
        localStorage.setItem(PINNED_KEY, next ? '1' : '0');
      } catch {
        // Navigation still works without the browser remembering.
      }
      // Folding has to actually fold. Every group opened by hand stayed
      // open underneath the pin, so pressing «اطوِ القوائم» left the list
      // exactly as it was and read as a dead button. The active group is
      // kept: collapsing must never hide where you are standing.
      if (!next) {
        setOpen(new Set());
        try {
          localStorage.setItem(OPEN_GROUPS_KEY, '[]');
        } catch {
          /* remembering is a convenience, not a requirement */
        }
      }
      return next;
    });
  }

  function toggle(key: string) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      try {
        localStorage.setItem(OPEN_GROUPS_KEY, JSON.stringify([...next]));
      } catch {
        // A browser that refuses storage still gets working navigation.
      }
      return next;
    });
  }

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
          {groups.map((group) => {
            const isOpen = pinned || open.has(group.key) || activeGroup === group.key;
            const count = group.routes.length;

            return (
            <div key={group.key} className="pb-1">
              {pinned ? (
                <p className="px-5 pt-3 pb-2 text-[10px] font-semibold tracking-[0.12em] text-[#5b6474]">
                  {group.label}
                </p>
              ) : (
                <button
                  onClick={() => toggle(group.key)}
                  aria-expanded={isOpen}
                  className="w-full flex items-center justify-between gap-2 px-5 pt-3 pb-2 text-[10px] font-semibold tracking-[0.12em] text-[#5b6474] hover:text-[#9aa4b2] transition-colors"
                >
                  <span className="flex items-center gap-2">
                    {group.label}
                    {!isOpen && <span className="text-[#3f4757] tabular-nums">{count}</span>}
                  </span>
                  <ChevronDown
                    className={clsx('w-3.5 h-3.5 transition-transform', isOpen ? '' : '-rotate-90')}
                  />
                </button>
              )}
              {isOpen && group.routes.map((route) => {
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
            );
          })}
        </nav>

        {/* Show everything at once, or fold it back. Fifty screens in one
            scroll is a hunt; ten headings is a menu. Whichever you prefer is
            remembered on this browser. */}
        <button
          onClick={togglePinned}
          className="shrink-0 flex items-center gap-2 px-5 py-3 border-t border-[#202939] text-[11px] text-[#5b6474] hover:text-[#9aa4b2] transition-colors"
        >
          {pinned ? <List className="w-3.5 h-3.5" /> : <ListTree className="w-3.5 h-3.5" />}
          {pinned ? 'اطوِ القوائم' : 'اعرض كل القوائم'}
        </button>
      </aside>
    </>
  );
}
