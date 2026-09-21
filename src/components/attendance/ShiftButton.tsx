'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { LogIn, LogOut, Loader2 } from 'lucide-react';
import { apiJson } from '@/lib/api-client';
import { Elapsed } from '@/components/ui/Elapsed';

/**
 * "استلمت" / "سلّمت".
 *
 * Signing in already recorded an arrival, so this button is never the only
 * thing standing between somebody and a counted day — which is exactly why
 * it is safe to have. It exists for the hours that leave no trace in the
 * order records: a meeting, a training, a shift spent waiting for a queue
 * that stayed empty. And for saying plainly "I have finished for today",
 * which is the only way the system can tell a short day from an unfinished
 * one.
 *
 * Once the day is handed over the button stops offering itself. Pressing
 * "استلمت" again at nine in the evening would reopen a day that is closed,
 * and the report would show eleven hours nobody worked.
 */

interface Today {
  arrivedAt: string | null;
  leftAt: string | null;
  checkedIn: boolean;
  shift: { start: string; end: string };
}

export function ShiftButton() {
  const [today, setToday] = useState<Today | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setToday(await apiJson<Today>('/api/attendance/mark'));
    } catch {
      setToday(null);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const press = async (kind: 'CHECK_IN' | 'CHECK_OUT') => {
    setBusy(true);
    setError(null);
    try {
      await apiJson('/api/attendance/mark', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind }),
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر التسجيل');
    } finally {
      setBusy(false);
    }
  };

  if (!today) return null;

  const done = !!today.leftAt;
  const here = !!today.arrivedAt && !done;

  return (
    <div className="flex items-center gap-2">
      {here && (
        <span className="hidden sm:inline text-[11px] text-[#697586] tabular-nums">
          <Elapsed since={today.arrivedAt} prefix="في الدوام منذ" />
        </span>
      )}

      {done ? (
        <span className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-[#e3e8ef] bg-[#f8fafc] text-[11px] text-[#697586]">
          <LogOut className="w-3.5 h-3.5" />
          سلّمت اليوم
        </span>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => press(here ? 'CHECK_OUT' : 'CHECK_IN')}
          title={`الدوام ${today.shift.start} — ${today.shift.end}`}
          className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-[11px] font-semibold transition-colors disabled:opacity-60 ${
            here
              ? 'border border-[#e3e8ef] text-[#364152] hover:border-[#b8256e] hover:text-[#b8256e]'
              : 'bg-[#b8256e] text-white hover:bg-[#a01f60]'
          }`}
        >
          {busy ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : here ? (
            <LogOut className="w-3.5 h-3.5" />
          ) : (
            <LogIn className="w-3.5 h-3.5" />
          )}
          {here ? 'سلّمت' : 'استلمت'}
        </button>
      )}

      {error && <span className="text-[11px] text-[#fb323f]">{error}</span>}
    </div>
  );
}
