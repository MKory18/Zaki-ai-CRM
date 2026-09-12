'use client';

import { useEffect, useRef } from 'react';
import { META_PIXEL_EVENTS, PixelViewContent, validatePixelId } from '@/lib/landing-tracking';

/**
 * META PIXEL (browser) — trusted public-page component.
 *
 *  - Standard, hard-coded Meta browser Pixel base code. The ONLY dynamic
 *    value is the validated numeric Pixel ID (regex-checked before render).
 *  - Client-side only (useEffect) — no window/document/fbq during SSR,
 *    no hydration mismatch, nothing rendered.
 *  - Fires PageView once per page load, and ViewContent once when the page
 *    has a DB product. Payloads come from DB props only — never from the
 *    custom HTML. No PII is ever included.
 *  - Never rendered in the dashboard or in the editor preview.
 */

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
  }
}

const FB_SCRIPT_SRC = 'https://connect.facebook.net/en_US/fbevents.js';

export function MetaPixel({
  pixelId,
  viewContent,
}: {
  /** pre-validated by pixelActive() — digits only */
  pixelId: string;
  viewContent: {
    contentIds: string[]; // DB product ids
    contentName: string | null;
    value: number | null; // DB price
    currency: string;
  } | null;
}) {
  const initialized = useRef(false);

  useEffect(() => {
    // Guard: one initialization per page load, immune to React re-renders.
    if (initialized.current) return;
    initialized.current = true;

    if (!validatePixelId(pixelId)) return; // fail closed: invalid → no Pixel

    // ── Standard Meta Pixel base code (hard-coded; pixelId is digits-only) ──
    /* eslint-disable */
    const w = window as any;
    if (!w.fbq) {
      const n: any = (w.fbq = function (...args: unknown[]) {
        n.callMethod ? n.callMethod.apply(n, args) : n.queue.push(args);
      });
      if (!w._fbq) w._fbq = n;
      n.push = n;
      n.loaded = true;
      n.version = '2.0';
      n.queue = [];
      const t = document.createElement('script');
      t.async = true;
      t.src = FB_SCRIPT_SRC;
      document.head.appendChild(t);
    }
    /* eslint-enable */
    w.fbq('init', pixelId);
    w.fbq('track', META_PIXEL_EVENTS[0]); // PageView — once per page load

    // ViewContent — only when the page has a DB product
    if (viewContent && viewContent.contentIds.length > 0) {
      const payload: Record<string, unknown> = {
        content_type: 'product',
        content_ids: viewContent.contentIds,
      };
      if (viewContent.contentName) payload.content_name = viewContent.contentName;
      if (viewContent.value != null) {
        payload.value = viewContent.value;
        payload.currency = viewContent.currency || 'USD';
      }
      w.fbq('track', META_PIXEL_EVENTS[1], payload);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Renders nothing — pure tracking side-effect
  return null;
}