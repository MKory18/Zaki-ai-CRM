/**
 * GLOBAL TRACKING — central dispatch engine (testable, framework-free).
 *
 *   TrackingEngine
 *     -> getActivePixels()   (enabled + scope-matching, re-validated)
 *     -> dedupe              (platform + pixelId + event [+ order])
 *     -> dispatch            -> MetaAdapter | TikTokAdapter | SnapchatAdapter
 *
 * Guarantees:
 *  - PageView: once per page load per pixel.
 *  - InitiateCheckout: callers gate on interaction; engine dedupes too.
 *  - Purchase: deduped by platform+pixelId+orderNumber — React re-renders
 *    or repeat submissions can never double-fire.
 *  - A disabled pixel, an out-of-scope pixel, or an unconsented pixel is
 *    never contacted. An invalid pixelId never loads a script.
 *  - No pixels configured → everything is a no-op (zero network/script).
 */

import {
  allowAllConsent,
  filterPixelsForPage,
  sanitizeTrackingPayload,
  TrackingConsentGate,
  TrackingEventName,
  TrackingPageContext,
  TrackingPayload,
  TrackingPixelView,
  trackingEventKey,
} from './tracking-types';
import { validateTrackingPixelId } from './tracking-validation';
import { TRACKING_ADAPTERS, TrackingAdapter } from './tracking-platforms';

export interface EngineAdapters {
  META: TrackingAdapter;
  TIKTOK: TrackingAdapter;
  SNAPCHAT: TrackingAdapter;
}

export interface TrackingEngineOptions {
  pixels: TrackingPixelView[];
  page: TrackingPageContext;
  adapters?: EngineAdapters;
  consent?: TrackingConsentGate;
}

export class TrackingEngine {
  private pixels: TrackingPixelView[];
  private page: TrackingPageContext;
  private readonly adapters: EngineAdapters;
  private readonly consent: TrackingConsentGate;
  private readonly fired = new Set<string>();
  private readonly initializedPixels = new Set<string>();

  constructor({ pixels, page, adapters, consent }: TrackingEngineOptions) {
    this.pixels = pixels;
    this.page = page;
    this.adapters = adapters ?? TRACKING_ADAPTERS;
    this.consent = consent ?? allowAllConsent;
  }

  /** Enabled, scope-matching, re-validated pixels — the only active set. */
  getActivePixels(): TrackingPixelView[] {
    return filterPixelsForPage(this.pixels, this.page).filter(
      (p) => validateTrackingPixelId(p.platform, p.pixelId) !== null
    );
  }

  registerPixels(pixels: TrackingPixelView[]): void {
    const known = new Set(this.pixels.map((p) => p.id));
    for (const p of pixels) {
      if (p && typeof p.id === 'string' && !known.has(p.id)) {
        this.pixels.push(p);
        known.add(p.id);
      }
    }
  }

  /** Narrow/widen the page context (e.g. landing page mounts). */
  setPage(page: TrackingPageContext): void {
    this.page = page;
  }

  /** Load each platform script once per pixel, then fire PageView once. */
  initAll(): void {
    for (const pixel of this.getActivePixels()) {
      if (!this.consent(pixel.platform, pixel.scope)) continue;
      if (!this.initializedPixels.has(pixel.id)) {
        this.initializedPixels.add(pixel.id);
        try {
          this.adapters[pixel.platform].init(pixel.pixelId);
        } catch {
          /* script loading is non-fatal */
        }
      }
      this.track('PageView', {}, pixel);
    }
  }

  /** Dispatch an event to every active pixel, with per-pixel dedupe. */
  track(event: TrackingEventName, payload: TrackingPayload, target?: TrackingPixelView): void {
    const pixels = target ? this.getActivePixels().filter((p) => p.id === target.id) : this.getActivePixels();
    if (pixels.length === 0) return;
    const safe = sanitizeTrackingPayload(payload);
    // ViewContent fires ONLY when there is a trusted DB product attached.
    if (event === 'ViewContent' && !Array.isArray(safe.content_ids)) return;
    for (const pixel of pixels) {
      if (!this.consent(pixel.platform, pixel.scope)) continue;
      const key = trackingEventKey(pixel.platform, pixel.pixelId, event, safe.order_id as string | undefined);
      if (this.fired.has(key)) continue; // dedupe — never double-fire
      this.fired.add(key);
      try {
        // Adapters receive the SANITIZED payload — PII/tampered fields can
        // never reach a platform even if an adapter forgets to sanitize.
        this.adapters[pixel.platform].track(event, safe, pixel.pixelId);
      } catch {
        /* tracking is non-fatal */
      }
    }
  }
}
