'use client';

import { useEffect } from 'react';
import { useTracking } from '@/components/tracking/GlobalTrackingProvider';
import { TrackingPageContext, TrackingPixelView } from '@/lib/tracking/tracking-types';

/**
 * SELLING-PAGE TRACKING BRIDGE — registers the server-resolved pixels of the
 * page being rendered into the central engine and fires ViewContent once,
 * ONLY when the page has a trusted DB product. Payload values come from
 * server props (DB) exclusively.
 *
 * Landing pages pass page="LANDING_PAGES" (the default); storefront pages
 * pass "PUBLIC", so a pixel limited to landing pages never loads there. The
 * engine starts empty everywhere — this is the only way a pixel gets in.
 *
 * ViewContent is deduped by the engine (platform+pixelId+event) — React
 * re-renders cannot double-fire it.
 */
export function LandingTrackingPixels({
  pixels,
  viewContent,
  page = 'LANDING_PAGES',
}: {
  pixels: TrackingPixelView[];
  page?: TrackingPageContext;
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
    setPageContext(page);
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
