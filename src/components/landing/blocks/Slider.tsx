'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Photos that turn by themselves, and by the visitor's thumb.
 *
 * Built on transform, not on native scrolling: a scroll position in a
 * right-to-left container is negative in one browser and positive in the
 * next, and a slider that jumps the wrong way on half the phones is worse
 * than a gallery. The direction is read from the page, so the next photo is
 * always the one the visitor's language says comes next.
 *
 * It stops turning the moment it is touched, hovered or focused, and never
 * turns for somebody who asked their device for less motion.
 */
export function Slider({ images, autoplay, seconds }: { images: string[]; autoplay: boolean; seconds: number }) {
  const [index, setIndex] = useState(0);
  const [held, setHeld] = useState(false);
  const [rtl, setRtl] = useState(true);
  const [calm, setCalm] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const start = useRef<number | null>(null);
  const count = images.length;

  useEffect(() => {
    if (root.current) setRtl(getComputedStyle(root.current).direction === 'rtl');
    setCalm(typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  }, []);

  const go = useCallback((to: number) => setIndex(((to % count) + count) % count), [count]);

  useEffect(() => {
    if (!autoplay || held || calm || count < 2) return;
    const t = setInterval(() => setIndex((i) => (i + 1) % count), Math.max(2, seconds) * 1000);
    return () => clearInterval(t);
  }, [autoplay, held, calm, count, seconds]);

  if (count === 0) return null;

  return (
    <div
      ref={root}
      className="lp-slider"
      role="region"
      aria-roledescription="carousel"
      aria-label="صور المنتج"
      onMouseEnter={() => setHeld(true)}
      onMouseLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={() => setHeld(false)}
      onPointerDown={(e) => { start.current = e.clientX; setHeld(true); }}
      onPointerUp={(e) => {
        if (start.current === null) return;
        const dx = e.clientX - start.current;
        start.current = null;
        if (Math.abs(dx) < 40) return;
        // In a right-to-left page the next photo lies to the left, so the
        // content is dragged rightwards to reach it.
        const forward = rtl ? dx > 0 : dx < 0;
        go(index + (forward ? 1 : -1));
      }}
    >
      <div
        className="lp-slider-track"
        style={{ transform: `translateX(${(rtl ? 1 : -1) * index * 100}%)` }}
      >
        {images.map((src, i) => (
          <div key={i} className="lp-slider-slide" aria-hidden={i !== index}>
            {/* The seller's own uploads; next/image would need every host allow-listed. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt="" loading={i === 0 ? 'eager' : 'lazy'} draggable={false} />
          </div>
        ))}
      </div>
      {count > 1 && (
        <div className="lp-slider-dots">
          {images.map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`الصورة ${i + 1}`}
              aria-current={i === index}
              onClick={() => go(i)}
              className={i === index ? 'on' : ''}
            />
          ))}
        </div>
      )}
    </div>
  );
}
