import { createHmac, timingSafeEqual, randomBytes } from 'node:crypto';
import type { AdPlatform } from './types';

/**
 * CONNECTING AN AD ACCOUNT BY SIGNING IN — «اربط الحساب الاعلاني عن طريق
 * تسجيل الدخول بالحساب».
 *
 * Today a seller opens Business Manager, finds the account id, generates a
 * long-lived token, and pastes both into a form. It works and it is a page
 * of instructions long, and the token it produces is one a seller can
 * accidentally give the wrong scopes or let expire with no warning.
 *
 * ── WHAT THIS CANNOT DO ON ITS OWN, SAID FIRST ──
 *
 * OAuth needs an APP registered with each platform: a client id, a client
 * secret, and a redirect URI the platform has been told about. Those belong
 * to the PRODUCT, not to the seller — there is one Zaki app and every shop
 * signs into it. Nothing in this repository has them, and no amount of code
 * invents them.
 *
 * So this file is written so that an unconfigured platform is a STATED
 * absence rather than a broken button: `oauthConfig` returns null, the
 * screen says which env vars are missing and where to register, and the
 * paste-a-token form stays exactly as it is. A seller is never shown a
 * «sign in» button that leads to a platform error page.
 *
 * AND META'S SCOPE NEEDS REVIEW. `ads_read` is not a scope an app may just
 * ask for; Meta grants it after App Review, which takes days and needs a
 * screencast and a privacy policy. That is a real-world step with a
 * calendar attached, and it is written here rather than discovered by
 * somebody wondering why approval never arrives.
 *
 * ── WHAT IT DOES DO ──
 *
 * Everything else, and the parts that are easy to get wrong are pure and
 * tested: the state parameter that stops a stranger's `code` landing on
 * your company, the exact scopes asked for, and the redirect URI built from
 * the app's own origin rather than from anything a request carries.
 */

export interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  /** Exactly what is asked for — never a superset «just in case». */
  scopes: string[];
  authorizeUrl: string;
  tokenUrl: string;
  /** Which env vars a seller's administrator has to set. */
  envKeys: { id: string; secret: string };
  /** Where to register the app, for the sentence the screen shows. */
  register: { url: string; note: string };
}

/**
 * THE SCOPES, AND WHY EACH ONE IS THE SMALLEST THAT WORKS.
 *
 * `ads_read` reads campaigns and insights. `ads_management` would also let
 * us CREATE and PAUSE ads, which this product never does — and asking for
 * it would mean a seller granting the power to spend their money to a
 * system that only ever reads. Meta's own review is stricter about it too,
 * so asking for more makes approval slower as well as wronger.
 */
const PLATFORMS: Record<AdPlatform, Omit<OAuthConfig, 'clientId' | 'clientSecret'>> = {
  META: {
    scopes: ['ads_read', 'business_management'],
    authorizeUrl: 'https://www.facebook.com/v21.0/dialog/oauth',
    tokenUrl: 'https://graph.facebook.com/v21.0/oauth/access_token',
    envKeys: { id: 'META_APP_ID', secret: 'META_APP_SECRET' },
    register: {
      url: 'https://developers.facebook.com/apps',
      note: 'أنشئ تطبيقاً من نوع Business، أضف Facebook Login، وسجّل رابط الإرجاع. ثم اطلب مراجعة التطبيق للحصول على ads_read — تستغرق أياماً.',
    },
  },
  TIKTOK: {
    // TikTok's business API spells its read scope as a numeric id in the
    // console; the string form is what the authorize dialog takes.
    scopes: ['ad.read', 'campaign.read', 'reporting.read'],
    authorizeUrl: 'https://business-api.tiktok.com/portal/auth',
    tokenUrl: 'https://business-api.tiktok.com/open_api/v1.3/oauth2/access_token/',
    envKeys: { id: 'TIKTOK_APP_ID', secret: 'TIKTOK_APP_SECRET' },
    register: {
      url: 'https://business-api.tiktok.com/portal/docs',
      note: 'أنشئ تطبيقاً في TikTok Marketing API وسجّل رابط الإرجاع.',
    },
  },
  SNAPCHAT: {
    scopes: ['snapchat-marketing-api'],
    authorizeUrl: 'https://accounts.snapchat.com/login/oauth2/authorize',
    tokenUrl: 'https://accounts.snapchat.com/login/oauth2/access_token',
    envKeys: { id: 'SNAPCHAT_CLIENT_ID', secret: 'SNAPCHAT_CLIENT_SECRET' },
    register: {
      url: 'https://business.snapchat.com',
      note: 'أنشئ تطبيقاً في Snap Business ثم سجّل رابط الإرجاع.',
    },
  },
};

