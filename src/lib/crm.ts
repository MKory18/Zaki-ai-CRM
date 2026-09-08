// Shared helpers for CRM API list endpoints (search, filters, sort, pagination)
import { NextRequest, NextResponse } from 'next/server';

export interface ListParams {
  q: string | null;
  sort: string;
  dir: 'asc' | 'desc';
  page: number;
  pageSize: number;
  filters: Record<string, any>;
  from: Date | null;
  to: Date | null;
}

/**
 * Parses the standard CRM list query string:
 * ?q&status&stage&priority&type&assignedToId&crmCompanyId&crmContactId&crmDealId&crmLeadId&from&to&sort&dir&page&pageSize
 */
export function parseListParams(req: NextRequest | Request, allowedSort: string[]): ListParams {
  const { searchParams } = new URL(req.url);
  const str = (k: string) => {
    const v = searchParams.get(k)?.trim();
    return v && v.length > 0 ? v : null;
  };

  const q = str('q');

  const filters: Record<string, any> = {};
  const single = ['status', 'stage', 'priority', 'type', 'assignedToId', 'crmCompanyId', 'crmContactId', 'crmDealId', 'crmLeadId', 'crmLeadId'];
  for (const key of single) {
    const v = str(key);
    if (v) filters[key] = v;
  }

  const fromRaw = str('from');
  const toRaw = str('to');
  let from: Date | null = null;
  let to: Date | null = null;
  if (fromRaw && !isNaN(Date.parse(fromRaw))) from = new Date(fromRaw);
  if (toRaw && !isNaN(Date.parse(toRaw))) {
    to = new Date(toRaw);
    // Include the whole "to" day when only a date is provided
    if (toRaw.length <= 10) to.setHours(23, 59, 59, 999);
  }

  const sortRaw = str('sort');
  const sort = sortRaw && allowedSort.includes(sortRaw) ? sortRaw : 'createdAt';
  const dirRaw = str('dir');
  const dir: 'asc' | 'desc' = dirRaw === 'asc' ? 'asc' : 'desc';

  let page = parseInt(str('page') || '1', 10);
  if (!Number.isFinite(page) || page < 1) page = 1;
  let pageSize = parseInt(str('pageSize') || '20', 10);
  if (!Number.isFinite(pageSize) || pageSize < 1) pageSize = 20;
  if (pageSize > 100) pageSize = 100;

  return { q, sort, dir, page, pageSize, filters, from, to };
}

/** Builds a paginated JSON response: { items, total, page, pageSize, pages } */
export function listResponse(items: any[], total: number, page: number, pageSize: number) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return NextResponse.json({ items, total, page, pageSize, pages });
}

/** Case-insensitive contains helper (Prisma: mode insensitive) */
export function contains(q: string): any {
  return { contains: q, mode: 'insensitive' as const };
}

/** Date range filter on a given field, merged into the where clause */
export function dateRange(field: string, from: Date | null, to: Date | null): any {
  if (!from && !to) return {};
  const range: any = {};
  if (from) range.gte = from;
  if (to) range.lte = to;
  return { [field]: range };
}
