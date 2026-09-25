'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { LogIn, Loader2, Check } from 'lucide-react';
import { apiJson } from '@/lib/api-client';
import { humanMinutes, useElapsedMinutes } from '@/components/ui/Elapsed';

/**
 * THE SHIFT, IN THE HEADER.
 *
 * It started as a full-width bar above the queue with a large pink button
 * in it — the loudest thing on the screen, in the one place where somebody
 * clicking fast is aiming at an order. Three things were wrong with that:
 * it only existed on one screen, it competed with the work, and handing
 * over the day was one stray click away.
 *
 * So it lives in the header instead, beside the name and the bell. That is
 * already where "who am I, and am I working" is answered, it is in the same
 * place on every screen, and nothing there is ever clicked in a hurry.
 *
 * Three rules it obeys:
 *
 *   THE OWNER DOES NOT CLOCK IN. The server decides who has a shift; a
 *   button shown to the person who sets the hours teaches everybody that
 *   the control is decorative.
 *
 *   ARRIVING IS ONE CLICK, LEAVING IS TWO. Starting early is harmless.
 *   Ending by accident closes a day that is still being worked, and the
 *   report then shows a short shift nobody can explain.
 *
 *   THE COUNTER SAYS THE ROLE'S OWN SENTENCE. A confirmation agent is
 *   counted by what she pulls; a moderator by what he brings in. Both read
 *   "آخر طلب … منذ" from the server, which knows which record to look at.
 */

interface ShiftState {
  shift: boolean;
  arrivedAt?: string | null;
  leftAt?: string | null;
  serverNow?: string;
  hours?: { start: string; end: string };
  lastAction?: { at: string; label: string; empty: string } | null;
}

export function ShiftChip() {
  const [state, setState] = useState<ShiftState | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    try {
      setState(await apiJson<ShiftState>('/api/attendance/mark'));
    } catch {
      setState({ shift: false });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // The "متأكد؟" step gives itself up after a few seconds, so a half-press
  // never leaves a live confirm sitting in the header for the rest of the day.
  useEffect(() => {
    if (!confirming) return;
    timer.current = setTimeout(() => setConfirming(false), 4000);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [confirming]);

  const press = async (kind: 'CHECK_IN' | 'CHECK_OUT') => {
    setBusy(true);
    try {
      await apiJson('/api/attendance/mark', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind }),
      });
      setConfirming(false);
      await load();
    } catch {
      /* the header is not the place for an error banner; the state reloads */
    } finally {
      setBusy(false);
    }
  };

  const onShift = !!state?.arrivedAt && !state?.leftAt;
  const elapsed = useElapsedMinutes(onShift ? state?.arrivedAt ?? null : null, state?.serverNow);
  const sinceLast = useElapsedMinutes(state?.lastAction?.at ?? null, state?.serverNow);

  if (!state?.shift) return null;

  const counter = state.lastAction
    ? `${state.lastAction.label} ${sinceLast === null ? '—' : humanMinutes(sinceLast)}`
    : null;

  return (
    <div className="flex items-center gap-2">
      {counter && (
        <span
          // Was hidden below 1024px, which is most screens people actually
          // work on — so the counter they asked for was invisible to the
          // two roles it was built for. It shows from a phone up now; only
          // the very narrowest layout drops it.
          className="hidden sm:inline text-[11px] text-[var(--sys-muted-foreground)] tabular-nums whitespace-nowrap"
          title="يُحتسب من ساعة الخادم"
        >
          {counter}
        </span>
      )}

      {state.leftAt ? (
        <span
          className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[11px] text-[var(--sys-muted-foreground)]"
          title="انتهى دوامك اليوم"
        >
          <Check className="w-3.5 h-3.5" />
          سلّمت
        </span>
      ) : onShift ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => (confirming ? press('CHECK_OUT') : setConfirming(true))}
          onBlur={() => setConfirming(false)}
          title={`في الدوام منذ ${elapsed === null ? '—' : humanMinutes(elapsed)} · الدوام ${state.hours?.start}—${state.hours?.end}`}
          className={`inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg border text-[11px] font-semibold tabular-nums transition-colors disabled:opacity-60 ${
            confirming
              ? 'border-[var(--sys-primary)] bg-[var(--sys-primary-soft)] text-[var(--sys-primary)]'
              : 'border-[var(--sys-border)] text-[var(--sys-foreground)] hover:border-[var(--sys-primary)]/50'
          }`}
        >
          {busy ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--sys-success)]" aria-hidden />
          )}
          {confirming ? 'أنهي الدوام؟' : elapsed === null ? 'في الدوام' : humanMinutes(elapsed)}
        </button>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => press('CHECK_IN')}
          title={`سجّل بداية دوامك · الدوام ${state.hours?.start}—${state.hours?.end}`}
          className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg border border-[var(--sys-border)] text-[11px] font-semibold text-[var(--sys-foreground)] hover:border-[var(--sys-primary)] hover:text-[var(--sys-primary)] transition-colors disabled:opacity-60"
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LogIn className="w-3.5 h-3.5" />}
          استلمت
        </button>
      )}
    </div>
  );
}
