'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { EyeOff, Lock } from 'lucide-react';
import { idleState, secondsLeft, type IdleState } from '@/lib/exposure';
import { signOut } from '@/lib/sign-out';

/**
 * A PHONE LEFT ON A COUNTER.
 *
 * The session cookie lasts seven days, thirty with "remember me". That is
 * right for the person: signing in every morning on a phone is how people
 * end up writing the password on the inside of a drawer. It is wrong for
 * the phone itself, which spends those seven days in a pocket, on a
 * counter, in a repair shop, and in one case in a taxi.
 *
 * So the cookie stays long and the SCREEN gets short. Twenty minutes with
 * nothing touched and the account is signed out for real — the server bumps
 * the token version, so the cookie somebody kept a copy of is dead too, not
 * merely hidden.
 *
 * A minute of warning first, because signing somebody out silently in the
 * middle of a shift is how a safety measure gets switched off.
 *
 * THE BLUR IS NOT A PROMISE. When the app goes to the background the
 * content is covered, which is aimed at one specific thing: the thumbnail
 * the phone keeps of the app in its task switcher, glanced at by whoever is
 * next to you. It is best effort — some systems take that picture before
 * the page is told it is hidden — and it stops no screenshot, no recording
 * and no camera. See the note in src/lib/exposure.ts.
 */

/** A timestamp, shared between this account's open tabs. Never anything else. */
const KEY = 'salesflow.lastActive';

/** How often the clock is consulted. Cheap, and never the thing that drifts. */
const TICK_MS = 5_000;

/** How rarely activity is written to storage — a scroll fires by the hundred. */
const WRITE_EVERY_MS = 10_000;

const WATCHED = ['pointerdown', 'keydown', 'scroll', 'wheel', 'touchstart'] as const;

export function IdleGuard() {
  const [phase, setPhase] = useState<IdleState>('active');
  const [left, setLeft] = useState(0);
  const [covered, setCovered] = useState(false);

  // Seeded in the effect, not here: reading the clock during render is a
  // value that changes on a re-render nobody asked for.
  const lastActive = useRef(0);
  const lastWrite = useRef(0);
  const leaving = useRef(false);

  /** Somebody is here. */
  const touch = useCallback(() => {
    const now = Date.now();
    lastActive.current = now;
    if (now - lastWrite.current > WRITE_EVERY_MS) {
      lastWrite.current = now;
      try {
        localStorage.setItem(KEY, String(now));
      } catch {
        /* blocked storage costs the other tabs their share of this, nothing more */
      }
    }
    // React bails out when the value is unchanged, so a scroll does not
    // re-render the whole shell sixty times a second.
    setPhase((p) => (p === 'active' ? p : 'active'));
  }, []);

  useEffect(() => {
    // Arriving here IS somebody acting: they opened or reloaded the app.
    // A timestamp another tab wrote is adopted only when it is NEWER —
    // never older, or opening the app after a week away would read last
    // week as "twenty minutes idle" and bounce the person straight back to
    // the login screen they just came from.
    lastActive.current = Date.now();
    try {
      const stored = Number(localStorage.getItem(KEY));
      if (Number.isFinite(stored) && stored > lastActive.current) lastActive.current = stored;
    } catch {
      /* blocked storage costs the other tabs their share of this, nothing more */
    }

    for (const event of WATCHED) {
      window.addEventListener(event, touch, { passive: true });
    }

    const fromOtherTab = (e: StorageEvent) => {
      if (e.key !== KEY) return;
      const at = Number(e.newValue);
      // Working in the other tab IS working. Only ever moves forward:
      // a stale write must not resurrect a session that has run out.
      if (Number.isFinite(at) && at > lastActive.current) {
        lastActive.current = at;
        setPhase((p) => (p === 'active' ? p : 'active'));
      }
    };
    window.addEventListener('storage', fromOtherTab);

    /**
     * Returning to the tab is deliberately NOT activity. Somebody picking up
     * a phone that has been face-down for an hour reaches exactly this
     * moment, and it is the moment the session must already be gone.
     */
    const onVisibility = () => setCovered(document.hidden);
    document.addEventListener('visibilitychange', onVisibility);

    const id = setInterval(() => {
      const now = Date.now();
      const state = idleState(lastActive.current, now);
      setLeft(secondsLeft(lastActive.current, now));
      setPhase(state);
      if (state === 'expired' && !leaving.current) {
        leaving.current = true;
        void signOut('idle');
      }
    }, TICK_MS);

    return () => {
      for (const event of WATCHED) window.removeEventListener(event, touch);
      window.removeEventListener('storage', fromOtherTab);
      document.removeEventListener('visibilitychange', onVisibility);
      clearInterval(id);
    };
  }, [touch]);

  return (
    <>
      {covered && (
        <div
          data-testid="backgrounded"
          className="fixed inset-0 z-[65] flex items-center justify-center bg-[var(--sys-surface)]/90 backdrop-blur-2xl"
        >
          <EyeOff className="h-8 w-8 text-[var(--sys-muted)]" />
        </div>
      )}

      {phase !== 'active' && (
        <div
          role="alertdialog"
          aria-live="assertive"
          data-testid="idle-warning"
          className="fixed inset-x-0 bottom-0 z-[70] p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"
        >
          <div className="mx-auto flex max-w-md items-center gap-3 rounded-lg border border-[var(--sys-warning)] bg-[var(--sys-card)] p-3 shadow-overlay">
            <Lock className="h-5 w-5 shrink-0 text-[var(--sys-warning)]" />
            <p className="flex-1 text-sm text-[var(--sys-foreground)]">
              {phase === 'expired' ? (
                'انتهت الجلسة — جارٍ تسجيل الخروج…'
              ) : (
                <>
                  ستُغلق الجلسة بعد <span className="tabular-nums font-semibold">{left}</span> ثانية لعدم الاستخدام.
                </>
              )}
            </p>
            {phase === 'warning' && (
              <button
                type="button"
                onClick={touch}
                className="h-10 shrink-0 rounded-lg bg-[var(--sys-primary)] px-4 text-sm font-medium text-[var(--sys-primary-foreground)]"
              >
                أنا هنا
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
