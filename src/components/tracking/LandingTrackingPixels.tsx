'use client';

import { useEffect } from 'react';
import { useTracking } from '@/components/tracking/GlobalTrackingProvider';
import { TrackingPixelView } from '@/lib/tracking/tracking-types';

/**
 * LANDING TRACKING BRIDGE — registers the server-resolved LANDING_PAGES
 * pixels for /lp/[slug] into the central engine and fires ViewContent
 * once, ONLY when the page has a trusted DB product. Payload values come
 * from server props (DB) exclusively.
 *
 * ViewContent is deduped by the engine (platform+pixelId+event) — React
 * re-renders cannot double-fire it.
 */
export function LandingTrackingPixels({
  pixels,
  viewContent,
}: {
  pixels: TrackingPixelView[];
  viewContent: {
    contentIds: string[]; // DB product ids
    contentName: string | null;
    value: number | null; // DB price
    currency: string;
  } | null;
}) {
  const { registerPixels, setPageContext, trackEvent } = useTracking();

  useEffect(() => {
    // Child effect → runs before the provider's PageView dispatch.
    setPageContext('LANDING_PAGES');
    registerPixels(pixels);
    if (viewContent && viewContent.contentIds.length > 0) {
      trackEvent('ViewContent', {
        contentIds: viewContent.contentIds,
        contentName: viewContent.contentName,
        value: viewContent.value,
        currency: viewContent.currency,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
