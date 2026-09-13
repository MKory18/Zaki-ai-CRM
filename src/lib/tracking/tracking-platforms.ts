/**
 * GLOBAL TRACKING â€” platform adapters (browser only).
 *
 * Each adapter owns ONE hard-coded platform loader. The only dynamic value
 * is a pre-validated Pixel ID. Event names are mapped from the central
 * allowlist to each platform's official browser event names â€” a client can
 * never introduce arbitrary events or arbitrary tracking code.
 *
 * TikTok: official browser pixel (ttq) â€” Pageview/ViewContent/
 *         InitiateCheckout/CompletePayment.
 * Snapchat: official Snap Pixel (snaptr) â€” PAGE_VIEW/VIEW_CONTENT/
 *         START_CHECKOUT/PURCHASE.
 * Meta: standard fbevents.js base code (unchanged behavior from Phase 3).
 */

import {
  sanitizeTrackingPayload,
  TrackingEventName,
  TrackingPayload,
  TrackingPlatform,
} from './tracking-types';

/* eslint-disable @typescript-eslint/no-explicit-any */

type QueueFn = any;

declare global {
  interface Window {
    fbq?: QueueFn;
    ttq?: any;
    snaptr?: QueueFn;
    TiktokAnalyticsObject?: string;
  }
}

export interface TrackingAdapter {
  platform: TrackingPlatform;
  /** Load the platform script + register this pixel. Once per pixelId. */
  init(pixelId: string): void;
  /** Fire an allowlisted event for this pixel (payload pre-sanitized). */
  track(event: TrackingEventName, payload: TrackingPayload, pixelId: string): void;
}

function loadScript(src: string) {
  if (document.querySelector(`script[src="${src}"]`)) return;
  const s = document.createElement('script');
  s.async = true;
  s.src = src;
  document.head.appendChild(s);
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ Meta / Facebook â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const FB_SCRIPT_SRC = 'https://connect.facebook.net/en_US/fbevents.js';
const META_EVENTS: Record<TrackingEventName, string | null> = {
  PageView: 'PageView',
  ViewContent: 'ViewContent',
  InitiateCheckout: 'InitiateCheckout',
  Purchase: 'Purchase',
};

function metaParams(payload: TrackingPayload): Record<string, unknown> {
  const p = sanitizeTrackingPayload(payload);
  const out: Record<string, unknown> = { content_type: 'product' };
  if (p.content_ids) out.content_ids = p.content_ids;
  if (p.content_name) out.content_name = p.content_name;
  if (p.value != null) {
    out.value = p.value;
    out.currency = p.currency || 'USD';
  }
  return out;
}

const metaAdapter: TrackingAdapter = {
  platform: 'META',
  init(pixelId) {
    const w = window as any;
    if (!w.fbq) {
      const n: QueueFn = (w.fbq = function (...args: any[]) {
        n.callMethod ? n.callMethod.apply(n, args) : n.queue!.push(args);
      }) as QueueFn;
      if (!w._fbq) w._fbq = n;
      n.push = n;
      n.loaded = true;
      n.version = '2.0';
      n.queue = [];
      loadScript(FB_SCRIPT_SRC);
    }
    w.fbq('init', pixelId);
  },
  track(event, payload, pixelId) {
    const name = META_EVENTS[event];
    if (!name) return; // allowlist guard (unreachable by typing)
    const w = window as any;
    if (!w.fbq) return; // pixel not initialized â†’ fail closed
    try {
      w.fbq('trackSingle', pixelId, name, metaParams(payload));
    } catch {
      /* tracking is non-fatal */
    }
  },
};

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ TikTok â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const TIKTOK_SCRIPT_SRC = 'https://analytics.tiktok.com/i18n/pixel/events.js';
const TIKTOK_EVENTS: Record<TrackingEventName, string | null> = {
  PageView: 'Pageview',
  ViewContent: 'ViewContent',
  InitiateCheckout: 'InitiateCheckout',
  Purchase: 'CompletePayment',
};

function tiktokParams(payload: TrackingPayload): Record<string, unknown> {
  const p = sanitizeTrackingPayload(payload);
  const ids = p.content_ids as string[] | undefined;
  const out: Record<string, unknown> = {};
  if (ids?.length) {
    out.content_id = ids[0];
    out.content_type = 'product';
  }
  if (p.content_name) out.content_name = p.content_name;
  if (p.value != null) {
    out.value = p.value;
    out.currency = p.currency || 'USD';
  }
  return out;
}

const tiktokAdapter: TrackingAdapter = {
  platform: 'TIKTOK',
  init(pixelId) {
    const w = window as any;
    if (!w.ttq) {
      w.TiktokAnalyticsObject = 'ttq';
      const ttq: any = (w.ttq = []);
      ttq.methods = ['page', 'track', 'identify', 'instances', 'debug', 'on', 'off', 'once', 'ready', 'alias', 'group', 'enableCookie', 'disableCookie'];
      ttq.setAndDefer = function (obj: any, method: string) {
        obj[method] = function (...args: any[]) {
          obj.push([method].concat(args));
        };
      };
      for (const m of ttq.methods) ttq.setAndDefer(ttq, m);
      ttq.load = function (id: string) {
        const url = `${TIKTOK_SCRIPT_SRC}?sdkid=${encodeURIComponent(id)}&lib=ttq`;
        loadScript(url);
      };
    }
    w.ttq.load(pixelId);
    w.ttq.page();
  },
  track(event, payload) {
    const name = TIKTOK_EVENTS[event];
    if (!name) return;
    const w = window as any;
    if (!w.ttq?.track) return;
    try {
      w.ttq.track(name, tiktokParams(payload));
    } catch {
      /* tracking is non-fatal */
    }
  },
};

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ Snapchat â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const SNAP_SCRIPT_SRC = 'https://sc-static.net/scevent.min.js';
const SNAP_EVENTS: Record<TrackingEventName, string | null> = {
  PageView: 'PAGE_VIEW',
  ViewContent: 'VIEW_CONTENT',
  InitiateCheckout: 'START_CHECKOUT',
  Purchase: 'PURCHASE',
};

function snapParams(payload: TrackingPayload): Record<string, unknown> {
  const p = sanitizeTrackingPayload(payload);
  const ids = p.content_ids as string[] | undefined;
  const out: Record<string, unknown> = {};
  if (ids?.length) out.item_ids = ids;
  if (p.content_name) out.item_names = [p.content_name];
  if (p.value != null) {
    out.price = p.value;
    out.currency = p.currency || 'USD';
  }
  if (p.order_id) out.transaction_id = p.order_id;
  return out;
}

const snapAdapter: TrackingAdapter = {
  platform: 'SNAPCHAT',
  init(pixelId) {
    const w = window as any;
    if (!w.snaptr) {
      const n: QueueFn = (w.snaptr = function (...args: any[]) {
        n.handleRequest ? n.handleRequest.apply(n, args) : n.queue!.push(args);
      }) as QueueFn;
      n.queue = [];
      loadScript(SNAP_SCRIPT_SRC);
    }
    try {
      w.snaptr('init', pixelId);
    } catch {
      /* non-fatal */
    }
  },
  track(event, payload) {
    const name = SNAP_EVENTS[event];
    if (!name) return;
    const w = window as any;
    if (!w.snaptr) return;
    try {
      w.snaptr('track', name, snapParams(payload));
    } catch {
      /* non-fatal */
    }
  },
};

export const TRACKING_ADAPTERS: Record<TrackingPlatform, TrackingAdapter> = {
  META: metaAdapter,
  TIKTOK: tiktokAdapter,
  SNAPCHAT: snapAdapter,
};
