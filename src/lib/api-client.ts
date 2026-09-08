/**
 * Shared fetch wrappers for client components.
 * - apiFetch: same-origin credentials by default; on 401 redirects to /login
 *   (layout dir/lang untouched) and throws a user-facing Arabic message.
 * - apiJson: parses JSON and throws a readable error from errorAr/error fields.
 * - All requests carry a 15s timeout via AbortSignal.timeout, merged with any
 *   caller-provided signal so a caller abort also cancels the request.
 */

const REQUEST_TIMEOUT_MS = 15_000;

/** Merge the default timeout signal with a caller-provided signal. */
function withTimeout(signal?: AbortSignal | null): AbortSignal {
  const timeoutSignal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  if (!signal) return timeoutSignal;
  // AbortSignal.any is widely available; fall back for older runtimes
  if (typeof (AbortSignal as any).any === 'function') {
    return (AbortSignal as any).any([signal, timeoutSignal]);
  }
  // Small combined-abort helper: abort when either source fires
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal.aborted) controller.abort();
  else signal.addEventListener('abort', abort, { once: true });
  timeoutSignal.addEventListener('abort', abort, { once: true });
  return controller.signal;
}

export async function apiFetch(input: string, init?: RequestInit): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(input, {
      credentials: 'same-origin',
      ...init,
      signal: withTimeout(init?.signal),
    });
  } catch (e: any) {
    // Timeout abort surfaces as AbortError ("signal timed out" for AbortSignal.timeout)
    if (e?.name === 'AbortError' || e?.name === 'TimeoutError') {
      throw new Error('انتهت مهلة الطلب. تحقق من الاتصال وحاول مجدداً.');
    }
    throw e;
  }
  if (res.status === 401) {
    // Session expired — hard redirect to login; keeps app dir/rtl untouched
    window.location.href = '/login';
    throw new Error('انتهت الجلسة، جارٍ إعادة التوجيه');
  }
  return res;
}

export async function apiJson<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await apiFetch(input, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      (data as any).errorAr || (data as any).error || `HTTP ${res.status}`
    );
  }
  return data as T;
}
