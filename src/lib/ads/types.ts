/**
 * ONE SHAPE FOR EVERY AD PLATFORM.
 *
 * Meta, TikTok and Snapchat each answer a different API with a different
 * envelope, a different idea of what an account id looks like, and a
 * different way of expiring a token. What a seller wants from all three is
 * identical: is this connected, what campaigns are in it, and what did each
 * one spend.
 *
 * So the difference lives in an adapter and nowhere else. The routes, the
 * sync and the screen speak this interface and never name a platform — a
 * fourth one is a new file and a row in a list, not an `if` in six places.
 *
 * CREDENTIALS ARE A BAG, not a string, because the platforms disagree about
 * how many secrets a connection needs. Meta takes one long-lived token.
 * TikTok takes a token and the advertiser it belongs to. Snapchat's access
 * tokens die after thirty minutes, so it takes a client id, a secret and a
 * refresh token, and mints a fresh one on every call. A `token: string`
 * column would have forced the third of those into a lie.
 */

export type AdPlatform = 'META' | 'TIKTOK' | 'SNAPCHAT';

/** Whatever secrets one platform needs. Stored encrypted, as one JSON blob. */
export type AdCredentials = Record<string, string>;

export interface AdAccountInfo {
  /** The account as the platform names it, normalised. */
  id: string;
  name: string;
  currency: string;
  /** False for a disabled or suspended account — it connects and reports nothing. */
  active: boolean;
}

export interface RemoteCampaign {
  id: string;
  name: string;
  /** Normalised to ACTIVE / PAUSED / other, so the screen needs no per-platform map. */
  status: string;
}

export interface SpendRow {
  campaignId: string;
  campaignName: string;
  spend: number;
  impressions: number;
  clicks: number;
}

/** One field a seller has to fill in to connect this platform. */
export interface CredentialField {
  key: string;
  label: string;
  /** Rendered as a password field and never echoed back. */
  secret: boolean;
  placeholder: string;
  hint?: string;
}

export interface AdsAdapter {
  platform: AdPlatform;
  /** The full name, for a sentence that has room for it. */
  label: string;
  /**
   * One or two words, for a tab, a badge, or a sentence that already has a
   * clause in it. "نتحقق منها مع ميتا — فيسبوك وإنستغرام قبل الحفظ" is a
   * sentence the long name ruins.
   */
  short: string;
  /** What to ask for, in the order it should be asked. */
  fields: CredentialField[];
  /** Which field's value the four-character hint is taken from. */
  hintField: string;
  /** Where the seller goes to make the credentials, and how. */
  help: { url: string; urlLabel: string; steps: string[] };

  /** The account id in the platform's canonical form, or null if it is not one. */
  normalizeAccountId(raw: string): string | null;
  /** Does this open that account? Run BEFORE anything is stored. */
  verifyAccount(creds: AdCredentials, accountId: string): Promise<AdAccountInfo>;
  /** The campaigns in the account, for the seller to match ours against. */
  listCampaigns(creds: AdCredentials, accountId: string): Promise<RemoteCampaign[]>;
  /** What each campaign spent between two `YYYY-MM-DD` dates. */
  fetchSpend(creds: AdCredentials, accountId: string, since: string, until: string): Promise<SpendRow[]>;
  /** The platform's error, turned into something a seller can act on. */
  explainError(e: unknown): string;
}

/**
 * A failure that came from the platform rather than from us.
 *
 * Carries the platform's own code so each adapter can tell an expired token
 * from a missing permission — different fixes, and telling them apart is
 * the difference between a seller solving it and a seller calling you.
 */
export class AdsError extends Error {
  constructor(message: string, readonly code?: number | string) {
    super(message);
    this.name = 'AdsError';
  }
}

/** `YYYY-MM-DD` — the one date shape all three accept. */
export function adDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * A number out of an API that returns money as text.
 *
 * All three do it, and all three sometimes return an empty string. Number('')
 * is 0 but Number(undefined) is NaN, and a NaN reaching a Decimal column is
 * a write that throws halfway through a sync — some campaigns updated, some
 * not, and no way to tell which without reading the rows.
 */
export function money(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}
