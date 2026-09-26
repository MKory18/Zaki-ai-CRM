'use client';

import React from 'react';
import { RiCloseLine, RiFilter3Line } from '@remixicon/react';

/**
 * THE FILTERS, AND THE ONE QUESTION THEY ALWAYS RAISE.
 *
 * «لماذا القائمة فارغة؟» The answer is almost always a filter somebody set
 * an hour ago and forgot, three screens back, in a row of six dropdowns
 * that all look identical whether or not they are doing anything.
 *
 * So two things, and they are the whole component:
 *
 *   IT SAYS HOW MANY ARE ACTIVE. A number, beside the word. Six dropdowns
 *   showing «كل الحالات» and one showing «ملغى» look the same at a glance;
 *   «١ فلتر» does not.
 *
 *   IT CLEARS THEM IN ONE PRESS. Undoing six filters one at a time is why
 *   people reload the page instead — and lose their place doing it.
 *
 * The controls themselves stay the screen's own. A filter bar that decided
 * what could be filtered would be a second definition of every list.
 */
export function FilterBar({
  active,
  onClear,
  children,
  /** Saved views, a search box — whatever belongs at the end of the row. */
  trailing,
}: {
  /** How many filters are doing something right now. The screen knows. */
  active: number;
  onClear: () => void;
  children: React.ReactNode;
  trailing?: React.ReactNode;
}) {
  return (
    <div className="mb-4 rounded-lg border border-[var(--sys-border)] bg-[var(--sys-card)] p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-1.5 text-xs font-medium text-[var(--sys-muted-foreground)]">
          <RiFilter3Line className="h-4 w-4" aria-hidden />
          الفلاتر
          {active > 0 && (
            <span
              className="rounded-sm bg-[var(--sys-primary-soft)] px-1.5 tabular-nums text-[var(--sys-primary)]"
              dir="ltr"
            >
              {active}
            </span>
          )}
        </span>

        {children}

        {active > 0 && (
          <button
            type="button"
            onClick={onClear}
            className="min-h-11 md:min-h-0 inline-flex items-center ms-auto flex items-center gap-1 rounded-md px-2 py-1 text-xs text-[var(--sys-muted-foreground)] hover:text-[var(--sys-destructive)]"
          >
            <RiCloseLine className="h-4 w-4" aria-hidden />
            امسح الفلاتر
          </button>
        )}
        {trailing && <div className={active > 0 ? '' : 'ms-auto'}>{trailing}</div>}
      </div>
    </div>
  );
}
