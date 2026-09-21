'use client';

import React, { useEffect, useState } from 'react';

/**
 * A countdown of real minutes from the moment this visitor arrived.
 *
 * It counts down and it stops. It does not reset on reload to fake a fresh
 * deadline, and when it reaches zero it says so rather than looping — a timer
 * that restarts forever teaches the visitor that the deadline is theatre, and
 * they are right.
 */
export function Countdown({ minutes }: { minutes: number }) {
  const [left, setLeft] = useState(minutes * 60);

  useEffect(() => {
    setLeft(minutes * 60);
    const t = setInterval(() => setLeft((s) => (s <= 1 ? 0 : s - 1)), 1000);
    return () => clearInterval(t);
  }, [minutes]);

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
