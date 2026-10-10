import {
  AdsError, adDate, money, adTime,
  type AdsAdapter, type AdCredentials, type AdAccountInfo, type RemoteCampaign, type SpendRow,
} from './types';

/**
 * READING SPEND OUT OF TIKTOK ADS.
 *
 * Two things differ from Meta enough to be worth naming.
 *
 * TikTok answers 200 for everything and puts the failure INSIDE the body:
 * `{ code: 40001, message: "..." }`. Checking `res.ok` here would report a
 * permission error as a success and then fail on a missing field, twenty
 * lines later, with a message about `undefined`. The code is the answer.
 *
 * And its reporting endpoint wants arrays as JSON inside query parameters —
 * `dimensions=["campaign_id"]` — which is unusual enough that getting it
 * wrong returns an empty report rather than an error. An empty report and
 * "you spent nothing" look identical to a seller.
 */

const BASE = process.env.TIKTOK_API_BASE || 'https://business-api.tiktok.com/open_api/v1.3';
const TIMEOUT_MS = 25_000;

interface TikTokEnvelope<T> {
  code: number;
  message: string;
  data: T;
}

async function call<T>(path: string, token: string, params: Record<string, string>): Promise<T> {
  const url = new URL(`${BASE}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      // TikTok's own header name. Not Authorization, and not the query
      // string — a token in a URL ends up in logs and proxies.
      headers: { 'Access-Token': token, 'Content-Type': 'application/json' },
    });
    const body = (await res.json().catch(() => null)) as TikTokEnvelope<T> | null;

    if (!body) throw new AdsError('تيك توك أرجعت رداً غير مفهوم');
    // The envelope decides, not the status line. 0 is the only success.
    if (body.code !== 0) throw new AdsError(body.message || `TikTok ${body.code}`, body.code);
    return body.data;
  } catch (err) {
    if (err instanceof AdsError) throw err;
    if ((err as Error)?.name === 'AbortError') throw new AdsError('انتهت مهلة الاتصال بتيك توك.');
    throw new AdsError('تعذر الوصول إلى تيك توك. تحقق من الإنترنت.');
  } finally {
    clearTimeout(timer);
  }
}

/** TikTok advertiser ids are plain digits, usually nineteen of them. */
function normalizeAccountId(raw: string): string | null {
  const m = /^(\d{6,25})$/.exec(String(raw || '').trim());
  return m ? m[1] : null;
}

export const tiktokAdapter: AdsAdapter = {
  platform: 'TIKTOK',
  label: 'تيك توك',
  short: 'تيك توك',
  fields: [
    {
      key: 'token',
      label: 'رمز الوصول',
      secret: true,
      placeholder: 'access token',
      hint: 'من TikTok for Business ← تطبيقك ← Access Token. طويل الأمد ولا ينتهي كل شهرين.',
    },
  ],
  hintField: 'token',
  help: {
    url: 'https://business-api.tiktok.com/portal/docs?id=1738373141733378',
    urlLabel: 'TikTok for Business — Marketing API',
    steps: [
      'افتح business.tiktok.com ← Assets ← Events / Developers، وأنشئ تطبيقاً (App) إن لم يكن لديك.',
      'اطلب صلاحية Ads Management أو Reporting — لا نحتاج أكثر من القراءة.',
      'وافق على التطبيق من حسابك الإعلاني، ثم انسخ الـ Access Token الطويل الأمد.',
      'رقم المعلن (Advertiser ID) تجده في مدير الإعلانات أعلى الصفحة — أرقام فقط.',
    ],
  },

  normalizeAccountId,

  async verifyAccount(creds: AdCredentials, accountId: string): Promise<AdAccountInfo> {
    const id = normalizeAccountId(accountId);
    if (!id) throw new AdsError('رقم المعلن غير صالح — أرقام فقط');

    const data = await call<{ list: { advertiser_id: string; advertiser_name: string; currency: string; status: string }[] }>(
      '/advertiser/info/',
      creds.token,
      // An array, JSON-encoded, inside a query parameter. TikTok's shape.
      { advertiser_ids: JSON.stringify([id]) }
    );

    const acc = data?.list?.[0];
    if (!acc) throw new AdsError('لم يُعثر على هذا المعلن بهذا الرمز', 'NOT_FOUND');

    return {
      id: acc.advertiser_id,
      name: acc.advertiser_name,
      currency: acc.currency,
      active: acc.status === 'STATUS_ENABLE',
    };
  },

  /**
   * THE ADVERTISERS THIS TOKEN ADMINISTERS.
   *
   * TikTok answers `/oauth2/advertiser/get/` with ids and names, and it is
   * the ONLY way to learn them: an access token from a consent carries no
   * advertiser, and every other endpoint requires one.
   *
   * `app_id` and `secret` are required by this endpoint specifically —
   * unlike every other TikTok call, which takes only the token. They are
   * read from the environment rather than from the stored credentials
   * because they are the PRODUCT's app, not the seller's.
   */
  async listAccounts(creds: AdCredentials): Promise<AdAccountInfo[]> {
    const data = await call<{ list: { advertiser_id: string; advertiser_name: string }[] }>(
      '/oauth2/advertiser/get/',
      creds.token,
      {
        app_id: process.env.TIKTOK_APP_ID ?? '',
        secret: process.env.TIKTOK_APP_SECRET ?? '',
      }
    );

    return (data?.list ?? []).map((a) => ({
      id: a.advertiser_id,
      name: a.advertiser_name || a.advertiser_id,
      // This endpoint does not report currency or status; both are learned
      // by `verifyAccount` on the account the seller keeps. Reporting a
      // guess here would be a figure nobody measured.
      currency: '',
      active: true,
    }));
  },

  async listCampaigns(creds: AdCredentials, accountId: string): Promise<RemoteCampaign[]> {
    const id = normalizeAccountId(accountId);
    if (!id) throw new AdsError('رقم المعلن غير صالح');

    const data = await call<{
      list: {
        campaign_id: string;
        campaign_name: string;
        operation_status: string;
        schedule_start_time?: string;
        create_time?: string;
      }[];
    }>('/campaign/get/', creds.token, { advertiser_id: id, page_size: '200' });

    return (data?.list ?? []).map((c) => ({
      id: c.campaign_id,
      name: c.campaign_name,
      // Normalised here so the screen needs no per-platform vocabulary.
      status: c.operation_status === 'ENABLE' ? 'ACTIVE' : 'PAUSED',
      /*
       * THE SCHEDULED START, falling back to when it was created.
       *
       * TikTok returns both, and they differ: a campaign built on Monday to
       * begin on Friday has a `create_time` of Monday. The window we want
       * is when it started SPENDING, so the schedule wins — and the
       * creation time is a floor rather than nothing, because a window
       * starting a few days early reports the same spend, while one
       * starting LATE loses the first days of it.
       */
      startedAt: adTime(c.schedule_start_time) ?? adTime(c.create_time),
    }));
  },

  async fetchSpend(creds: AdCredentials, accountId: string, since: string, until: string): Promise<SpendRow[]> {
    const id = normalizeAccountId(accountId);
    if (!id) throw new AdsError('رقم المعلن غير صالح');

    const data = await call<{
      list: { dimensions: { campaign_id: string }; metrics: Record<string, string> }[];
    }>('/report/integrated/get/', creds.token, {
      advertiser_id: id,
      report_type: 'BASIC',
      // Campaign level, because four campaigns need four numbers. One total
      // says the month was expensive and nothing about which ad to stop.
      data_level: 'AUCTION_CAMPAIGN',
      dimensions: JSON.stringify(['campaign_id']),
      metrics: JSON.stringify(['campaign_name', 'spend', 'impressions', 'clicks']),
      start_date: since,
      end_date: until,
      page_size: '500',
    });

    return (data?.list ?? []).map((r) => ({
      campaignId: r.dimensions.campaign_id,
      campaignName: r.metrics.campaign_name ?? '',
      spend: money(r.metrics.spend),
      impressions: money(r.metrics.impressions),
      clicks: money(r.metrics.clicks),
    }));
  },

  explainError(e: unknown): string {
    if (!(e instanceof AdsError)) return 'تعذر الاتصال بتيك توك';
    const code = Number(e.code);
    const msg = e.message || '';

    // 40001 is TikTok's catch-all for a bad or expired token; 40100 and
    // 40105 are permission and app-approval. Different fixes.
    if (code === 40001 || /access.?token|invalid.*token/i.test(msg)) {
      return 'الرمز غير صالح أو انتهى. أنشئ رمزاً جديداً من تطبيقك في TikTok for Business.';
    }
    if (code === 40100 || code === 40105 || /permission|not authorized/i.test(msg)) {
      return 'التطبيق غير معتمد على هذا الحساب الإعلاني، أو لا يملك صلاحية القراءة.';
    }
    if (e.code === 'NOT_FOUND') return msg;
    if (code === 50002 || /rate|frequen/i.test(msg)) {
      return 'تيك توك أوقفت الطلبات مؤقتاً لكثرتها. أعد المحاولة بعد قليل.';
    }
    return msg;
  },
};

export { adDate };
