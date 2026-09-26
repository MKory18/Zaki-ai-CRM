'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';
import type { NavGroup } from '@/lib/route-registry';
import { iconFor } from './icons';
import { RiArrowDownSLine, RiListSettingsLine, RiTreeLine } from '@remixicon/react';

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
      {mobileOpen && <div className="fixed inset-0 z-40 bg-[var(--sys-sidebar)]/50 md:hidden" onClick={onClose} />}

      {/*
        THE SIDEWAYS SCROLL NOBODY COULD FIND.

        This used to stay mounted when closed and slide out past the right
        edge, which is how it slid back in. But a `fixed` box 280px beyond
        the edge still counts towards how wide the document is, and no
        `overflow` on any ancestor can clip it — a fixed element's
        containing block is the viewport itself. So EVERY screen on EVERY
        phone scrolled 280px sideways into an empty grey field. It reads as
        a broken screen rather than as a menu, and it survived both the rule
        against sideways scrolling and the test for it, because both look
        for over-wide columns in a screen's source and this is in no
        screen's source at all.

        Closed it is now `display: none`, which takes up no width anywhere.
        Open it slides in — the entrance is the half anybody sees.
      */}
      <aside
        className={clsx(
          'fixed top-0 bottom-0 right-0 z-40 flex-col w-[280px] bg-[var(--sys-heading)] text-[var(--sys-muted-foreground)] md:flex',
          mobileOpen ? 'flex animate-in slide-in-from-right duration-200' : 'hidden'
        )}
      >
        <div className="flex items-center h-[72px] px-5 border-b border-[var(--sys-heading)] shrink-0">
          <Link href="/" className="flex items-center gap-3" onClick={onClose}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.svg" alt="Zaki AI" className="w-11 h-9 object-contain" />
            <div>
              <span className="font-bold text-[var(--sys-primary-foreground)] tracking-wide text-base leading-tight block" dir="ltr">
                Zaki <span className="text-[var(--sys-primary)]">AI</span> Store
              </span>
              <span className="block text-xs text-[var(--sys-muted-foreground)] font-semibold uppercase tracking-[0.18em]" dir="ltr">
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
                <p className="px-5 pt-3 pb-2 text-xs font-semibold tracking-[0.12em] text-[var(--sys-muted-foreground)]">
                  {group.label}
                </p>
              ) : (
                <button
                  onClick={() => toggle(group.key)}
                  aria-expanded={isOpen}
                  className="w-full flex items-center justify-between gap-2 px-5 pt-3 pb-2 text-xs font-semibold tracking-[0.12em] text-[var(--sys-muted-foreground)] hover:text-[var(--sys-muted)] transition-colors"
                >
                  <span className="flex items-center gap-2">
                    {group.label}
                    {!isOpen && <span className="text-[var(--sys-border-strong)] tabular-nums">{count}</span>}
                  </span>
                  <RiArrowDownSLine
                    className={clsx('w-4 h-4 transition-transform', isOpen ? '' : '-rotate-90')}
                  />
                </button>
              )}
              {isOpen && group.routes.map((route) => {
                const isActive = pathname === route.path || pathname.startsWith(route.path + '/');
                // Line at rest, filled on the one you are on. Four items of
                // the same shape, one of them slightly brighter, is a
                // difference people miss; a filled glyph is not.
                const Icon = iconFor(route.icon, isActive);
                return (
                  <Link
                    key={route.path}
                    href={route.path}
                    onClick={onClose}
                    className={clsx(
                      'flex items-center justify-between mx-3 px-2 py-2.5 rounded-lg text-sm font-medium transition-colors group',
                      isActive ? 'bg-[var(--sys-primary)] text-[var(--sys-primary-foreground)]' : 'text-[var(--sys-muted-foreground)] hover:text-[var(--sys-primary-foreground)] hover:bg-[var(--sys-heading)]'
                    )}
                  >
                    <span className="flex items-center gap-3">
                      <span
                        className={clsx(
                          'w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors',
                          isActive ? 'bg-[var(--sys-card)]/10 text-[var(--sys-primary-foreground)]' : 'bg-[var(--sys-heading)] text-[var(--sys-muted-foreground)] group-hover:text-[var(--sys-primary-foreground)]'
                        )}
                      >
                        <Icon className="w-[18px] h-[18px]" />
                      </span>
                      <span>{route.label}</span>
                    </span>
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
          className="shrink-0 flex items-center gap-2 px-5 py-3 border-t border-[var(--sys-heading)] text-xs text-[var(--sys-muted-foreground)] hover:text-[var(--sys-muted)] transition-colors"
        >
          {pinned ? <RiListSettingsLine className="w-4 h-4" /> : <RiTreeLine className="w-4 h-4" />}
          {pinned ? 'اطوِ القوائم' : 'اعرض كل القوائم'}
        </button>
      </aside>
    </>
  );
}
