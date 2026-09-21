import { format } from 'date-fns';

/**
 * Small fetch helpers for screens (formerly src/lib/crm-client.ts).
 * apiJson in src/lib/api-client.ts is the richer wrapper; these stay for
 * screens that only need a JSON call plus a query-string builder.
 */

export async function screenApi(path: string, init?: RequestInit) {
  const res = await fetch(path, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error((data as { error?: string } | null)?.error || 'حدث خطأ غير متوقع');
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

export function formatDateTime(d: string | Date | null | undefined) {
  if (!d) return '—';
  try {
    return format(new Date(d), 'yyyy/MM/dd HH:mm');
  } catch {
    return '—';
  }
}
