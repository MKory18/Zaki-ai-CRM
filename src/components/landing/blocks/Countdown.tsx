'use client';

import React, { useEffect, useState } from 'react';

/**
 * A COUNTDOWN TO A DEADLINE THAT EXISTS.
 *
 * «عدّاد فقط من تاريخ انتهاء عرض حقيقي». It counts to `Offer.endsAt` — the
 * same column that stops the price applying — so when it reaches zero
 * something actually happens, which is the only thing that makes the number
 * worth reading.
 *
 * WHAT IT USED TO BE, AND WHY THAT HAD TO GO. It counted `minutes` a seller
 * typed, from the moment the visitor arrived. That had no source: a page
 * with no offer ending anywhere still showed a clock running out, and when
 * it ran out the price was the same. The component defended that invention
 * carefully — it kept the deadline in `localStorage` so a reload would not
 * hand out a fresh one — and the defence was the giveaway: a deadline that
 * has to be remembered per browser is a deadline that is not real.
 *
 * So there is no storage here any more, and nothing to keep: the offer's end
 * is one moment for every visitor, and two people on two phones see the same
 * number. That also removes the last reason this block had to behave
 * differently in the builder from on the page.
 */

/** An ISO instant. Rendered as the time left, never as a date. */
export function Countdown({ endsAt }: { endsAt: string }) {
  const deadline = Date.parse(endsAt);

  /*
   * THE FIRST PAINT IS THE SERVER'S ARITHMETIC, NOT ZERO.
   *
   * Rendered on the server too, so this runs with the server's clock and
   * then again with the browser's. Starting from the real remaining seconds
   * means the number never flashes «00:00» before the first tick, which on
   * a slow phone is a visible frame of «the offer is over».
   */
  const [left, setLeft] = useState(() => Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));

  useEffect(() => {
    if (!Number.isFinite(deadline)) return;
    const tick = () => setLeft(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [deadline]);

  // A date we cannot read is not a deadline. Nothing is drawn rather than a
  // row of dashes, which a shopper reads as a broken page.
  if (!Number.isFinite(deadline)) return null;
  if (left <= 0) return <p className="lp-countdown-over">انتهى وقت العرض</p>;

  const d = Math.floor(left / 86400);
  const h = Math.floor((left % 86400) / 3600);
  const m = Math.floor((left % 3600) / 60);
  const s = left % 60;
  const pad = (n: number) => String(n).padStart(2, '0');

  return (
    <div className="lp-countdown" dir="ltr" role="timer" aria-live="off">
      {/* An offer that ends in four days is «4 أيام» and not «96:00:00»:
          a six-figure clock on a phone is unreadable and reads as fake. The
          days are named in Arabic beside the hours, which stay a clock. */}
      {d > 0 && (
        <>
          <span className="lp-countdown-days">
            {d} {d === 1 ? 'يوم' : d === 2 ? 'يومين' : 'أيام'}
          </span>
          <i>·</i>
        </>
      )}
      <span>{pad(h)}</span>
      <i>:</i>
      <span>{pad(m)}</span>
      <i>:</i>
      <span>{pad(s)}</span>
    </div>
  );
}
