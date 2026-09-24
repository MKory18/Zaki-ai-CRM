'use client';

import React, { useEffect, useState } from 'react';

/**
 * A countdown of real minutes from the moment this visitor arrived.
 *
 * It counts down and it stops. It does not reset on reload to fake a fresh
 * deadline, and when it reaches zero it says so rather than looping — a timer
 * that restarts forever teaches the visitor that the deadline is theatre, and
 * they are right.
 *
 * That promise used to be broken by the timer itself: it started from the
 * full minutes on every mount, so a reload gave a fresh deadline. The
 * deadline is now kept in this browser, per page and block. A visitor who
 * comes back a day after it ran out is on a new visit and gets a new one.
 */
const DAY_MS = 24 * 60 * 60 * 1000;

function deadlineFor(key: string, minutes: number): number {
  const now = Date.now();
  try {
    const stored = Number(window.localStorage.getItem(key));
    if (Number.isFinite(stored) && stored > 0 && now < stored + DAY_MS) return stored;
  } catch {
    // Storage blocked (private mode): the timer still counts — for this view.
  }
  const fresh = now + minutes * 60_000;
  try {
    window.localStorage.setItem(key, String(fresh));
  } catch {
    /* see above */
  }
  return fresh;
}

export function Countdown({ minutes, id, persist = true }: { minutes: number; id: string; persist?: boolean }) {
  const [left, setLeft] = useState(minutes * 60);

  useEffect(() => {
    // The builder's canvas is the seller editing, not a visitor: keeping its
    // deadline would show "over" in the editor for a day after one run.
    const deadline = persist
      ? deadlineFor(`lp-countdown:${window.location.pathname}:${id}:${minutes}`, minutes)
      : Date.now() + minutes * 60_000;
    const tick = () => setLeft(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [minutes, id, persist]);

  if (left <= 0) return <p className="lp-countdown-over">انتهى وقت العرض</p>;

  const h = Math.floor(left / 3600);
  const m = Math.floor((left % 3600) / 60);
  const s = left % 60;
  const pad = (n: number) => String(n).padStart(2, '0');

  return (
    <div className="lp-countdown" dir="ltr" role="timer" aria-live="off">
      {h > 0 && (
        <>
          <span>{pad(h)}</span>
          <i>:</i>
        </>
      )}
      <span>{pad(m)}</span>
      <i>:</i>
      <span>{pad(s)}</span>
    </div>
  );
}
