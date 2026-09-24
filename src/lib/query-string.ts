/**
 * The query string of a request, for carrying across a redirect.
 *
 * A campaign link is /s/<store>?c=CODE, and the code is how the order is
 * credited to the campaign. A redirect that drops the query drops the sale's
 * attribution with it — silently, at the first hop.
 */
export function carryQuery(params: Record<string, string | string[] | undefined>): string {
  const q = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'string') q.append(key, value);
    else if (Array.isArray(value)) for (const v of value) q.append(key, v);
  }
  const s = q.toString();
  return s ? `?${s}` : '';
}
