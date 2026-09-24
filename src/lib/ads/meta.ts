import type { AdsAdapter } from './types';
/**
 * READING SPEND OUT OF META ADS.
 *
 * The half of a campaign this system cannot witness. Everything else — the
 * orders, the confirmations, the deliveries, the money collected — is our
 * own record; what an advert cost is Meta's, and until now the seller typed
 * it in from their Ads Manager.
 *
 * Three calls, and no more: check the token, list the campaigns so a seller
 * can say which of ours is which of theirs, and pull spend for a window.
 * This is deliberately NOT a Meta client library. Everything an ad platform
 * can do is not something a shop's codebase should know how to do, and each
 * extra endpoint is another thing to keep working when Meta changes it.
 *
 * The token never leaves the server and is never logged. Errors from Meta
 * are passed through as their own words — a seller who can read "token has
 * expired" can fix it; one who reads "sync failed" cannot.
 */

/**
 * Pinned, not `latest`. Meta deprecates a version roughly every two years
 * and changes field shapes between them; a floating version means the sync
 * breaks on a day nobody deployed anything, which is the worst kind of
 * breakage to diagnose.
 */
const API_VERSION = process.env.META_API_VERSION || 'v23.0';
const BASE = `https://graph.facebook.com/${API_VERSION}`;

/** Long enough for a slow report, short enough not to hang a request. */
const TIMEOUT_MS = 25_000;

export class MetaError extends Error {
  constructor(message: string, readonly code?: number, readonly subcode?: number) {
    super(message);
    this.name = 'MetaError';
  }
}

/**
 * `act_` is how Meta names an ad account, and sellers paste it both ways.
 *
 * Accepting the bare number and adding the prefix is not leniency for its
 * own sake: the id is copied out of a URL as often as out of the account
 * picker, and refusing one of those forms produces a support message rather
 * than a connection.
 */
export function normalizeAccountId(raw: string): string | null {
  const trimmed = String(raw || '').trim();
  const m = /^(?:act_)?(\d{5,25})$/.exec(trimmed);
  return m ? `act_${m[1]}` : null;
}

