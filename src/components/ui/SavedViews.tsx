'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { RiBookmarkLine, RiCloseLine } from '@remixicon/react';

/**
 * THE SAME SIX FILTERS, SET AGAIN EVERY MORNING.
 *
 * «المتأخرة أكثر من عشرة أيام، أرامكس، إربد» is not a question somebody
 * asks once. It is the thing they open the screen to see, every day, and
 * setting it costs six controls before any work starts. The ones who do it
 * often enough eventually bookmark a URL, which works until a filter is
 * added and the old link quietly means something else.
 *
 * WHAT IS STORED, AND WHAT IS NOT.
 *
 * A view is a QUERY STRING and a name. No results, no counts, no record
 * ids — nothing about any customer, and nothing that could still be true
 * when the data has moved on. Recalling a view re-asks the question; it
 * never replays an answer.
 *
 * AND IT IS THIS BROWSER'S, NOT THE ACCOUNT'S.
 *
 * `localStorage`, keyed per screen. Saving it on the server would make it a
 * shared object with an owner, permissions and a lifecycle — for a habit.
 * The cost is that it does not follow somebody to another machine, which is
 * the right trade for a convenience and is why nothing here is relied upon:
 * a browser that refuses storage simply shows no views.
 */

const KEY = 'osm.views.';

export interface SavedView {
  name: string;
  /** The query string, without the leading «?». */
  query: string;
}

function read(screen: string): SavedView[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY + screen) ?? '[]');
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((v) => v && typeof v.name === 'string' && typeof v.query === 'string')
      .slice(0, 8);
  } catch {
    return [];
  }
}

function write(screen: string, views: SavedView[]): void {
  try {
    localStorage.setItem(KEY + screen, JSON.stringify(views.slice(0, 8)));
  } catch {
    // The screen works without remembering. It just forgets.
  }
}

export function SavedViews({
  screen,
  current,
  onApply,
}: {
  /** Which list these belong to — «orders», «returns». */
  screen: string;
  /** The query string as it is right now, without «?». */
  current: string;
  onApply: (query: string) => void;
}) {
  const [views, setViews] = useState<SavedView[]>([]);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');

  useEffect(() => setViews(read(screen)), [screen]);

  const save = useCallback(() => {
    const clean = name.trim().slice(0, 40);
    if (!clean) return;
    // Saving over a name replaces it rather than making a second entry with
    // the same label — two «المتأخرة» differing only in a filter is worse
    // than no saved views at all.
    const next = [...views.filter((v) => v.name !== clean), { name: clean, query: current }];
    setViews(next);
    write(screen, next);
    setName('');
    setNaming(false);
  }, [name, views, current, screen]);

  const drop = (target: string) => {
    const next = views.filter((v) => v.name !== target);
    setViews(next);
    write(screen, next);
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {views.map((v) => (
        <span
          key={v.name}
          className="group inline-flex items-center rounded-sm border border-[var(--sys-border)] bg-[var(--sys-surface)] text-xs"
        >
          <button
            type="button"
            onClick={() => onApply(v.query)}
            className="max-w-[10rem] truncate px-2 py-1 text-[var(--sys-foreground)] hover:text-[var(--sys-primary)]"
          >
            {v.name}
          </button>
          <button
            type="button"
            onClick={() => drop(v.name)}
            aria-label={`احذف «${v.name}»`}
            className="px-1 py-1 text-[var(--sys-muted)] hover:text-[var(--sys-destructive)]"
          >
            <RiCloseLine className="h-4 w-4" />
          </button>
        </span>
      ))}

      {naming ? (
        <span className="inline-flex items-center gap-1">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') save();
              if (e.key === 'Escape') setNaming(false);
            }}
            placeholder="سمِّ هذه الفلاتر"
            aria-label="اسم العرض المحفوظ"
            className="h-8 w-40 rounded-md border border-[var(--sys-border)] bg-[var(--sys-card)] px-2 text-xs outline-none focus:border-[var(--sys-primary)]"
          />
          <button type="button" onClick={save} className="px-2 py-1 text-xs font-semibold text-[var(--sys-primary)]">
            احفظ
          </button>
        </span>
      ) : (
        views.length < 8 && (
          <button
            type="button"
            onClick={() => setNaming(true)}
            className="inline-flex items-center gap-1 rounded-sm px-2 py-1 text-xs text-[var(--sys-muted-foreground)] hover:text-[var(--sys-primary)]"
          >
            <RiBookmarkLine className="h-4 w-4" aria-hidden />
            احفظ هذا العرض
          </button>
        )
      )}
    </div>
  );
}