/**
 * The platform's app credentials, or null when nobody has set them.
 *
 * Null is the ONLY honest answer for an unconfigured platform, and it is
 * returned rather than throwing so the screen can draw a sentence instead
 * of a button. Read at call time, never cached: a deployment that adds the
 * env vars must not need a restart to be believed.
 */
export function oauthConfig(platform: string): OAuthConfig | null {
  const base = PLATFORMS[platform as AdPlatform];
  if (!base) return null;
  const clientId = process.env[base.envKeys.id];
  const clientSecret = process.env[base.envKeys.secret];
  // Both, or neither. An id with no secret cannot complete the exchange,
  // and a button that gets halfway is worse than no button.
  if (!clientId || !clientSecret) return null;
  return { ...base, clientId, clientSecret };
}

/** What the screen says when a platform has no app. Never a token. */
export function oauthMissing(platform: string): { envKeys: string[]; register: OAuthConfig['register'] } | null {
  const base = PLATFORMS[platform as AdPlatform];
  if (!base) return null;
  return { envKeys: [base.envKeys.id, base.envKeys.secret], register: base.register };
}

/**
 * THE REDIRECT URI IS BUILT FROM THE APP'S OWN ORIGIN, NEVER FROM A REQUEST.
 *
 * It is the one value the platform compares against what was registered, so
 * taking it from a `Host` header would mean a request claiming any host
 * could point the token exchange at that host. `NEXT_PUBLIC_APP_URL` is the
 * product's own address and is already the only `NEXT_PUBLIC_*` in use.
 */
export function redirectUri(platform: string): string {
  const origin = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/+$/, '');
  return `${origin}/api/settings/ad-accounts/oauth/${platform}/callback`;
}

/* ─────────────────────── the state parameter ─────────────────────── */

/**
 * WHAT `state` ACTUALLY DEFENDS AGAINST, because it is not CSRF in the
 * usual sense.
 *
 * The callback is a GET the platform sends a browser to, carrying a `code`.
 * Without state, anybody who obtains a `code` — their own, from their own
 * ad account — can hand it to our callback while signed in as somebody
 * else, and the token for THEIR account gets stored against the victim's
 * company. The victim then sees an ad account they did not connect, and
 * every spend figure in their reports comes from a stranger's spending.
 *
 * So the state carries WHO started the flow, signed, and the callback
 * refuses a code whose state does not say «this company, this store, this
 * platform, minutes ago».
 *
 * SIGNED, NOT STORED. A row would need cleaning up and a transaction; an
 * HMAC over the payload needs neither and cannot be forged without
 * `JWT_SECRET`. The nonce makes two flows started in the same second
 * distinguishable, which matters only for the log.
 */
export interface OAuthState {
  companyId: string;
  storeId: string | null;
  platform: string;
  /** Milliseconds. Ten minutes is long enough to read a consent screen. */
  at: number;
  nonce: string;
}

export const STATE_TTL_MS = 10 * 60 * 1000;

function stateSecret(): Buffer {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    if (process.env.NODE_ENV === 'production') {
      // The same refusal `auth.ts` makes, for the same reason: a signature
      // under a known fallback key is not a signature.
      throw new Error('SECURITY: JWT_SECRET is required to sign an OAuth state');
    }
    return Buffer.from('development_only_insecure_jwt_secret_key_0000');
  }
  return Buffer.from(secret);
}

function sign(payload: string): string {
  return createHmac('sha256', stateSecret()).update(payload).digest('base64url');
}

