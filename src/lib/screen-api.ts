import { format } from 'date-fns';

/**
 * Small fetch helpers for screens (formerly src/lib/crm-client.ts).
 * apiJson in src/lib/api-client.ts is the richer wrapper; these stay for
 * screens that only need a JSON call plus a query-string builder.
 *
 * WHY `screenApi` IS NOT JUST `apiJson`: `apiJson` puts a 15-second timeout on
 * every request, and the landing editor's AI-copy call (`AiCopyPanel`) asks a
 * model for nine to twelve paragraphs and is allowed 60 seconds — through
 * `apiJson` the browser would abort a call that was going to succeed. So this
 * one has no timeout of its own, on purpose.
 *
 * WHAT IT READS FROM A REFUSAL: `errorAr` first, then `error` — the same order
 * `apiJson` uses. Every route answers `{ error, errorAr }` through
 * `apiErrorResponse`, and this used to read only `error`, so a refusal in
 * Arabic (e.g. «انتهت الجلسة. سجّل الدخول من جديد للمتابعة.») reached WhatsApp,
 * Telegram and the product offers as «حدث خطأ غير متوقع».
 */

export async function screenApi(path: string, init?: RequestInit) {
  const res = await fetch(path, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const body = data as { errorAr?: string; error?: string } | null;
    throw new Error(body?.errorAr || body?.error || 'حدث خطأ غير متوقع');
  }
  return data;
}

export function qs(params: Record<string, unknown>) {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '' && v !== 'all') sp.set(k, String(v));
  });
  const s = sp.toString();
  return s ? `?${s}` : '';
}


export function formatDate(d: string | Date | null | undefined) {
  if (!d) return '—';
  try {
    return format(new Date(d), 'yyyy/MM/dd');
  } catch {
    return '—';
  }
}
