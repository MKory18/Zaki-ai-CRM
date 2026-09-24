import type { UserData } from './hash';

/**
 * TALKING TO META'S CONVERSIONS API.
 *
 * One endpoint, one shape, and deliberately nothing else. This is not a
 * Meta client library: every extra call is another thing to keep working
 * when Meta changes a version, and a shop's codebase has no business
 * knowing how to do anything to an ad account except tell it a sale
 * happened.
 *
 * The token rides in the Authorization header rather than the query string
 * that Meta's own examples use, because a URL ends up in logs, in proxies
 * and in error reports, and a token in any of those is a token to rotate.
 */

const API_VERSION = process.env.META_API_VERSION || 'v23.0';
const BASE = `https://graph.facebook.com/${API_VERSION}`;
const TIMEOUT_MS = 20_000;

export class CapiError extends Error {
  constructor(
    message: string,
    readonly code?: number,
    readonly subcode?: number,
    /** True when retrying could plausibly work. A bad token never will. */
    readonly retryable = false
  ) {
    super(message);
    this.name = 'CapiError';
  }
}

export interface CapiEvent {
  event_name: string;
  /** Unix SECONDS. Milliseconds are silently accepted and silently useless. */
  event_time: number;
  event_id: string;
  /** Where the customer was when this began — the landing page, normally. */
  event_source_url?: string;
  action_source: 'website' | 'phone_call' | 'physical_store' | 'system_generated' | 'other';
  user_data: UserData;
  custom_data?: Record<string, unknown>;
}

export interface CapiResult {
  received: number;
  /** Meta's own trace id, worth quoting when asking them why. */
  traceId: string | null;
}

/**
 * Send one batch of events to one pixel.
 *
 * Errors are classified rather than merely reported, because the retry
 * schedule depends on it: a rate limit wants patience, an expired token
 * wants a human, and a malformed event wants neither — retrying it five
 * times only delays the moment somebody reads the message.
 */
export async function sendEvents(
  pixelId: string,
  token: string,
  events: CapiEvent[],
  testEventCode?: string | null
): Promise<CapiResult> {
  if (events.length === 0) return { received: 0, traceId: null };

  const body: Record<string, unknown> = { data: events };
  // Present only while a seller is watching Events Manager's test panel.
  // An event carrying it is VISIBLE there and NOT counted as a conversion,
  // which is exactly right for a test and exactly wrong left switched on.
  if (testEventCode) body.test_event_code = testEventCode;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE}/${pixelId}/events`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => null);

    if (!res.ok || json?.error) {
      const e = json?.error;
      throw new CapiError(
        e?.message || `Meta answered ${res.status}`,
        e?.code,
        e?.error_subcode,
        // 5xx and rate limits pass; a rejected token or a malformed event
        // will be just as rejected in six hours.
        res.status >= 500 || e?.code === 17 || e?.code === 4 || e?.code === 613
      );
    }

    return {
      received: Number(json?.events_received ?? events.length) || 0,
      traceId: json?.fbtrace_id ?? null,
    };
  } catch (err) {
    if (err instanceof CapiError) throw err;
    if ((err as Error)?.name === 'AbortError') {
      throw new CapiError('انتهت مهلة الاتصال بميتا.', undefined, undefined, true);
    }
    // A network failure is the one thing that is always worth trying again.
    throw new CapiError('تعذر الوصول إلى ميتا.', undefined, undefined, true);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Does this token open this pixel?
 *
 * Run before the token is stored. Meta has no "check my token" endpoint for
 * a pixel, so this asks for the pixel's own name — the cheapest call that
 * fails in exactly the ways we need to tell apart: wrong token, right token
 * without permission, and wrong pixel id.
 *
 * A token saved without being tried is a token that fails inside a
 * scheduled worker at 3am, where the error reaches a log instead of the
 * screen of the person who could fix it.
 */
export async function verifyPixelToken(pixelId: string, token: string): Promise<{ name: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const url = new URL(`${BASE}/${pixelId}`);
    url.searchParams.set('fields', 'id,name');
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await res.json().catch(() => null);

    if (!res.ok || json?.error) {
      const e = json?.error;
      throw new CapiError(e?.message || `Meta answered ${res.status}`, e?.code, e?.error_subcode);
    }
    return { name: json?.name || pixelId };
  } catch (err) {
    if (err instanceof CapiError) throw err;
    if ((err as Error)?.name === 'AbortError') throw new CapiError('انتهت مهلة الاتصال بميتا.');
    throw new CapiError('تعذر الوصول إلى ميتا.');
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Meta's error, turned into something a seller can act on.
 *
 * Their messages are written for developers. These are the ones a shop
 * actually hits, and each has a different fix — telling them apart is the
 * difference between a seller solving it and a seller calling you.
 */
export function explainCapiError(e: unknown): string {
  if (!(e instanceof CapiError)) return 'تعذر الاتصال بميتا';
  const msg = e.message || '';

  if (e.code === 190 || /expired|invalid.*token|session/i.test(msg)) {
    return 'انتهت صلاحية الرمز أو أُلغي. أنشئ رمزاً جديداً من مدير الأحداث والصقه هنا.';
  }
  if (e.code === 200 || e.code === 10 || /permission/i.test(msg)) {
    return 'الرمز لا يملك صلاحية على هذا البكسل. تأكد أنه رمز البكسل نفسه من Events Manager.';
  }
  if (e.code === 803 || /does not exist|cannot be loaded|Unsupported/i.test(msg)) {
    return 'رقم البكسل غير موجود أو لا يراه هذا الرمز. تحقق من الرقم.';
  }
  if (e.code === 17 || e.code === 4 || /rate limit|too many/i.test(msg)) {
    return 'ميتا أوقفت الطلبات مؤقتاً لكثرتها. ستُعاد المحاولة تلقائياً.';
  }
  if (/event_time|7 days|older than/i.test(msg)) {
    return 'ميتا ترفض حدثاً أقدم من ٧ أيام. الطلب تأخّر تسليمه أكثر من النافذة.';
  }
  return msg;
}
