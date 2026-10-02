'use client';

import React, { useEffect, useState } from 'react';

/**
 * A clock that keeps running while you look at it.
 *
 * "منذ ٣ دقائق" that was true when the page loaded and still says three
 * minutes an hour later is worse than no number at all. This ticks, and it
 * counts from the SERVER's clock: an agent whose laptop is an hour out must
 * not see an order as freshly claimed when it has been sitting all morning.
 */

/** Minutes as something sayable in Arabic: ٤٥ د، ٢ س ١٠ د، ٣ ي. */
export function humanMinutes(minutes: number): string {
  if (minutes < 1) return 'الآن';
  if (minutes < 60) return `${minutes} د`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours < 24) return rest ? `${hours} س ${rest} د` : `${hours} س`;
  const days = Math.floor(hours / 24);
  const restHours = hours % 24;
  return restHours ? `${days} ي ${restHours} س` : `${days} ي`;
}

/**
 * Minutes between two moments, measured against the server's clock.
 *
 * `serverNow` is when the server answered; the difference between that and
 * the browser's own clock is the skew we subtract from here on.
 */
export function useElapsedMinutes(since: string | Date | null, serverNow?: string | null): number | null {
  /*
   * The current moment is STATE, not something read while rendering.
   *
   * This used to be a counter whose only job was to force a re-render, with
   * `Date.now()` called twice in the body below. Reading the wall clock
   * while rendering makes the output a function of when React happened to
   * render rather than of the props and state that produced it: render the
   * same component twice for the same state — which React does, in
   * StrictMode and whenever it retries a render it then throws away — and
   * the two renders disagree. The two calls here could even straddle a
   * minute boundary and compute a skew against one moment and an age
   * against another.
   *
   * So the moment is captured once per tick and lives in state. The lazy
   * initialiser is the one place React sanctions reading something external:
   * it runs once, when the hook's state is created, and its result is tied
   * to that mounted instance. Every later value comes from the interval.
   */
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!since) return;
    // The initialiser ran when the hook first mounted, which may have been
    // long before `since` arrived from the server — so re-read on the way in
    // rather than waiting thirty seconds for the first tick.
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [since]);

  if (!since) return null;
  const skew = serverNow ? now - new Date(serverNow).getTime() : 0;
  const ms = now - skew - new Date(since).getTime();
  return Math.max(0, Math.floor(ms / 60_000));
}

