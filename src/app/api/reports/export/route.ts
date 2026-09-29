import { NextResponse } from 'next/server';
import { apiErrorResponse } from '@/lib/api-error';
import { logAudit } from '@/lib/audit';
import { db } from '@/lib/db';
import { requireContext } from '@/lib/geo-context';
import { rateLimit } from '@/lib/rate-limit';
import { requirePermission } from '@/lib/authorization';
import { CORE_STATES, whereForState, type CoreState } from '@/lib/order-state';
import { applyQueueFilter } from '@/lib/rbac';

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
    const lateDays = searchParams.get('lateDays')?.trim();

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

    /**
     * «متأخرة 10 أيام+ من الشحن» WAS A BUTTON THE EXPORT COULD NOT SEE.
     *
     * The orders screen sends this filter to the list and to the export
     * through the same builder. The list narrowed on it; this route read
     * every other parameter and not this one — so pressing تصدير while the
     * late filter was lit handed back the whole window instead of the
     * fourteen rows on the screen, silently, with no clue that the CSV and
     * the list disagreed. A filter whose value never reaches the query is
     * the one defect a person cannot see happening.
     *
     * The same three conditions the list applies — see
     * `src/app/api/orders/route.ts`. Late means "shipped and still open":
     * measured from `shippedAt`, never `createdAt`, and the closed states
     * are excluded because a delivered order from last year is finished,
     * not late.
     */
    if (lateDays) {
      const days = Number(lateDays);
      if (!Number.isFinite(days) || days < 1 || days > 365) {
        return NextResponse.json(
          { error: 'عدد أيام التأخير غير صالح' },
          { status: 400 }
        );
      }
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      filters.AND = [
        ...((filters.AND as unknown[]) ?? []),
        { shippedAt: { lte: cutoff } },
        { shippingStatus: { notIn: ['DELIVERED', 'PARTIALLY_DELIVERED', 'RETURNED', 'CANCELLED'] } },
        { confirmationStatus: { notIn: ['CANCELLED', 'REJECTED'] } },
      ];
    }

    /**
     * THE ENVELOPE THE LIST NEVER LETS GO OF, AND THIS ROUTE HAD NEVER HELD.
     *
     * `GET /api/orders` ends every query with `applyQueueFilter`, which is
     * both things at once: the requested workflow queue, and — when none is
     * requested — the role's own order-visibility envelope. This route had
     * neither. It checked `reports.export` and then read the whole store.
     *
     * Measured on this database: every role holding `reports.export`
     * (SUPER_ADMIN, COMPANY_ADMIN, MANAGER, MODERATOR, DELIVERY_MANAGER,
     * SETTLEMENT_OFFICER, ACCOUNTANT) also holds `orders.view` at
     * ALL_COMPANY, for which `orderVisibilityWhere` returns `{}` — so today
     * this narrows nothing for anybody. It is the custom role that makes it
     * matter: one built with `reports.export` and a narrower `orders.view`
     * would read a list of its own orders on screen and download every
     * customer name and phone number in the store. The single largest way
     * customer data leaves this system should not be the one door with no
     * envelope on it.
     *
     * It also makes `queue` mean something. The orders screen sends it with
     * the export and this route ignored it, so the two could disagree.
     *
     * The hand-picked branch goes through it too: ticking a row you may not
     * see is still a row you may not see.
     */
    const queue = searchParams.get('queue');
    const where = applyQueueFilter(
      user,
      ids
        ? { companyId, storeId, id: { in: ids } }
        : { companyId, storeId, createdAt: { gte: start, lte: end }, ...filters },
      queue
    );

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

    /**
     * TEN THOUSAND NAMES AND PHONE NUMBERS, LEAVING.
     *
     * This is the single largest way customer data can leave the system,
     * and until now it left no trace at all: the permission was checked,
     * the file was handed over, and nothing anywhere recorded that it had
     * happened. A manager asking "who took the customer list" had nowhere
     * to look.
     *
     * So the FACT is recorded, never the contents. The row says how many
     * orders, over which dates, under which filters - enough to recognise
     * "the whole quarter, no filters, at 2am" and nothing that would turn
     * the audit log itself into a second copy of the thing being guarded.
     */
    await logAudit({
      companyId,
      userId: user.id,
      action: 'ORDERS_EXPORTED',
      entity: 'Order',
      entityId: `export:${totalRows}`,
      newData: {
        rows: totalRows,
        from: start.toISOString(),
        to: end.toISOString(),
        handPicked: ids ? ids.length : null,
        filters: {
          q: q || null,
          status: status || null,
          productId: productId || null,
          source: sourceParam || null,
          courierId: courierId || null,
          regionId: regionId || null,
          lateDays: lateDays || null,
        },
        // The columns that make this worth recording at all.
        withContact: true,
      },
    });

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