export function makeState(input: Omit<OAuthState, 'at' | 'nonce'>, now = Date.now()): string {
  const state: OAuthState = { ...input, at: now, nonce: randomBytes(8).toString('base64url') };
  const payload = Buffer.from(JSON.stringify(state)).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

export type StateVerdict =
  | { ok: true; state: OAuthState }
  | { ok: false; why: 'malformed' | 'bad-signature' | 'expired' | 'wrong-platform' };

export function readState(raw: unknown, platform: string, now = Date.now()): StateVerdict {
  if (typeof raw !== 'string' || !raw.includes('.')) return { ok: false, why: 'malformed' };
  const [payload, mac] = raw.split('.', 2);
  if (!payload || !mac) return { ok: false, why: 'malformed' };

  /*
   * TIMING-SAFE, and the length check comes first because
   * `timingSafeEqual` THROWS on a length mismatch rather than returning
   * false — an exception here would be a 500 where a 400 belongs, and a
   * 500 on a crafted state is a way to tell signatures apart by their
   * effect.
   */
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
    return { ok: false, why: 'bad-signature' };
  }

  let state: OAuthState;
  try {
    state = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as OAuthState;
  } catch {
    return { ok: false, why: 'malformed' };
  }
  if (typeof state?.companyId !== 'string' || typeof state?.at !== 'number') {
    return { ok: false, why: 'malformed' };
  }

  // A signed state from a different platform's flow is still signed by us.
  // The callback is per platform, so the two must agree or a Meta code
  // would be exchanged against TikTok's token endpoint.
  if (state.platform !== platform) return { ok: false, why: 'wrong-platform' };

  // `now - at` and not `Math.abs`: a clock that moved must not turn a fresh
  // state into an expired one, and a state from the future is a forgery the
  // signature already refused.
  if (now - state.at >= STATE_TTL_MS) return { ok: false, why: 'expired' };

  return { ok: true, state };
}

/** What a seller reads when their state did not survive. */
export const STATE_REFUSALS: Record<Exclude<StateVerdict, { ok: true }>['why'], string> = {
  malformed: 'طلب الربط غير صالح — ابدأ من جديد',
  'bad-signature': 'طلب الربط غير صالح — ابدأ من جديد',
  expired: 'انتهت صلاحية طلب الربط — ابدأ من جديد',
  'wrong-platform': 'طلب الربط لمنصّة أخرى — ابدأ من جديد',
};

/* ─────────────────────── the authorize URL ─────────────────────── */

/**
 * Where the seller's browser is sent. Built with `URLSearchParams` so a
 * scope or an id containing a reserved character cannot change the shape of
 * the query — the kind of thing that turns one parameter into two.
 */
export function authorizeUrl(platform: string, state: string): string | null {
  const config = oauthConfig(platform);
  if (!config) return null;

  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: redirectUri(platform),
    state,
    response_type: 'code',
    scope: config.scopes.join(platform === 'META' ? ',' : ' '),
  });
  return `${config.authorizeUrl}?${params.toString()}`;
}

/* ─────────────────────── the code exchange ─────────────────────── */

export interface ExchangedToken {
  /** The bag each adapter stores, shaped the way that adapter expects. */
  credentials: Record<string, string>;
}

/**
 * THE CODE FOR A TOKEN, AND THE SECRET GOES IN THE BODY.
 *
 * All three accept a POST body; Meta also accepts a GET with the secret in
 * the query string, and that is the one shape to refuse — a URL ends up in
 * logs, proxies and error reports, and a client secret in any of those is a
 * secret to rotate for every shop at once.
 *
 * The returned bag is shaped per platform because the adapters disagree
 * about what a connection needs: Meta stores one token, TikTok a token plus
 * nothing (the advertiser comes from `listAccounts`), Snapchat a refresh
 * token with the app's own id and secret because its access tokens die
 * after thirty minutes.
 */
export async function exchangeCode(platform: string, code: string): Promise<ExchangedToken> {
  const config = oauthConfig(platform);
  if (!config) throw new Error('المنصّة غير مهيّأة على الخادم');

  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: redirectUri(platform),
    code,
    grant_type: 'authorization_code',
  });

  const res = await fetch(config.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body,
  });

  const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok || !json) {
    throw new Error('تعذّر إكمال الربط مع المنصّة — حاول من جديد');
  }

  /*
   * EACH PLATFORM BURIES THE TOKEN SOMEWHERE ELSE. Meta returns it at the
   * top level, TikTok inside `data`, Snapchat at the top with a refresh
   * token beside it. Read without naming a platform where possible, and
   * named only where the shapes genuinely differ.
   */
  const data = (json.data && typeof json.data === 'object' ? json.data : json) as Record<string, unknown>;
  const access = typeof data.access_token === 'string' ? data.access_token : null;
  if (!access) throw new Error('المنصّة لم تُرسل رمز وصول');

  if (platform === 'SNAPCHAT') {
    const refresh = typeof data.refresh_token === 'string' ? data.refresh_token : null;
    if (!refresh) throw new Error('سناب شات لم تُرسل رمز تحديث');
    // The shape `snapchat.ts` already reads — it mints a fresh access token
    // on every call, so the refresh token is the connection.
    return {
      credentials: {
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        refreshToken: refresh,
      },
    };
  }

  return { credentials: { token: access } };
}
