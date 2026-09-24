import { decryptSecret, encryptJson } from '@/lib/secrets';
import type { AdCredentials, AdPlatform, AdsAdapter } from './types';
import { metaAdapter } from './meta';
import { tiktokAdapter } from './tiktok';
import { snapchatAdapter } from './snapchat';

export * from './types';

/**
 * THE ONE PLACE THAT KNOWS WHICH PLATFORMS EXIST.
 *
 * Every route, the sync and the settings screen ask this file for an
 * adapter and then speak the interface. None of them names Meta, TikTok or
 * Snapchat anywhere — so a fourth platform is a new file and one line here,
 * not an `if` in six places that somebody will forget to update in five.
 *
 * The order is the order the seller sees in the picker.
 */
const ADAPTERS: Record<AdPlatform, AdsAdapter> = {
  META: metaAdapter,
  TIKTOK: tiktokAdapter,
  SNAPCHAT: snapchatAdapter,
};

export const AD_PLATFORMS: AdPlatform[] = ['META', 'TIKTOK', 'SNAPCHAT'];

export function isAdPlatform(v: unknown): v is AdPlatform {
  return typeof v === 'string' && (AD_PLATFORMS as string[]).includes(v);
}

/** The adapter for a platform, or null if it is not one we speak. */
export function adapterFor(platform: string): AdsAdapter | null {
  return isAdPlatform(platform) ? ADAPTERS[platform] : null;
}

/**
 * What the settings screen needs to draw the form, and nothing more.
 *
 * Fields, labels and instructions live with the adapter that needs them
 * rather than in the component, because the component cannot know that
 * Snapchat takes three secrets and Meta takes one. Serialisable on purpose:
 * this crosses to the client, and the functions must not.
 */
export function adPlatformOptions() {
  return AD_PLATFORMS.map((p) => {
    const a = ADAPTERS[p];
    return { platform: a.platform, label: a.label, short: a.short, fields: a.fields, help: a.help };
  });
}

/**
 * Credentials out of the stored blob.
 *
 * Accounts connected before there were three platforms hold the Meta token
 * as a bare encrypted string, not JSON. Reading those as `{ token }` is the
 * whole migration: no backfill, no window where a connected account stops
 * working because a deploy went out before a script ran.
 */
export function readCredentials(blob: string): AdCredentials {
  const raw = decryptSecret(blob);
  if (!raw.startsWith('{')) return { token: raw };
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { token: raw };
    const out: AdCredentials = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === 'string') out[k] = v;
    }
    return out;
  } catch {
    // A token that happens to begin with a brace. Unlikely, but a throw here
    // would break a working connection over a guess about its shape.
    return { token: raw };
  }
}

/** Credentials into the stored blob. Always JSON now, whatever the platform. */
export function writeCredentials(creds: AdCredentials): string {
  return encryptJson(creds);
}
