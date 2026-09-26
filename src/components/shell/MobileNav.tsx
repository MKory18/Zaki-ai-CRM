'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { MoreHorizontal, X } from 'lucide-react';
import type { NavGroup } from '@/lib/route-registry';
import { mobileNav } from '@/lib/mobile-nav';
import { iconFor } from './icons';

/**
 * THE BOTTOM OF A PHONE.
 *
 * The sidebar on a phone was a drawer behind a hamburger: every screen, at
 * any hour, two taps and a scroll away — including the one screen somebody
 * uses four hundred times a day.
 *
 * So the four they actually work in sit across the bottom, where a thumb
 * already is, and "المزيد" opens the rest. Which four depends on the
 * person: an agent gets her queue, a packer gets preparation. Nobody's
 * phone opens on somebody else's job.
 *
 * Two details that are not decoration:
 *
 *   Every target is at least 44px. A tap that misses on a phone held in one
 *   hand, in a warehouse, is a tap somebody makes twice.
 *
 *   The bar sits above the home indicator (`safe-area-inset-bottom`). A tab
 *   underneath it is a tab that closes the app instead of opening a screen.
 */

const TAP = 'min-h-[44px] min-w-[44px]';

export function MobileNav({ groups }: { groups: NavGroup[] }) {
  const pathname = usePathname();
  const [sheet, setSheet] = useState(false);
  const { primary, rest } = mobileNav(groups, pathname);

  // Any navigation closes the sheet. Leaving it open over the screen it
  // just opened is the commonest way a sheet becomes a thing people avoid.
  useEffect(() => setSheet(false), [pathname]);

  // The sheet is a layer over the page: the page behind it must not scroll,
  // or a thumb swiping the list moves the screen underneath instead.
  useEffect(() => {
    if (!sheet) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [sheet]);

  const active = (path: string) => pathname === path || pathname.startsWith(path + '/');

  if (primary.length === 0) return null;

  return (
    <>
      {sheet && (
        <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-label="كل الشاشات">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSheet(false)} aria-hidden="true" />
          <div
            className="absolute inset-x-0 bottom-0 max-h-[75vh] overflow-y-auto rounded-t-lg border-t border-[var(--sys-border)] bg-[var(--sys-card)] pb-[env(safe-area-inset-bottom)]"
            dir="rtl"
          >
            <div className="sticky top-0 flex items-center justify-between border-b border-[var(--sys-border)] bg-[var(--sys-card)] px-4 py-3">
              <span className="text-sm font-semibold text-[var(--sys-heading)]">كل الشاشات</span>
              <button
                type="button"
                onClick={() => setSheet(false)}
                aria-label="إغلاق"
                className={`${TAP} -me-2 flex items-center justify-center rounded-lg text-[var(--sys-muted)]`}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-2">
              {rest.map((group) => (
                <section key={group.key} className="mb-2">
                  <h3 className="px-2 py-1 text-xs font-semibold text-[var(--sys-muted-foreground)]">
                    {group.label}
                  </h3>
                  <ul>
                    {group.routes.map((route) => {
                      const Icon = iconFor(route.icon);
                      return (
                        <li key={route.path}>
                          <Link
                            href={route.path}
                            className={`${TAP} flex items-center gap-3 rounded-lg px-2 text-sm ${
                              active(route.path)
                                ? 'bg-[var(--sys-primary-soft)] text-[var(--sys-primary)]'
                                : 'text-[var(--sys-foreground)]'
                            }`}
                          >
                            <Icon className="h-4 w-4 shrink-0" />
                            {route.label}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </div>
          </div>
        </div>
      )}

      <nav
        className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--sys-border)] bg-[var(--sys-card)] pb-[env(safe-area-inset-bottom)] md:hidden"
        aria-label="التنقل"
      >
        <ul className="flex">
          {primary.map((route) => {
            const Icon = iconFor(route.icon);
            const on = active(route.path);
            return (
              <li key={route.path} className="flex-1">
                <Link
                  href={route.path}
                  aria-current={on ? 'page' : undefined}
                  className={`${TAP} flex flex-col items-center justify-center gap-0.5 px-1 py-1.5 ${
                    on ? 'text-[var(--sys-primary)]' : 'text-[var(--sys-muted-foreground)]'
                  }`}
                >
                  <Icon className="h-5 w-5" />
                  {/* Truncated, never wrapped: a label that wraps makes the
                      bar taller and moves every other tab under the thumb. */}
                  <span className="w-full truncate text-center text-xs leading-tight">{route.label}</span>
                </Link>
              </li>
            );
          })}

          <li className="flex-1">
            <button
              type="button"
              onClick={() => setSheet(true)}
              aria-expanded={sheet}
              className={`${TAP} flex w-full flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-[var(--sys-muted-foreground)]`}
            >
              <MoreHorizontal className="h-5 w-5" />
              <span className="text-xs leading-tight">المزيد</span>
            </button>
          </li>
        </ul>
      </nav>
    </>
  );
}
