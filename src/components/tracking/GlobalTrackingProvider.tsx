'use client';

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { TrackingEngine } from '@/lib/tracking/tracking-client';
import {
  TrackingEventName,
  TrackingPageContext,
  TrackingPayload,
  TrackingPixelView,
} from '@/lib/tracking/tracking-types';

/**
 * GLOBAL TRACKING PROVIDER — the single tracking source for the whole site.
 *
 * Mounted once in the root layout with the server-resolved GLOBAL+PUBLIC
 * pixels. Public landing pages register their LANDING_PAGES pixels via
 * useTracking().registerPixels() — the provider then fires PageView once
 * for every active pixel (child effects run before the parent's effect,
 * so landing pixels are registered before PageView dispatch).
 *
 * No pixels → every call is a no-op: zero scripts, zero network.
 */

interface TrackingContextValue {
  trackEvent: (event: TrackingEventName, payload?: TrackingPayload) => void;
  registerPixels: (pixels: TrackingPixelView[]) => void;
  setPageContext: (page: TrackingPageContext) => void;
}

const noopContext: TrackingContextValue = {
  trackEvent: () => {},
  registerPixels: () => {},
  setPageContext: () => {},
};

const TrackingContext = createContext<TrackingContextValue>(noopContext);

export function GlobalTrackingProvider({
  pixels,
  children,
}: {
  pixels: TrackingPixelView[];
  children: React.ReactNode;
}) {
  /*
   * ONE engine for the life of this provider, built on the first client
   * render — not in an effect, and not in a ref written during render.
   *
   * Not in an effect: a public landing page registers its own
   * LANDING_PAGES pixels from a CHILD effect, and child effects run before
   * the parent's. An engine created in this component's effect would not
   * exist yet at that moment, so every landing pixel would be dropped and
   * the page would be tracked by the global set alone.
   *
   * Not in a ref assigned mid-render either, which is what this was: a
   * render React discards (StrictMode's second pass, a concurrent retry)
   * would still have written its engine into the ref, and the registrations
   * and the PageView guard below would be hanging off an object belonging
   * to a render that never committed.
   *
   * `useState` with a lazy initialiser is the sanctioned way to say "build
   * this once per mounted component": React calls the initialiser itself
   * and keeps the result tied to the committed instance. The `undefined`
   * window check stays because the constructor is for a browser —
   * server-rendering this layout must produce no engine at all, and every
   * call below is already null-safe for exactly that case.
   */
  const [engine] = useState<TrackingEngine | null>(() =>
    typeof window === 'undefined' ? null : new TrackingEngine({ pixels, page: 'PUBLIC' })
  );
  const pageViewFiredRef = useRef(false);

  useEffect(() => {
    // Child effects (landing pixel registration) already ran — dispatch now.
    if (pageViewFiredRef.current) return;
    pageViewFiredRef.current = true;
    try {
      engine?.initAll(); // PageView — once per page load per pixel
    } catch {
      /* tracking is non-fatal */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const trackEvent = useCallback((event: TrackingEventName, payload?: TrackingPayload) => {
    try {
      engine?.track(event, payload ?? {});
    } catch {
      /* tracking is non-fatal */
    }
  }, [engine]);

  const registerPixels = useCallback((extra: TrackingPixelView[]) => {
    try {
      engine?.registerPixels(extra);
    } catch {
      /* tracking is non-fatal */
    }
  }, [engine]);

  const setPageContext = useCallback((page: TrackingPageContext) => {
    engine?.setPage(page);
  }, [engine]);

  return (
    <TrackingContext.Provider value={{ trackEvent, registerPixels, setPageContext }}>
      {children}
    </TrackingContext.Provider>
  );
}

export function useTracking(): TrackingContextValue {
  return useContext(TrackingContext);
}