async function call<T>(path: string, token: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(`${BASE}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      // The token rides in the header, not the query string: a URL ends up
      // in logs, in proxies and in error reports, and a token in any of
      // those is a token to rotate.
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await res.json().catch(() => null);

    if (!res.ok || json?.error) {
      const e = json?.error;
      throw new MetaError(
        e?.message || `Meta answered ${res.status}`,
        e?.code,
        e?.error_subcode
      );
    }
    return json as T;
  } catch (err) {
    if (err instanceof MetaError) throw err;
    if ((err as Error)?.name === 'AbortError') {
      throw new MetaError('انتهت مهلة الاتصال بميتا. حاول مرة أخرى.');
    }
    throw new MetaError('تعذر الوصول إلى ميتا. تحقق من الإنترنت.');
  } finally {
    clearTimeout(timer);
  }
}

export interface MetaAccount {
  id: string;
  name: string;
  currency: string;
  /** Meta's own account status: 1 is active, everything else is not. */
  active: boolean;
}

/**
 * Does this token open this account, and what is the account called?
 *
 * Run before anything is stored. A token saved without being tried is a
 * token that fails at 3am inside a scheduled sync, where nobody is watching
 * and the error goes into a log instead of onto the screen of the person
 * who could fix it.
 */
export async function verifyAccount(token: string, accountId: string): Promise<MetaAccount> {
  const id = normalizeAccountId(accountId);
  if (!id) throw new MetaError('رقم الحساب الإعلاني غير صالح — يجب أن يكون أرقاماً أو act_ ثم أرقام');

  const data = await call<{ id: string; name: string; currency: string; account_status: number }>(
    id,
    token,
    { fields: 'id,name,currency,account_status' }
  );

  return {
    id: data.id,
    name: data.name,
    currency: data.currency,
    active: data.account_status === 1,
  };
}

export interface MetaCampaign {
  id: string;
  name: string;
  status: string;
  objective: string | null;
}

/**
 * The campaigns in the account, for the seller to match against ours.
 *
 * Matching happens ONCE, by hand, and then by id forever. Matching by name
 * automatically would break the first time somebody renamed a campaign in
 * Ads Manager — which people do constantly — and it would break silently,
 * with the spend quietly attaching to nothing.
 */
export async function listCampaigns(token: string, accountId: string, limit = 200): Promise<MetaCampaign[]> {
  const id = normalizeAccountId(accountId);
  if (!id) throw new MetaError('رقم الحساب الإعلاني غير صالح');

  const data = await call<{ data: { id: string; name: string; status: string; objective?: string }[] }>(
    `${id}/campaigns`,
    token,
    { fields: 'id,name,status,objective', limit: String(Math.min(limit, 500)) }
  );

  return (data.data ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    status: c.status,
    objective: c.objective ?? null,
  }));
}

export interface MetaSpendRow {
  campaignId: string;
  campaignName: string;
  spend: number;
  impressions: number;
  clicks: number;
}

/**
 * What each campaign spent between two dates.
 *
 * Asked at the CAMPAIGN level and not the account level, because a seller
 * running four campaigns needs four numbers; one total tells them the month
 * was expensive and nothing about which advert to switch off.
 *
 * Dates are `YYYY-MM-DD` in the ad account's own timezone, which is what
 * Meta uses and what the seller sees in Ads Manager. Converting to ours
 * would make our figure disagree with theirs by a day's spend at the edges,
 * and they would rightly trust theirs.
 */
export async function fetchSpend(
  token: string,
  accountId: string,
  since: string,
  until: string
): Promise<MetaSpendRow[]> {
  const id = normalizeAccountId(accountId);
  if (!id) throw new MetaError('رقم الحساب الإعلاني غير صالح');

  const data = await call<{
    data: { campaign_id: string; campaign_name: string; spend?: string; impressions?: string; clicks?: string }[];
  }>(`${id}/insights`, token, {
    level: 'campaign',
    fields: 'campaign_id,campaign_name,spend,impressions,clicks',
    time_range: JSON.stringify({ since, until }),
    limit: '500',
  });

  return (data.data ?? []).map((r) => ({
    campaignId: r.campaign_id,
    campaignName: r.campaign_name,
    // Meta returns money as a STRING. Number('') is 0 and Number(undefined)
    // is NaN, and a NaN reaching a Decimal column is a write that throws
    // halfway through a sync.
    spend: Number(r.spend ?? 0) || 0,
    impressions: Number(r.impressions ?? 0) || 0,
    clicks: Number(r.clicks ?? 0) || 0,
  }));
}

/** `YYYY-MM-DD`, which is the only date shape Meta's time_range accepts. */
export function metaDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Turn a Meta error into something a seller can act on.
 *
 * Their messages are written for developers. These four are the ones a shop
 * actually hits, and each has a different fix — telling them apart is the
 * difference between a seller solving it and a seller calling you.
 */
export function explainMetaError(e: unknown): string {
  if (!(e instanceof MetaError)) return 'تعذر الاتصال بميتا';
  const msg = e.message || '';

  if (e.code === 190 || /expired|invalid.*token|session/i.test(msg)) {
    return 'انتهت صلاحية الرمز أو أُلغي. أنشئ رمزاً جديداً من مدير الأعمال والصقه هنا.';
  }
  if (e.code === 200 || e.code === 10 || /permission/i.test(msg)) {
    return 'الرمز لا يملك صلاحية ads_read على هذا الحساب. تأكد أن مستخدم النظام معيَّن على الحساب الإعلاني.';
  }
  if (e.code === 100 && /does not exist|cannot be loaded|Unsupported get/i.test(msg)) {
    return 'رقم الحساب غير موجود أو لا يراه هذا الرمز. تحقق من الرقم.';
  }
  if (e.code === 17 || e.code === 4 || /rate limit|too many/i.test(msg)) {
    return 'ميتا أوقفت الطلبات مؤقتاً لكثرتها. أعد المحاولة بعد قليل.';
  }
  // Meta's own words beat a summary of them: a message we did not anticipate
  // is still a message the seller can search for.
  return msg;
}

/**
 * Meta through the shared interface.
 *
 * The functions above stay exported as they were — they are what the tests
 * exercise, and a wrapper is a thin place to hide a bug. This only reshapes
 * them into the contract the routes speak, so that adding a platform is a
 * new file rather than an `if` in six places.
 */
export const metaAdapter: AdsAdapter = {
  platform: 'META',
  label: 'ميتا — فيسبوك وإنستغرام',
  short: 'ميتا',
  fields: [
    {
      key: 'token',
      label: 'رمز الوصول',
      secret: true,
      placeholder: 'EAAG...',
      hint: 'رمز مستخدم النظام لا تنتهي صلاحيته كرموز المستخدم العادية.',
    },
  ],
  hintField: 'token',
  help: {
    url: 'https://business.facebook.com/settings/system-users',
    urlLabel: 'مدير الأعمال — مستخدمو النظام',
    steps: [
      'أنشئ مستخدم نظام بدور Admin.',
      'Assign Assets ← عيّن حسابك الإعلاني عليه بصلاحية Manage campaigns.',
      'Generate New Token ← اختر تطبيقك وفعّل ads_read وحدها.',
      'رقم الحساب في مدير الإعلانات أعلى الصفحة، أو في الرابط بعد act=.',
    ],
  },

  normalizeAccountId,
  verifyAccount: (creds, accountId) => verifyAccount(creds.token, accountId),
  listCampaigns: (creds, accountId) => listCampaigns(creds.token, accountId),
  fetchSpend: (creds, accountId, since, until) => fetchSpend(creds.token, accountId, since, until),
  explainError: explainMetaError,
};
