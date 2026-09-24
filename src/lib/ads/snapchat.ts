import {
  AdsError, money,
  type AdsAdapter, type AdCredentials, type AdAccountInfo, type RemoteCampaign, type SpendRow,
} from './types';

/**
 * READING SPEND OUT OF SNAPCHAT ADS.
 *
 * The one that is genuinely different. Snapchat's access tokens live about
 * thirty minutes — so there is nothing a seller could paste that would
 * still work tomorrow, let alone at 3am inside a scheduled sync.
 *
 * What lasts is a REFRESH token, and that is what we store, with the app's
 * client id and secret. Every call mints a fresh access token first and
 * throws it away after. Storing the short one instead would have produced a
 * connection that worked when the seller set it up and failed silently for
 * ever after, which is the worst shape a bug can take: it passes the test
 * the person performs.
 *
 * The minted token is never stored and never leaves this module.
 */

const BASE = process.env.SNAPCHAT_API_BASE || 'https://adsapi.snapchat.com/v1';
const TOKEN_URL = 'https://accounts.snapchat.com/login/oauth2/access_token';
const TIMEOUT_MS = 25_000;

/**
 * A fresh access token from the refresh token.
 *
 * Not cached across requests on purpose. A cache would need invalidating on
 * a credential change and would hold a live token in memory between
 * unrelated requests; minting one costs a round trip, and a sync makes a
 * handful of calls, not thousands.
 */
async function accessToken(creds: AdCredentials): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: creds.clientId,
        client_secret: creds.clientSecret,
        refresh_token: creds.refreshToken,
        grant_type: 'refresh_token',
      }),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.access_token) {
      throw new AdsError(json?.error_description || json?.error || 'تعذر تجديد رمز سناب شات', 'REFRESH');
    }
    return json.access_token as string;
  } catch (err) {
    if (err instanceof AdsError) throw err;
    if ((err as Error)?.name === 'AbortError') throw new AdsError('انتهت مهلة تجديد الرمز.');
    throw new AdsError('تعذر الوصول إلى سناب شات.');
  } finally {
    clearTimeout(timer);
  }
}

