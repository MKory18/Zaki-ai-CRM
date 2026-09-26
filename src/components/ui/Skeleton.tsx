'use client';

import React from 'react';
import clsx from 'clsx';

/**
 * A LOADING STATE THAT KEEPS THE SHAPE OF WHAT IS COMING.
 *
 * Sixty screens said «جارٍ التحميل…» and a hundred and thirty-six spun a
 * circle. Both are honest and both are the same mistake: the screen is one
 * height while it waits and another when it arrives, so everything jumps —
 * and on a phone, a thumb already moving towards a button presses whatever
 * lands under it instead.
 *
 * A skeleton is not decoration. It is the page reserving the space it is
 * about to need, which is the entire reason to draw one.
 *
 * AND IT DOES NOT PULSE FOR SOMEBODY WHO ASKED FOR STILLNESS.
 *
 * The reduced-motion rule in system.css stops the animation; what remains
 * is a quiet block, which still holds the space. That is the half that
 * matters.
 */
export function Skeleton({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={clsx('block animate-pulse rounded-sm bg-[var(--sys-surface-strong)]', className)}
    />
  );
}

/**
 * The shape a list is about to take.
 *
 * `rows` is how many are expected, not how many will arrive — a list that
 * draws three placeholders and returns thirty still jumps, so callers pass
 * the page size they asked for.
 */
export function SkeletonRows({ rows = 5, className }: { rows?: number; className?: string }) {
  return (
    <div
      className={clsx('space-y-2', className)}
      role="status"
      // Said once, for the whole block, rather than by every grey bar.
      aria-label="جارٍ التحميل"
    >
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 rounded-lg border border-[var(--sys-border)] bg-[var(--sys-card)] p-4"
        >
          <Skeleton className="h-8 w-8 shrink-0 rounded-lg" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-3 w-2/5" />
            <Skeleton className="h-3 w-3/5" />
          </div>
          <Skeleton className="h-3 w-16 shrink-0" />
        </div>
      ))}
    </div>
  );
}

/** The shape of a row of figures above a list. */
export function SkeletonKpis({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" role="status" aria-label="جارٍ التحميل">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="rounded-lg border border-[var(--sys-border)] bg-[var(--sys-card)] p-4">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="mt-3 h-7 w-28" />
        </div>
      ))}
    </div>
  );
}
