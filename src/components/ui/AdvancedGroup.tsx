'use client';

import { RiArrowDownSLine } from '@remixicon/react';

/**
 * «متقدم» — THE CONTROLS BESIDE THE MAIN ONE, FOLDED AWAY.
 *
 * Counted on the eight busiest screens before this: the Orders toolbar offered
 * export, import, refresh, AI entry and «طلب سريع» in one row, so the button
 * that makes an order was the same size as the one that downloads a CSV. A row
 * like that does not offer a choice, it hides one.
 *
 * NOTHING IS REMOVED. Every control is still here, one tap away, with a line
 * saying what is inside. «Mark a feature, never delete it» is the house rule,
 * and a folded control is marked: the row counts what is in there, so whoever
 * used one last week knows where it went.
 *
 * CLOSED BY DEFAULT, AND NOT REMEMBERED. A disclosure that restores itself
 * from storage is sometimes open and sometimes not for reasons the person
 * cannot see, and a bug report stops matching the screen.
 *
 * No stylesheet: the row is drawn with the classes the screens already use, so
 * the built CSS is byte-for-byte what it was and the ceiling holds.
 */
export function AdvancedGroup({
  children,
  /** What is inside, in the screen's own words — «تصدير · استيراد». */
  holds,
  label = 'متقدم',
  className = '',
}: {
  children: React.ReactNode;
  holds?: string;
  label?: string;
  className?: string;
}) {
  return (
    <details className={`group relative ${className}`} data-advanced-group="">
      <summary className="flex min-h-11 md:min-h-9 cursor-pointer select-none list-none items-center gap-1.5 rounded-lg border border-[var(--sys-border)] bg-[var(--sys-card)] px-3 text-xs font-bold text-[var(--sys-muted-foreground)] hover:border-[var(--sys-primary)] hover:text-[var(--sys-foreground)] [&::-webkit-details-marker]:hidden">
        <RiArrowDownSLine className="h-4 w-4 transition-transform group-open:rotate-180" />
        <span>{label}</span>
        {holds && <span className="font-normal text-[var(--sys-muted)]">· {holds}</span>}
      </summary>
      <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-[var(--sys-border)] bg-[var(--sys-surface)] p-2">
        {children}
      </div>
    </details>
  );
}
