'use client';

import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';

/**
 * WHEN SOMETHING IS SELECTED, THE BOTTOM OF THE PHONE BELONGS TO IT.
 *
 * The orders list has had a bulk bar for a long time, and on a phone it has
 * been unreachable the whole time: it renders above the list, so you scroll
 * down, tap five rows, and the thing that acts on them is four screens up.
 * People scroll back, lose the scroll position, and stop selecting.
 *
 * So while a selection is live the bottom navigation stands down and the
 * bar takes its place — the same strip of screen the thumb is already on.
 * Navigating away mid-selection is not what anybody is trying to do.
 *
 * On a desk nothing moves: there is no bottom navigation to yield, and the
 * bar stays where it has always been, above the rows it acts on.
 *
 * WHAT THIS IS NOT.
 *
 * It is not a bulk bar. It does not decide what a bar contains, how it is
 * laid out, or what its buttons look like — the orders screen still owns
 * all of that, exactly as before. This is the SHELL agreeing to get out of
 * the way, and it is deliberately the whole of the mechanism.
 */

const Ctx = createContext<{ active: boolean; claim: (on: boolean) => void }>({
  active: false,
  claim: () => undefined,
});

/** Lives in the Shell, around everything. */
export function BulkProvider({ children }: { children: React.ReactNode }) {
  /**
   * A count, not a boolean. Two screens could mount bars in one session,
   * and a boolean lets the second one's unmount switch the navigation back
   * on underneath the first one's live selection.
   */
  const [claims, setClaims] = useState(0);
  const value = useMemo(
    () => ({
      active: claims > 0,
      claim: (on: boolean) => setClaims((n) => Math.max(0, n + (on ? 1 : -1))),
    }),
    [claims]
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Read by the bottom navigation, which hides itself while this is true. */
export function useBulkActive(): boolean {
  return useContext(Ctx).active;
}

/**
 * Wraps a screen's own bulk bar.
 *
 * `show` is the screen's existing condition — nothing here decides when a
 * selection exists. When it is false this renders nothing at all, so a
 * screen with no selection costs one boolean.
 */
export function BulkBar({ show, children }: { show: boolean; children: React.ReactNode }) {
  const { claim } = useContext(Ctx);
  const bar = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!show) return;
    claim(true);
    return () => claim(false);
    // `claim` is stable in what matters: it only ever adjusts a counter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show]);

  /**
   * The page has to reserve room for this, and the room is not a constant:
   * the bar wraps to two or three rows on a narrow phone depending on how
   * many actions the person may perform. A fixed guess leaves the last
   * order row underneath it — which is the row somebody just selected.
   */
  useEffect(() => {
    const el = bar.current;
    if (!show || !el || typeof ResizeObserver === 'undefined') return;
    const write = () =>
      document.documentElement.style.setProperty('--bulk-h', `${Math.ceil(el.getBoundingClientRect().height)}px`);
    write();
    const watch = new ResizeObserver(write);
    watch.observe(el);
    return () => {
      watch.disconnect();
      document.documentElement.style.removeProperty('--bulk-h');
    };
  }, [show]);

  if (!show) return null;

  return (
    <div
      ref={bar}
      className={
        // Phone: the bottom strip, above the home indicator, over the page.
        'fixed inset-x-0 bottom-0 z-30 border-t border-[var(--sys-primary-soft)] ' +
        'bg-[var(--sys-card)] px-4 py-2.5 pb-[calc(0.625rem+env(safe-area-inset-bottom))] ' +
        // Desk: exactly where it has always been.
        'md:static md:z-auto md:rounded-lg md:border md:bg-[var(--sys-primary-soft)] md:pb-2.5'
      }
      role="toolbar"
      aria-label="إجراءات على المحدَّد"
    >
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}
