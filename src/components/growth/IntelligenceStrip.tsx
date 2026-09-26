'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiJson } from '@/lib/api-client';
import { RiAlertLine, RiArrowRightLine, RiInboxUnarchiveLine, RiPulseLine, RiUserStarLine } from '@remixicon/react';

/**
 * WHAT NEEDS A PERSON, ON THE SCREEN THEY ALREADY HAVE OPEN.
 *
 * The analysis behind this has existed for a while at /growth/intelligence
 * and almost nobody opened it, for the ordinary reason: it was three menu
 * levels away under «النمو», and nothing anywhere said there was something
 * in it. A finding nobody reads is not an analysis, it is a log.
 *
 * So the COUNTS come to the dashboard and the detail stays one tap away.
 * That split matters: four numbers can be read without deciding to read
 * them, which is the only way a warning reaches somebody who was not
 * looking for it. The full reasoning — the evidence and the action — needs
 * attention, and asking for attention is what the tap is.
 *
 * It renders nothing at all while loading and nothing if everything is
 * quiet. A row of four zeroes every morning teaches people to skip the
 * row, and then it is not there on the morning it is not zero.
 */

type FamilyKey = 'queue' | 'risk' | 'leak' | 'team';

interface Payload {
  byFamily?: Record<string, { total: number; alarm: number }>;
}

const CELLS: { key: FamilyKey; label: string; icon: typeof RiAlertLine }[] = [
  { key: 'queue', label: 'طوابير', icon: RiInboxUnarchiveLine },
  { key: 'risk', label: 'خطر', icon: RiAlertLine },
  { key: 'leak', label: 'استنزاف', icon: RiPulseLine },
  { key: 'team', label: 'أداء', icon: RiUserStarLine },
];

export function IntelligenceStrip() {
  const [data, setData] = useState<Payload | null>(null);

  useEffect(() => {
    let alive = true;
    apiJson<Payload>('/api/growth/intelligence')
      .then((d) => alive && setData(d))
      // Silence on failure is right here: this is a secondary reading on
      // somebody else's screen, and an error box for it would push the
      // dashboard's own numbers down the page.
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const families = data?.byFamily;
  if (!families) return null;

  const live = CELLS.filter((c) => (families[c.key]?.total ?? 0) > 0);
  if (live.length === 0) return null;

  const alarms = CELLS.reduce((n, c) => n + (families[c.key]?.alarm ?? 0), 0);

  return (
    <section
      aria-label="ما يحتاج تدخّلاً"
      className="rounded-lg border border-[var(--sys-border)] bg-[var(--sys-card)] p-4"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-sm font-bold text-[var(--sys-heading)]">
          <RiPulseLine className="h-4 w-4 text-[var(--sys-primary)]" aria-hidden />
          ما يحتاج تدخّلاً
          {alarms > 0 && (
            <span className="rounded-full border border-[var(--sys-destructive-border)] bg-[var(--sys-destructive-soft)] px-2 py-0.5 text-xs font-semibold text-[var(--sys-destructive)] tabular-nums">
              {alarms}
            </span>
          )}
        </h2>
        <Link
          href="/growth/intelligence"
          className="tap-safe inline-flex items-center gap-1 text-xs font-medium text-[var(--sys-primary)] hover:underline"
        >
          التفاصيل والإجراء
          <RiArrowRightLine className="icon-mirror h-4 w-4" aria-hidden />
        </Link>
      </div>

      {/* Only the families that HAVE something. An empty cell is a cell
          people learn to ignore. */}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {live.map((c) => {
          const f = families[c.key]!;
          const loud = f.alarm > 0;
          return (
            <Link
              key={c.key}
              href={`/growth/intelligence?tab=${c.key}`}
              className={`flex min-h-11 items-center gap-2 rounded-lg border p-3 transition-colors ${
                loud
                  ? 'border-[var(--sys-destructive-border)] bg-[var(--sys-destructive-soft)] hover:bg-[var(--sys-destructive-soft)]/70'
                  : 'border-[var(--sys-border)] bg-[var(--sys-surface)] hover:bg-[var(--sys-surface-strong)]'
              }`}
            >
              <c.icon
                className={`h-5 w-5 shrink-0 ${loud ? 'text-[var(--sys-destructive)]' : 'text-[var(--sys-muted-foreground)]'}`}
                aria-hidden
              />
              <span className="min-w-0">
                <span
                  className={`block text-lg font-bold leading-none tabular-nums ${
                    loud ? 'text-[var(--sys-destructive)]' : 'text-[var(--sys-heading)]'
                  }`}
                >
                  {f.total}
                </span>
                <span className="block truncate text-xs text-[var(--sys-muted-foreground)]">{c.label}</span>
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
