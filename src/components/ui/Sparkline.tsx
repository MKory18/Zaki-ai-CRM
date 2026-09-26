'use client';

import React from 'react';

/**
 * THE SHAPE OF A NUMBER OVER TIME, IN ABOUT A CENTIMETRE.
 *
 * A figure on its own answers "how much". It does not answer the question
 * anybody actually has, which is "and is that normal" — 12,400 is good news
 * after 9,000 and bad news after 20,000, and the card cannot say which.
 *
 * NO CHART LIBRARY.
 *
 * Recharts is about 90KB of JavaScript to draw a line through nine points.
 * This is an SVG path and twelve lines of arithmetic, it adds nothing to
 * the bundle, and it cannot break on a locale.
 *
 * IT IS NOT A CHART, AND IT CARRIES NO AXIS.
 *
 * There are no ticks, no labels and no tooltip on purpose: a reader who
 * needs the values needs the list behind the card, which is one tap away.
 * What this answers is the direction and the roughness, and a grid would
 * only make it look like it answers more.
 */
export function Sparkline({
  points,
  /** Which way is good. A falling return rate is good news. */
  goodWhen = 'rising',
  className,
}: {
  points: number[];
  goodWhen?: 'rising' | 'falling' | 'neither';
  className?: string;
}) {
  // Two points make a line; one makes nothing worth drawing.
  if (points.length < 2) return null;

  const W = 100;
  const H = 28;
  const lo = Math.min(...points);
  const hi = Math.max(...points);
  // A flat series would divide by zero and draw nothing; draw it flat,
  // through the middle, because "it did not move" is itself the answer.
  const span = hi - lo || 1;
  const step = W / (points.length - 1);

  const d = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(2)},${(H - ((p - lo) / span) * H).toFixed(2)}`)
    .join(' ');

  const rose = points[points.length - 1] >= points[0];
  const good = goodWhen === 'neither' ? null : goodWhen === 'rising' ? rose : !rose;
  const stroke =
    good === null
      ? 'var(--sys-muted-foreground)'
      : good
        ? 'var(--sys-success)'
        : 'var(--sys-destructive)';

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className={className ?? 'h-7 w-full'}
      // It repeats what the figure and the comparison beside it already
      // say. A screen reader should not read a path aloud.
      aria-hidden
      focusable="false"
    >
      <path d={d} fill="none" stroke={stroke} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
