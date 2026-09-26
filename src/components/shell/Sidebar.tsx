'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';
import type { NavGroup } from '@/lib/route-registry';
import { iconFor } from './icons';
import { RiArrowDownSLine, RiListSettingsLine, RiSideBarLine, RiTreeLine } from '@remixicon/react';
import { RAIL_EVENT, railed as storedRail, setRailed } from '@/lib/sidebar-rail';

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
  /**
   * Folded to a rail of icons. The WIDTH is CSS (see sidebar-rail.ts) so it
   * is right on the first frame; this copy exists only for the things a
   * frame of delay cannot be seen in — a tooltip, a name for a screen
   * reader, which way the chevron points.
   */
  const [rail, setRail] = useState(false);

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
    setRail(storedRail());
  }, []);

  // The palette folds the same menu. Without this the names on the icons
  // come from a copy only the button here ever updated.
  useEffect(() => {
    const heard = () => setRail(storedRail());
    window.addEventListener(RAIL_EVENT, heard);
    return () => window.removeEventListener(RAIL_EVENT, heard);
  }, []);

  function toggleRail() {
    setRailed(!rail);
  }

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
      {mobileOpen && <div className="fixed inset-0 z-40 bg-[var(--sys-background)]/60 md:hidden" onClick={onClose} />}

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
          'fixed top-0 bottom-0 right-0 z-40 flex-col w-[280px] bg-[var(--sys-sidebar)] text-[var(--sys-sidebar-foreground)] md:w-[var(--shell-nav)] md:flex',
          mobileOpen ? 'flex animate-in slide-in-from-right duration-200' : 'hidden'
        )}
      >
        <div className="rail-center flex items-center gap-2 h-[72px] px-5 border-b border-[var(--sys-border)] shrink-0">
          <Link href="/" className="flex min-w-0 items-center gap-3" onClick={onClose}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/mark.png" alt="" aria-hidden className="h-11 w-11 shrink-0 object-contain" />
            <div className="rail-hide min-w-0">
              {/*
                THE WORDMARK SITS ON THE SIDEBAR, NOT ON THE ACCENT.
                It was `--sys-primary-foreground` — the colour of text that
                sits ON the cyan, which in the default theme is #04182B. On
                the sidebar's #0a1a2e that is 1.03:1: the product's own name
                was invisible in the place it is most often read, and it took
                measuring the contrast in a browser to see it, because a
                near-invisible word looks like empty padding.
              */}
              <span className="font-bold text-[var(--sys-sidebar-foreground)] tracking-wide text-base leading-tight block" dir="ltr">
                Zaki <span className="text-[var(--sys-primary)]">AI</span> OMS
              </span>
              <span className="block text-xs text-[var(--sys-muted-foreground)] font-semibold uppercase tracking-wide" lang="en" dir="ltr">
                Intelligent Systems
              </span>
            </div>
          </Link>

          {/* Folding is a desktop affair: below 768px this is a drawer laid
              over the screen, and a narrower drawer buys nothing. */}
          <button
            onClick={toggleRail}
            aria-label={rail ? 'وسّع القائمة' : 'اطوِ القائمة إلى شريط'}
            title={rail ? 'وسّع القائمة' : 'اطوِ القائمة إلى شريط'}
            aria-pressed={rail}
            className="rail-hide hidden md:flex mr-auto h-11 md:h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[var(--sys-sidebar-foreground)] hover:bg-[var(--sys-primary-soft)] hover:text-[var(--sys-heading)]"
          >
            <RiSideBarLine className="icon-mirror w-5 h-5" />
          </button>
        </div>

        {/* Folded, the control that unfolds it must still be reachable — and
            it cannot be the row above, which is now just the mark. */}
        {rail && (
          <button
            onClick={toggleRail}
            aria-label="وسّع القائمة"
            title="وسّع القائمة"
            className="hidden md:flex mx-auto mt-2 h-11 md:h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[var(--sys-sidebar-foreground)] hover:bg-[var(--sys-primary-soft)] hover:text-[var(--sys-heading)]"
          >
            <RiSideBarLine className="icon-mirror w-5 h-5" />
          </button>
        )}

        <nav className="flex-1 overflow-y-auto sidebar-scroll py-3 space-y-0.5">
          {groups.map((group) => {
            // Folded, a collapsed group is a heading that is not drawn at
            // all — so the rail would show nothing. Everything is open.
            const isOpen = rail || pinned || open.has(group.key) || activeGroup === group.key;
            const count = group.routes.length;

            return (
            <div key={group.key} className="pb-1">
              {pinned ? (
                <p className="rail-hide px-5 pt-3 pb-2 text-xs font-semibold tracking-[0.12em] text-[var(--sys-sidebar-foreground)]">
                  {group.label}
                </p>
              ) : (
                <button
                  onClick={() => toggle(group.key)}
                  aria-expanded={isOpen}
                  className="rail-hide w-full flex items-center justify-between gap-2 px-5 pt-3 pb-2 text-xs font-semibold tracking-[0.12em] text-[var(--sys-sidebar-foreground)] hover:text-[var(--sys-heading)] transition-colors"
                >
                  <span className="flex items-center gap-2">
                    {group.label}
                    {!isOpen && <span className="text-[var(--sys-muted)] tabular-nums">{count}</span>}
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
                    // Folded, the label is not drawn, so the name has to
                    // come from somewhere: `title` for the eye, `aria-label`
                    // for anything reading the screen aloud. Both only when
                    // folded — a tooltip repeating a label you can already
                    // read is noise.
                    title={rail ? route.label : undefined}
                    aria-label={rail ? route.label : undefined}
                    className={clsx(
                      'rail-center flex items-center justify-between mx-3 px-2 py-2.5 rounded-lg text-sm font-medium transition-colors group',
                      isActive
                        ? 'bg-[var(--sys-primary)] text-[var(--sys-primary-foreground)]'
                        : 'text-[var(--sys-sidebar-foreground)] hover:text-[var(--sys-heading)] hover:bg-[var(--sys-primary-soft)]'
                    )}
                  >
                    <span className="rail-center flex items-center gap-3">
                      {/* No box behind the glyph. It measured 1.07:1 against
                          the surface it sat on — not a container, a smudge —
                          and the difference it was trying to make is already
                          made twice over: the icon fills when you are on the
                          row, and the row itself is a filled bar. */}
                      <span className="w-8 h-8 flex items-center justify-center shrink-0">
                        <Icon className="w-[18px] h-[18px]" />
                      </span>
                      <span className="rail-hide">{route.label}</span>
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
          className="rail-hide shrink-0 flex items-center gap-2 px-5 py-3 border-t border-[var(--sys-border)] text-xs text-[var(--sys-sidebar-foreground)] hover:text-[var(--sys-heading)] transition-colors"
        >
          {pinned ? <RiListSettingsLine className="w-4 h-4" /> : <RiTreeLine className="w-4 h-4" />}
          {pinned ? 'اطوِ القوائم' : 'اعرض كل القوائم'}
        </button>
      </aside>
    </>
  );
}
