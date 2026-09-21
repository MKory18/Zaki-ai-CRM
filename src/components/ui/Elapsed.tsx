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
  const [, tick] = useState(0);

  useEffect(() => {
    if (!since) return;
    const id = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, [since]);

  if (!since) return null;
  const skew = serverNow ? Date.now() - new Date(serverNow).getTime() : 0;
  const ms = Date.now() - skew - new Date(since).getTime();
  return Math.max(0, Math.floor(ms / 60_000));
}

export function Elapsed({
  since,
  serverNow,
  prefix,
  className,
}: {
  since: string | Date | null;
  serverNow?: string | null;
  prefix?: string;
  className?: string;
}) {
  const minutes = useElapsedMinutes(since, serverNow);
  if (minutes === null) return null;
  return (
    <span className={className}>
      {prefix ? `${prefix} ` : ''}
      {humanMinutes(minutes)}
    </span>
  );
}