async function call<T>(path: string, token: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(`${BASE}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      throw new AdsError(
        json?.debug_message || json?.display_message || `Snapchat ${res.status}`,
        res.status
      );
    }
    return json as T;
  } catch (err) {
    if (err instanceof AdsError) throw err;
    if ((err as Error)?.name === 'AbortError') throw new AdsError('انتهت مهلة الاتصال بسناب شات.');
    throw new AdsError('تعذر الوصول إلى سناب شات.');
  } finally {
    clearTimeout(timer);
  }
}

/** Snapchat ad account ids are uuids. */
function normalizeAccountId(raw: string): string | null {
  const v = String(raw || '').trim().toLowerCase();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v) ? v : null;
}

export const snapchatAdapter: AdsAdapter = {
  platform: 'SNAPCHAT',
  label: 'سناب شات',
  short: 'سناب شات',
  // Three fields, and the reason is in the doc comment above: nothing a
  // seller can paste from Snapchat lasts more than half an hour except the
  // refresh token.
  fields: [
    { key: 'clientId', label: 'Client ID', secret: false, placeholder: 'من تطبيقك في Snap Business' },
    { key: 'clientSecret', label: 'Client Secret', secret: true, placeholder: '••••••••' },
    {
      key: 'refreshToken',
      label: 'Refresh Token',
      secret: true,
      placeholder: 'refresh token',
      hint: 'رموز سناب شات تنتهي خلال نصف ساعة — هذا الرمز وحده يدوم، ونجدّد منه في كل مرة.',
    },
  ],
  hintField: 'refreshToken',
  help: {
    url: 'https://businesshelp.snapchat.com/s/article/api-apps-oauth',
    urlLabel: 'Snapchat Business — OAuth',
    steps: [
      'افتح business.snapchat.com ← Business Details ← Apps، وأنشئ تطبيقاً.',
      'انسخ Client ID و Client Secret منه.',
      'نفّذ تدفّق OAuth مرة واحدة بصلاحية snapchat-marketing-api، واحتفظ بـ refresh_token من الرد.',
      'رقم الحساب الإعلاني (uuid) تجده في Ads Manager ← Account Settings.',
    ],
  },

  normalizeAccountId,

  async verifyAccount(creds: AdCredentials, accountId: string): Promise<AdAccountInfo> {
    const id = normalizeAccountId(accountId);
    if (!id) throw new AdsError('رقم الحساب الإعلاني غير صالح — يجب أن يكون uuid');

    const token = await accessToken(creds);
    const data = await call<{ adaccounts: { adaccount: { id: string; name: string; currency: string; status: string } }[] }>(
      `/adaccounts/${id}`,
      token
    );

    const acc = data?.adaccounts?.[0]?.adaccount;
    if (!acc) throw new AdsError('لم يُعثر على هذا الحساب', 'NOT_FOUND');

    return {
      id: acc.id,
      name: acc.name,
      currency: acc.currency,
      active: acc.status === 'ACTIVE',
    };
  },

  async listCampaigns(creds: AdCredentials, accountId: string): Promise<RemoteCampaign[]> {
    const id = normalizeAccountId(accountId);
    if (!id) throw new AdsError('رقم الحساب الإعلاني غير صالح');

    const token = await accessToken(creds);
    const data = await call<{ campaigns: { campaign: { id: string; name: string; status: string } }[] }>(
      `/adaccounts/${id}/campaigns`,
      token,
      { limit: '200' }
    );

    return (data?.campaigns ?? []).map((c) => ({
      id: c.campaign.id,
      name: c.campaign.name,
      status: c.campaign.status === 'ACTIVE' ? 'ACTIVE' : 'PAUSED',
    }));
  },

  async fetchSpend(creds: AdCredentials, accountId: string, since: string, until: string): Promise<SpendRow[]> {
    const id = normalizeAccountId(accountId);
    if (!id) throw new AdsError('رقم الحساب الإعلاني غير صالح');

    const token = await accessToken(creds);

    // Snapchat reports stats per campaign, not per account with a campaign
    // dimension — so the campaigns come first and the stats hang off them.
    const campaigns = await this.listCampaigns(creds, accountId);
    if (campaigns.length === 0) return [];

    const data = await call<{
      total_stats: { total_stat: { id: string; stats: Record<string, number> } }[];
    }>(`/adaccounts/${id}/stats`, token, {
      granularity: 'TOTAL',
      // Snapchat wants full ISO timestamps, not plain dates.
      start_time: `${since}T00:00:00.000Z`,
      end_time: `${until}T23:59:59.000Z`,
      fields: 'spend,impressions,swipes',
      breakdown: 'campaign',
    });

    const names = new Map(campaigns.map((c) => [c.id, c.name]));

    return (data?.total_stats ?? []).map((row) => {
      const s = row.total_stat;
      return {
        campaignId: s.id,
        campaignName: names.get(s.id) ?? '',
        // Snapchat reports money in MICROS. Reporting a $500 campaign as
        // 500,000,000 would make every ROAS on the screen absurd, and it is
        // the single most likely thing to get wrong here.
        spend: Number((money(s.stats?.spend) / 1_000_000).toFixed(2)),
        impressions: money(s.stats?.impressions),
        clicks: money(s.stats?.swipes),
      };
    });
  },

  explainError(e: unknown): string {
    if (!(e instanceof AdsError)) return 'تعذر الاتصال بسناب شات';
    const msg = e.message || '';

    if (e.code === 'REFRESH') {
      return `تعذر تجديد الرمز: ${msg}. تحقق من Client ID والسر و refresh token.`;
    }
    if (e.code === 401) return 'الرمز مرفوض. جدّد refresh token من تطبيقك.';
    if (e.code === 403) return 'التطبيق لا يملك صلاحية على هذا الحساب الإعلاني.';
    if (e.code === 404 || e.code === 'NOT_FOUND') return 'الحساب الإعلاني غير موجود أو لا يراه هذا التطبيق.';
    if (e.code === 429) return 'سناب شات أوقفت الطلبات مؤقتاً لكثرتها. أعد المحاولة بعد قليل.';
    return msg;
  },
};
