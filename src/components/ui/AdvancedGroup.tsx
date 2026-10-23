'use client';

import { useState } from 'react';
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
 * used one last week knows where it went. The folded controls also stay in
 * the page while closed — a native `<details>` only stops DRAWING its body —
 * so the browser's find-in-page still reaches them, and every test that looks
 * a button up by its name still finds it where it was.
 *
 * CLOSED BY DEFAULT, AND NOT REMEMBERED. A disclosure that restores itself
 * from storage is sometimes open and sometimes not for reasons the person
 * cannot see, and a bug report stops matching the screen. The `open` state
 * below lives in this component and dies with it: nothing is written to
 * localStorage, a cookie or the address bar, and the next visit starts closed.
 *
 * IT SAYS WHETHER IT IS OPEN. `aria-expanded` sits on the summary and follows
 * the `toggle` event the browser fires, so a screen reader hears whether the
 * row is folded on the very row it is on — whether it was opened by a click,
 * by Enter / Space on the keyboard, or by find-in-page unfolding it. The
 * browser stays the owner of `open`; React only listens and reports, so the
 * two can never disagree.
 *
 * No stylesheet, and no utility the product did not already ship: the row is
 * drawn with classes the screens already use, so the built CSS is byte-for-byte
 * what it was and the ceiling holds (CSS_BUDGET_KB in quality-gates.test.ts).
 * That is why the chevron turns with a plain `rotate-180` chosen from React
 * state rather than a `group-open:` variant (used nowhere else, so it would
 * have been new bytes), why the browser's own triangle is hidden by the
 * element default already in system.css («summary::-webkit-details-marker»)
 * rather than by an arbitrary-variant class, and why the inner padding is
 * `p-2.5` — a step on the surface-padding scale that shape-scale.test.ts holds.
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
  const [open, setOpen] = useState(false);
  return (
    <details
      className={`relative ${className}`}
      data-advanced-group=""
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary
        aria-expanded={open}
        className="flex min-h-11 md:min-h-9 cursor-pointer select-none items-center gap-1.5 rounded-lg border border-[var(--sys-border)] bg-[var(--sys-card)] px-3 text-xs font-bold text-[var(--sys-muted-foreground)] hover:border-[var(--sys-primary)] hover:text-[var(--sys-foreground)]"
      >
        <RiArrowDownSLine className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
        <span>{label}</span>
        {holds && <span className="font-normal text-[var(--sys-muted)]">· {holds}</span>}
      </summary>
      <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-[var(--sys-border)] bg-[var(--sys-surface)] p-2.5">
        {children}
      </div>
    </details>
  );
}
