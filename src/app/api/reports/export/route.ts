import { NextResponse } from 'next/server';
import { apiErrorResponse } from '@/lib/api-error';
import { db } from '@/lib/db';
import { requireContext } from '@/lib/geo-context';
import { rateLimit } from '@/lib/rate-limit';
import { requirePermission } from '@/lib/authorization';
import { CORE_STATES, whereForState, type CoreState } from '@/lib/order-state';

/**
 * CSV export safety:
 * - Hard row cap: MAX_EXPORT_ROWS; a count() with the same `where` runs first and
 *   returns 400 when the export would exceed it.
 * - Mandatory date range: `from`/`to` query params; defaults to the last 90 days,
 *   and any span wider than 90 days is clamped to the last 90 days so a single
 *   export can never scan the whole table (MAX_WINDOW_DAYS).
 * - Rows are fetched in chunks of 1000 (skip/take) so no single huge query blocks.
 */
const MAX_EXPORT_ROWS = 10000;
const MAX_WINDOW_DAYS = 90;
const CHUNK_SIZE = 1000;

/**
 * CSV formula-injection neutralization: a cell beginning with =, +, -, @, |,
 * TAB or CR is interpreted as a formula by Excel/Google Sheets. Prefixing with
 * an apostrophe keeps the original text visible while forcing text mode.
 */
function csvSafeText(value: unknown): string {
  const text = String(value ?? '');
  if (/^[=+\-@|\t\r]/.test(text)) return `'${text}`;
  return text;
}

export async function GET(req: Request) {
  try {
    const { companyId, storeId, user } = await requireContext();
    await requirePermission('reports.export');

    // Rate limit heavy exports: generous window so normal usage is unaffected
    const rl = rateLimit(`export:${companyId}:${user.id}`, 30, 60 * 1000);
    if (!rl.allowed) {
      return NextResponse.json(
        { errorAr: `طلبات تصدير كثيرة جداً. أعد المحاولة بعد ${rl.retryAfterSec} ثانية` },
        { status: 429 }
      );
    }

    const { searchParams } = new URL(req.url);
    const fromParam = searchParams.get('from');
    const toParam = searchParams.get('to');

    const now = new Date();
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    const minStart = new Date(todayEnd);
    minStart.setDate(minStart.getDate() - MAX_WINDOW_DAYS);

    // Mandatory date range: default to the last 90 days, clamp wider spans
    let start = fromParam ? new Date(fromParam) : minStart;
    const end = toParam ? new Date(toParam) : todayEnd;
    if (end.getTime() - start.getTime() > MAX_WINDOW_DAYS * 24 * 60 * 60 * 1000) {
      start = minStart;
    }

    // A hand-picked set of orders is exported as itself: the date window is
    // the guard for "everything since", and it has no business narrowing a
    // list somebody ticked row by row.
    const idsParam = searchParams.get('ids');
    const ids = idsParam
      ? idsParam.split(',').map((v) => v.trim()).filter(Boolean).slice(0, MAX_EXPORT_ROWS)
      : null;

    // The same narrowing the screen was showing. Exporting "the filtered
    // orders" used to mean the date window only, so a CSV taken while a
    // courier or a state was selected quietly contained everything else too.
    const filters: Record<string, unknown> = {};
    const q = searchParams.get('q')?.trim();
    const status = searchParams.get('status')?.trim();
    const productId = searchParams.get('productId')?.trim();
    const sourceParam = searchParams.get('source')?.trim();
    const courierId = searchParams.get('courierId')?.trim();
    const regionId = searchParams.get('regionId')?.trim();

    if (status && status !== 'all' && CORE_STATES.includes(status as CoreState)) {
      const stateWhere = whereForState(status as CoreState);
      if (stateWhere) filters.AND = [stateWhere];
    }
    if (productId && productId !== 'all') filters.productId = productId;
    if (sourceParam && sourceParam !== 'all') filters.source = sourceParam;
    if (regionId && regionId !== 'all') filters.regionId = regionId;
    if (courierId && courierId !== 'all') {
      filters.deliveryProviderId = courierId === 'none' ? null : courierId;
    }
    if (q) {
      filters.OR = [
        { orderNumber: { contains: q } },
        { customer: { fullName: { contains: q } } },
        { customer: { phone: { contains: q } } },
      ];
    }

    const where = ids
      ? { companyId, storeId, id: { in: ids } }
      : { companyId, storeId, createdAt: { gte: start, lte: end }, ...filters };

    // Guard: reject exports exceeding the row cap before fetching anything
    const totalRows = await db.order.count({ where });
    if (totalRows > MAX_EXPORT_ROWS) {
      return NextResponse.json(
        {
          error: `Export limit exceeded (${totalRows} orders > ${MAX_EXPORT_ROWS}).`,
          errorAr: 'عدد الطلبات المطلوب تصديره يتجاوز الحد الأقصى (10000). يرجى تضييق الفترة الزمنية.',
        },
        { status: 400 }
      );
    }

    const headers = [
      'Order Number',
      'Date',
      'Customer Name',
      'Phone',
      'City',
      'Product',
      'Offer',
      'Quantity',
      'Price',
      'Total Amount',
      'Status',
      'Moderator',
      'Source',
    ];

    const csvParts: string[] = [headers.join(',')];

    // Chunked fetch (1000 rows per query) to avoid one huge blocking query
    for (let skip = 0; skip < totalRows; skip += CHUNK_SIZE) {
      const orders = await db.order.findMany({
        where,
        include: {
          customer: true,
          product: true,
          offer: true,
          moderator: true,
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: CHUNK_SIZE,
      });

      for (const o of orders) {
        const row = [
          csvSafeText(o.orderNumber),
          o.createdAt.toISOString(),
          `"${csvSafeText(o.customer?.fullName || '').replace(/"/g, '""')}"`,
          `"${csvSafeText(o.customer?.rawPhone || o.customer?.phone || '').replace(/"/g, '""')}"`,
          `"${csvSafeText(o.customer?.city || '').replace(/"/g, '""')}"`,
          `"${csvSafeText(o.product?.name || '').replace(/"/g, '""')}"`,
          `"${csvSafeText(o.offer?.name || 'Direct').replace(/"/g, '""')}"`,
          o.quantity,
          o.sellingPrice,
          o.totalAmount,
          o.status,
          `"${csvSafeText(o.moderator?.name || 'Unassigned').replace(/"/g, '""')}"`,
          `"${csvSafeText(o.source).replace(/"/g, '""')}"`,
        ];
        csvParts.push(row.join(','));
      }
    }

    const csvContent = csvParts.join('\n');

    return new Response(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="salesflow_orders_${new Date().toISOString().split('T')[0]}.csv"`,
      },
    });
  } catch (error: any) {
    return apiErrorResponse(error);
  }
}
