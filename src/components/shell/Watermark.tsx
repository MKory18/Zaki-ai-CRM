'use client';

import React, { useEffect, useState } from 'react';
import { watermarkText } from '@/lib/exposure';

/**
 * A NAME IN EVERY PHOTOGRAPH OF THIS SCREEN.
 *
 * Say the true thing first: this does not stop a screenshot. Nothing a web
 * page can do stops a screenshot — there is no API, on any phone, in any
 * PWA, and even a browser that had one would not stop a second phone
 * pointed at the first. Anyone who tells you otherwise is selling
 * something.
 *
 * What it does is make a leaked image answer a question. A screen full of
 * customers' phone numbers, forwarded to a competitor, is currently an
 * anonymous image. With this it carries the name of the account that was
 * looking at it, and the hour. That does not prevent the first leak. It
 * makes the second one much less likely, which is the entire and honest
 * claim.
 *
 * It is drawn OVER everything, dialogs included, because the dialogs are
 * where a single customer's address and phone are largest on the screen.
 * It cannot be clicked, selected or copied, and there is no setting to turn
 * it off — a watermark with a switch is a watermark for the honest.
 */

/** Enough tiles to cross any screen at this angle. */
const TILES = 24;

export function Watermark({ viewer }: { viewer: { name: string; id: string } }) {
  // Rendered on the client so the stamp is the viewer's own clock, and it
  // does not go stale on a screen left open across an afternoon.
  const [text, setText] = useState(() => watermarkText(viewer, new Date()));

  useEffect(() => {
    const id = setInterval(() => setText(watermarkText(viewer, new Date())), 60_000);
    return () => clearInterval(id);
  }, [viewer]);

  return (
    <div
      aria-hidden
      data-testid="watermark"
      className="pointer-events-none fixed inset-0 z-[60] select-none overflow-hidden"
    >
      <div className="absolute -inset-[40%] grid grid-cols-3 content-center justify-items-center gap-y-28 rotate-[-24deg]">
        {Array.from({ length: TILES }, (_, i) => (
          <span
            key={i}
            className="whitespace-nowrap text-[13px] font-semibold tracking-wide text-[var(--sys-heading)] opacity-[0.055]"
            dir="auto"
          >
            {text}
          </span>
        ))}
      </div>
    </div>
  );
}
