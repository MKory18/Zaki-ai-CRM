export async function crmApi(path: string, init?: RequestInit) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error((data as any)?.error || 'حدث خطأ غير متوقع');
  return data;
}

export function qs(params: Record<string, any>) {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '' && v !== 'all') sp.set(k, String(v));
  });
  const s = sp.toString();
  return s ? `?${s}` : '';
}

/** Fetch assignable users for selects — tries /api/users then /api/moderators */
export async function fetchAssignableUsers(): Promise<{ id: string; name: string }[]> {
  try {
    const data = await crmApi('/api/users?limit=100');
    const items = data.users || data.items || [];
    if (Array.isArray(items) && items.length) return items.map((u: any) => ({ id: u.id, name: u.name }));
  } catch {}
  try {
    const data = await crmApi('/api/moderators');
    const items = data.moderators || data.items || [];
    return Array.isArray(items) ? items.map((u: any) => ({ id: u.id, name: u.name })) : [];
  } catch {
    return [];
  }
}
