'use client';

import React, { useEffect } from 'react';
import { DECOR_CLASS, type DecorPlace } from '@/lib/theme-decoration';

/**
 * ONE AMBIENT LAYER, IN ONE OF THE THREE PLACES IT IS ALLOWED.
 *
 * `aria-hidden` and `pointer-events:none`: it is behind the screen, it
 * says nothing, and it catches no click. A decoration that can be tabbed
 * to or read out is a decoration that has become content.
 *
 * It draws NOTHING unless `decorCss` was written into the document — which
 * `SystemFrame` only does when the person's level is not «off». So turning
 * decoration off is not this component hiding itself; it is the CSS never
 * arriving, which is also why it costs nothing to the people who turned it
 * off.
 *
 * ⚠️ Three places only — the door, an empty list, and the sidebar header.
 * Never behind a table, a form, an order, a figure of money or a stock
 * count. See `theme-decoration.ts`, and the sweep in
 * `a-theme-is-not-a-mood-swing.test.ts` that fails if it appears on a
 * screen that renders any of those.
 */
export function ThemeDecor({ place }: { place: DecorPlace }) {
  return <div aria-hidden className={`${DECOR_CLASS} ${DECOR_CLASS}-${place} ${DECOR_CLASS}-full`} />;
}

/**
 * STOPS THE DRIFT WHILE NOBODY IS LOOKING.
 *
 * A CSS animation in a hidden tab still composites on some platforms, and
 * «some platforms» here means a seller's phone with eleven tabs open. The
 * flag is an attribute on the document element, so the pause is one CSS
 * rule rather than a re-render — and the rule only exists at the «full»
 * level, which is the only level that animates.
 *
 * Mounted once by the frame, not per layer: three layers setting the same
 * attribute would fight over it.
 */
export function DecorVisibility() {
  useEffect(() => {
    const sync = () => {
      const root = document.documentElement;
      if (document.hidden) root.setAttribute('data-decor-hidden', '1');
      else root.removeAttribute('data-decor-hidden');
    };
    sync();
    document.addEventListener('visibilitychange', sync);
    return () => {
      document.removeEventListener('visibilitychange', sync);
      document.documentElement.removeAttribute('data-decor-hidden');
    };
  }, []);
  return null;
}
