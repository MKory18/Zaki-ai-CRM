'use client';

import React from 'react';
import { activePath } from '@/lib/active-route';
import { usePathname } from 'next/navigation';
import { ALL_ROUTES } from '@/lib/route-registry';
import { GuideButton } from './ScreenGuide';

/**
 * THE SCREEN SAYS ITS OWN NAME — AND SAYS THE MENU'S NAME FOR IT.
 *
 * Seventeen screens rendered no heading at all. Their only identity was a
 * word in the sidebar, which is fine for somebody who walked there and
 * useless for everybody else: a link from a notification, a bookmark, a
 * phone where the sidebar is a drawer nobody has opened. A new confirmation
 * agent landed on her own queue — the system sends her straight there — and
 * had nothing on screen telling her where she was.
 *
 * And five screens rendered a heading that CONTRADICTED the menu. The menu
 * said «الأرباح» and the page said «المالية والأرباح الحقيقية»; the menu
 * said «سجل التدقيق» and the page said «سجل العمليات». Two names for one
 * screen is two screens, as far as anybody asking a colleague for help is
 * concerned.
 *
 * So the title is not written on the screen. It is READ from the route
 * registry — the same list the sidebar draws from — which makes the two
 * incapable of disagreeing. Renaming a screen is one edit, in the place
 * that already decides who may open it.
 *
 * `note` is the screen's own sentence about itself, and stays with the
 * screen: what it is FOR is a thing only that screen knows.
 */
export function ScreenTitle({ note, children }: { note?: React.ReactNode; children?: React.ReactNode }) {
  const pathname = usePathname();

  /*
   * The longest matching prefix, so /settings/geo/countries/5 is still the
   * countries screen rather than nothing.
   *
   * This file had the rule right and kept it to itself, while the sidebar
   * and the phone drawer each asked per item and lit two. It is one
   * function now — `src/lib/active-route.ts` — so the heading and the menu
   * cannot disagree about where somebody is.
   */
  const lit = activePath(pathname, ALL_ROUTES.map((r) => r.path));
  const route = ALL_ROUTES.find((r) => r.path === lit);

  // A path outside the registry has no name to borrow, and inventing one
  // here would be a heading nobody could find in the menu.
  if (!route) return null;

  return (
    <header className="mb-3" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <h1 className="text-lg font-bold text-[var(--sys-heading)]">{route.label}</h1>
          {/* Draws nothing unless this screen has a guide. See ScreenGuide.tsx. */}
          <GuideButton />
        </div>
        {children}
      </div>
      {note && <p className="mt-0.5 text-xs leading-relaxed text-[var(--sys-muted-foreground)]">{note}</p>}
    </header>
  );
}
