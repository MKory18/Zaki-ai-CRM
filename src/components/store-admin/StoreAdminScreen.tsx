'use client';

import React from 'react';
import Link from 'next/link';
import { RiArrowRightSLine } from '@remixicon/react';
import { STORE_TABS, storeTabHref, type StoreTab } from '@/lib/store-admin';
import { StoresScreen } from '@/components/screens/StoresScreen';
import { StoreDesignScreen } from '@/components/screens/StoreDesignScreen';
import { StoreThemeScreen } from '@/components/screens/StoreThemeScreen';
import { StorePagesScreen } from '@/components/screens/StorePagesScreen';
import { StoreMenusScreen } from '@/components/screens/StoreMenusScreen';
import { StoreSearchScreen } from '@/components/screens/StoreSearchScreen';
import { StoreLanguagesScreen } from '@/components/screens/StoreLanguagesScreen';
import { StoreDomainScreen } from '@/components/screens/StoreDomainScreen';
import { StoreRoutesScreen } from '@/components/screens/StoreRoutesScreen';

/**
 * THE SHOP'S ADMINISTRATION, ON ONE SCREEN.
 *
 * Two levels, as D5 asks: all shops, then one shop. Nothing deeper, and no
 * screen of its own for a panel — the nine screens below are the SAME
 * components the eight old addresses rendered, imported and placed. Not one
 * of their bodies was rebuilt to hang them here, because a rebuilt screen
 * is a screen whose bugs come back.
 *
 * WHY THE TAB STRIP IS LINKS AND NOT STATE.
 *
 * The tab lives in the address, so the eight redirects can land on a
 * panel, a seller can bookmark the one he lives in, and the browser's back
 * button walks back through the tabs he opened. State would have made all
 * three impossible. And because the address is where it lives, the server
 * re-runs the permission check on every tab — the strip cannot be the
 * thing that decides.
 *
 * WHAT IS ABOVE THE FOLD AT 390. The «عم تعدّل: <المتجر>» bar (mounted once
 * in the store layout, so it is on every tab), the way back to the list,
 * the three tabs, this tab's chips, and then the panel's own title, its one
 * line and its ONE primary action. Measured at 390×844 and at 360.
 */

/**
 * WHICH SCREEN EACH SECTION IS.
 *
 * Thunks that RENDER, not a map of component references. A map of
 * references works and reads shorter, and it would have hidden all eight
 * of these from `nothing-unused-ships.test.ts`, whose rule is «does any
 * file other than itself write `<Name …>`». That guard is how this
 * codebase notices a screen nothing draws any more; a lookup table is
 * exactly the shape that would make eight live screens look dead to it,
 * and the day one of them really did stop being drawn, nothing would say
 * so.
 */
const PANELS: Record<string, () => React.ReactElement> = {
  'front/home': () => <StoreDesignScreen />,
  'front/look': () => <StoreThemeScreen />,
  'content/pages': () => <StorePagesScreen />,
  'content/menus': () => <StoreMenusScreen />,
  'content/search': () => <StoreSearchScreen />,
  'content/languages': () => <StoreLanguagesScreen />,
  'address/domain': () => <StoreDomainScreen />,
  'address/routes': () => <StoreRoutesScreen />,
};

export interface AllowedTab {
  tab: StoreTab;
  sections: string[];
}

export function StoreAdminScreen({
  tab,
  section,
  allowed,
}: {
  /** `null` = the list of every shop, which is what `/store` opens on. */
  tab: StoreTab | null;
  section: string | null;
  /** The tabs and sections the SERVER says this user may open. */
  allowed: AllowedTab[];
}) {
  if (!tab || !section) {
    return (
      <div className="p-4 sm:p-6">
        <StoresScreen />
      </div>
    );
  }

  const current = STORE_TABS.find((t) => t.key === tab)!;
  const mine = allowed.find((a) => a.tab === tab);
  const sections = current.sections.filter((s) => mine?.sections.includes(s.key));
  const panel = PANELS[`${tab}/${section}`];

  return (
    <div dir="rtl">
      {/*
        THE WAY BACK, ABOVE THE TABS.
        Two levels only works when the first one is one tap away; a seller
        standing in «العنوان» of the wrong shop needs the list, not the
        header's switcher.
      */}
      <nav className="flex items-center gap-1 px-4 pt-3 text-xs text-[var(--sys-muted-foreground)] sm:px-6">
        <Link
          href="/store"
          className="tap-safe inline-flex min-h-11 items-center gap-1 font-semibold text-[var(--sys-primary)] hover:underline md:min-h-0"
        >
          <RiArrowRightSLine className="h-4 w-4 icon-mirror" />
          كل المتاجر
        </Link>
      </nav>

      {/* ── The three tabs ── */}
      <div
        role="tablist"
        aria-label="إدارة المتجر"
        className="flex gap-1 overflow-x-auto border-b border-[var(--sys-border)] px-4 sm:px-6"
      >
        {STORE_TABS.filter((t) => allowed.some((a) => a.tab === t.key)).map((t) => {
          const on = t.key === tab;
          return (
            <Link
              key={t.key}
              href={storeTabHref(t.key)}
              role="tab"
              aria-selected={on}
              className={`-mb-px shrink-0 whitespace-nowrap border-b-2 px-3 py-3 text-sm transition-colors ${
                on
                  ? 'border-[var(--sys-primary)] font-semibold text-[var(--sys-primary)]'
                  : 'border-transparent text-[var(--sys-muted-foreground)] hover:text-[var(--sys-heading)]'
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </div>

      {/*
        ── This tab's panels ──
        Chips and not a second row of tabs: two tab strips one under the
        other is the reading somebody has to do twice to find out which
        level they are on.
      */}
      {sections.length > 1 && (
        <div className="flex flex-wrap gap-1.5 px-4 pt-3 sm:px-6">
          {sections.map((s) => {
            const on = s.key === section;
            return (
              <Link
                key={s.key}
                href={storeTabHref(tab, s.key)}
                aria-current={on ? 'page' : undefined}
                className={`tap-safe inline-flex min-h-11 items-center rounded-full px-3 text-xs font-bold md:min-h-0 md:py-1.5 ${
                  on
                    ? 'bg-[var(--sys-primary)] text-[var(--sys-primary-foreground)]'
                    : 'border border-[var(--sys-border)] text-[var(--sys-muted-foreground)] hover:border-[var(--sys-primary)] hover:text-[var(--sys-primary)]'
                }`}
              >
                {s.label}
              </Link>
            );
          })}
        </div>
      )}

      {/*
        The panel. `min-w-0` because two of them hold a wide table and one
        holds the block builder, and without it they widen the whole page
        sideways at 360.
      */}
      <div className="min-w-0">{panel ? panel() : null}</div>
    </div>
  );
}
