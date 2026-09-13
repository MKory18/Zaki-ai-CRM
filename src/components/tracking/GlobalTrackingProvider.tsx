'use client';

import React, { createContext, useCallback, useContext, useEffect, useRef } from 'react';
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
  const engineRef = useRef<TrackingEngine | null>(null);
  if (!engineRef.current && typeof window !== 'undefined') {
    engineRef.current = new TrackingEngine({ pixels, page: 'PUBLIC' });
  }
  const pageViewFiredRef = useRef(false);

  useEffect(() => {
    // Child effects (landing pixel registration) already ran — dispatch now.
    if (pageViewFiredRef.current) return;
    pageViewFiredRef.current = true;
    try {
      engineRef.current?.initAll(); // PageView — once per page load per pixel
    } catch {
      /* tracking is non-fatal */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const trackEvent = useCallback((event: TrackingEventName, payload?: TrackingPayload) => {
    try {
      engineRef.current?.track(event, payload ?? {});
    } catch {
      /* tracking is non-fatal */
    }
  }, []);

  const registerPixels = useCallback((extra: TrackingPixelView[]) => {
    try {
      engineRef.current?.registerPixels(extra);
    } catch {
      /* tracking is non-fatal */
    }
  }, []);

  const setPageContext = useCallback((page: TrackingPageContext) => {
    engineRef.current?.setPage(page);
  }, []);

  return (
    <TrackingContext.Provider value={{ trackEvent, registerPixels, setPageContext }}>
      {children}
    </TrackingContext.Provider>
  );
}

export function useTracking(): TrackingContextValue {
  return useContext(TrackingContext);
}
