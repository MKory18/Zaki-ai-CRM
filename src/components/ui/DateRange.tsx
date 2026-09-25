'use client';

import React, { useEffect, useRef, useState } from 'react';
import { CalendarDays, ChevronRight, ChevronLeft, X } from 'lucide-react';
import { addMonths, format, isAfter, isBefore, isSameDay, startOfMonth, startOfWeek, subDays } from 'date-fns';
import { ar } from 'date-fns/locale';

/**
 * Picking a span of days, in Arabic.
 *
 * Two native date inputs put the browser's own picker on screen: Latin
 * month names, a left-to-right grid and a layout nobody here reads. And
 * they asked the wrong question — the answer is almost always "the last
 * week" or "this month", not a pair of exact dates, so those come first and
 * the grid is there for the times they are not enough.
 */

export interface Range {
  from: string;
  to: string;
}

const iso = (d: Date) => format(d, 'yyyy-MM-dd');
const DAY_INITIALS = ['أحد', 'إثن', 'ثلا', 'أرب', 'خمي', 'جمع', 'سبت'];

export function DateRange({
  value,
  onChange,
  label = 'التاريخ',
}: {
  value: Range;
  onChange: (range: Range) => void;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => startOfMonth(value.from ? new Date(value.from) : new Date()));
  /** The first click of a new span; the second click closes it. */
  const [anchor, setAnchor] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  function preset(days: number | 'month') {
    const today = new Date();
    if (days === 'month') {
      onChange({ from: iso(startOfMonth(today)), to: iso(today) });
    } else {
      onChange({ from: iso(subDays(today, days - 1)), to: iso(today) });
    }
    setAnchor(null);
    setOpen(false);
  }

  function pick(day: Date) {
    const picked = iso(day);
    if (!anchor) {
      setAnchor(picked);
      onChange({ from: picked, to: picked });
      return;
    }
    // Clicking before the anchor turns the span around rather than refusing.
    const [from, to] = picked < anchor ? [picked, anchor] : [anchor, picked];
    onChange({ from, to });
    setAnchor(null);
    setOpen(false);
  }

  const first = startOfWeek(startOfMonth(month), { weekStartsOn: 0 });
  const days: Date[] = [];
  for (let i = 0; i < 42; i++) days.push(new Date(first.getTime() + i * 86_400_000));

  const from = value.from ? new Date(value.from) : null;
  const to = value.to ? new Date(value.to) : null;
  const summary =
    value.from && value.to
      ? value.from === value.to
        ? format(new Date(value.from), 'd MMMM yyyy', { locale: ar })
        : `${format(new Date(value.from), 'd MMM', { locale: ar })} — ${format(new Date(value.to), 'd MMM yyyy', { locale: ar })}`
      : label;

  return (
    <div className="relative" ref={box}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full h-9 px-3 rounded-lg border border-[var(--sys-border)] bg-[var(--sys-card)] text-xs text-[var(--sys-foreground)] inline-flex items-center gap-2 hover:border-[var(--sys-primary)]/50"
      >
        <CalendarDays className="w-3.5 h-3.5 text-[var(--sys-muted)] shrink-0" />
        <span className="truncate flex-1 text-start">{summary}</span>
        {(value.from || value.to) && (
          <span
            role="button"
            tabIndex={0}
            aria-label="امسح التاريخ"
            onClick={(e) => {
              e.stopPropagation();
              onChange({ from: '', to: '' });
              setAnchor(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.stopPropagation();
                onChange({ from: '', to: '' });
              }
            }}
            className="text-[var(--sys-muted)] hover:text-[var(--sys-destructive)] shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </span>
        )}
      </button>

      {open && (
        <div
          dir="rtl"
          className="absolute z-30 mt-1 w-[19rem] rounded-xl border border-[var(--sys-border)] bg-[var(--sys-card)] shadow-lg p-3 space-y-3"
        >
          <div className="flex flex-wrap gap-1.5">
            {[
              { label: 'اليوم', run: () => preset(1) },
              { label: 'آخر ٧ أيام', run: () => preset(7) },
              { label: 'آخر ٣٠ يوم', run: () => preset(30) },
              { label: 'هذا الشهر', run: () => preset('month') },
            ].map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={p.run}
                className="px-2.5 py-1 text-[11px] rounded-lg border border-[var(--sys-border)] text-[var(--sys-foreground)] hover:border-[var(--sys-primary)] hover:text-[var(--sys-primary)]"
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setMonth(addMonths(month, -1))}
              className="p-1.5 rounded-lg text-[var(--sys-muted-foreground)] hover:bg-[var(--sys-surface)]"
              aria-label="الشهر السابق"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <span className="text-xs font-bold text-[var(--sys-heading)]">
              {format(month, 'MMMM yyyy', { locale: ar })}
            </span>
            <button
              type="button"
              onClick={() => setMonth(addMonths(month, 1))}
              className="p-1.5 rounded-lg text-[var(--sys-muted-foreground)] hover:bg-[var(--sys-surface)]"
              aria-label="الشهر التالي"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>

          {/* The seven columns are set inline as well as by class: when the
              stylesheet has not caught up with a newly-used utility the grid
              collapses into one column and the month becomes a long list. */}
          <div
            className="grid grid-cols-7 gap-0.5 text-center"
            style={{ gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' }}
          >
            {DAY_INITIALS.map((d) => (
              <span key={d} className="text-[10px] text-[var(--sys-muted)] py-1">{d}</span>
            ))}
            {days.map((day) => {
              const outside = day.getMonth() !== month.getMonth();
              const isFrom = from && isSameDay(day, from);
              const isTo = to && isSameDay(day, to);
              const inside = from && to && isAfter(day, from) && isBefore(day, to);
              const edge = isFrom || isTo;

              return (
                <button
                  key={day.toISOString()}
                  type="button"
                  onClick={() => pick(day)}
                  className={`h-8 text-[11px] tabular-nums rounded-lg transition-colors ${
                    edge
                      ? 'bg-[var(--sys-primary)] text-[var(--sys-primary-foreground)] font-bold'
                      : inside
                        ? 'bg-[var(--sys-primary-soft)] text-[var(--sys-primary)]'
                        : outside
                          ? 'text-[var(--sys-border-strong)] hover:bg-[var(--sys-surface)]'
                          : 'text-[var(--sys-foreground)] hover:bg-[var(--sys-surface)]'
                  }`}
                >
                  {format(day, 'd')}
                </button>
              );
            })}
          </div>

          {anchor && (
            <p className="text-[11px] text-[var(--sys-primary)]">اختر يوم النهاية…</p>
          )}
        </div>
      )}
    </div>
  );
}
