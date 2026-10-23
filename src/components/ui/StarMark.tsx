'use client';

import React from 'react';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * THE OCTAGRAM — EIGHT POINTS, ONE GOLD LINE, AND IT TURNS SLOWLY.
 *
 * The brief gave the sixteen points of the star and nothing else, and they
 * are written below exactly: a square standing on its corner, an upright
 * square cutting it, and the eight tips that result. Two squares and their
 * chords, drawn as geometry — no character, no mark, no likeness.
 *
 * It is the product's spinner. A ring of dots tells somebody «wait»; this
 * tells them «wait, and this is where you are» — the same eight-pointed
 * seal the frieze strings along the two Islamic themes and the same glyph
 * «ليل» wears in the corner of a card. One star across the product.
 *
 * `currentColor` for the stroke, so it is gold on «ليل» and whatever the
 * theme's accent is everywhere else: a spinner in a hard-coded hex would
 * be the one element on the screen that ignored the palette.
 *
 * ── AND IT STOPS WHEN SOMEBODY ASKED IT TO ──
 *
 * `motion-reduce:animate-none` is not decoration: a nine-second rotation
 * is exactly the kind of movement that makes a screen unusable for
 * somebody with vestibular sensitivity, and a spinner is the one piece of
 * motion a person cannot dismiss.
 * ═══════════════════════════════════════════════════════════════════════
 */

/** The sixteen points, verbatim from the brief. */
export const STAR_POINTS =
  '50,2 64,16 84,16 84,36 98,50 84,64 84,84 64,84 50,98 36,84 16,84 16,64 2,50 16,36 16,16 36,16';

export function StarMark({
  size = 24,
  className = '',
  /** Given only when the star IS the message. Otherwise it says nothing. */
  label,
  /** Seconds for one turn. Slow by default — this is a mood, not a progress bar. */
  seconds = 9,
}: {
  size?: number;
  className?: string;
  label?: string;
  seconds?: number;
}) {
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={`animate-spin motion-reduce:animate-none ${className}`}
      style={{ animationDuration: `${seconds}s` }}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      <polygon
        points={STAR_POINTS}
        fill="none"
        stroke="currentColor"
        strokeWidth={3.2}
        strokeLinejoin="round"
      />
      {/* The inner seal: the four-point star the chords leave in the middle. */}
      <polygon points="50,26 60,40 74,50 60,60 50,74 40,60 26,50 40,40" fill="currentColor" opacity={0.28} />
    </svg>
  );
}
