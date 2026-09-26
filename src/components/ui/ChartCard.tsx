'use client';

import React from 'react';
import { EmptyState } from './EmptyState';
import { Skeleton } from './Skeleton';

/**
 * A CHART IS A CARD WITH A TITLE, A WINDOW AND A REASON TO BE THERE.
 *
 * The frame is here and the drawing is the caller's, because the three
 * things that go wrong with a chart are all frame problems:
 *
 *   IT DOES NOT SAY WHAT WINDOW IT COVERS. «الأرباح» over what — today,
 *   this month, all time? A chart without its window is a chart two people
 *   read differently in the same meeting.
 *
 *   IT LOOKS THE SAME WHEN IT HAS NO DATA. An empty plot area reads as a
 *   flat line, which reads as zero, which is a different claim entirely
 *   from "nothing was recorded".
 *
 *   IT JUMPS WHEN IT LOADS. A card that is 40px while it waits and 260px
 *   when it arrives moves everything under it.
 */
export function ChartCard({
  title,
  /** The window this covers, in words. «آخر ٣٠ يوماً» */
  window,
  /** How many records it is drawn from. A chart from four is not a trend. */
  sample,
  loading,
  /** What the frame says instead of drawing nothing at all. */
  empty,
  actions,
  children,
}: {
  title: string;
  window?: string;
  sample?: number;
  loading?: boolean;
  empty?: { title: string; why?: string };
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const nothing = !loading && empty !== undefined;

  return (
    <section className="rounded-lg border border-[var(--sys-border)] bg-[var(--sys-card)] p-4">
      <header className="mb-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-[var(--sys-heading)]">{title}</h3>
          {(window || sample !== undefined) && (
            <p className="mt-0.5 text-xs text-[var(--sys-muted-foreground)]">
              {window}
              {window && sample !== undefined && ' · '}
              {sample !== undefined && (
                <span className="tabular-nums" dir="ltr">
                  {sample}
                </span>
              )}
              {sample !== undefined && ' سجلّ'}
            </p>
          )}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
      </header>

      {/* The height is reserved whichever of the three states it is in, so
          the card cannot move the page under it as it settles. */}
      <div className="min-h-[180px]">
        {loading ? (
          <Skeleton className="h-[180px] w-full rounded-lg" />
        ) : nothing ? (
          <EmptyState title={empty!.title} why={empty!.why} />
        ) : (
          children
        )}
      </div>
    </section>
  );
}
