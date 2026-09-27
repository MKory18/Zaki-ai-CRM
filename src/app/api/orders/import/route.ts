import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireContext } from '@/lib/geo-context';
import { requirePermission } from '@/lib/authorization';
import { apiErrorResponse } from '@/lib/api-error';
import { activeBlock } from '@/lib/blacklist';
import { importTemplateCsv, isImportable, parseOrderSheet, IMPORT_COLUMNS } from '@/lib/order-import';
import { matchProduct } from '@/lib/order-parser';

/**
 * GET  /api/orders/import — the template, built from the parser's own columns.
 * POST /api/orders/import — read a sheet and say what is in it. Writes nothing.
 *
 * THE IMPORT DOES NOT CREATE ORDERS. `POST /api/orders` does, with its stock
 * reservation, its cost of goods, its COD arithmetic, its blacklist check,
 * its commission and its notifications. A second creation path for imported
 * rows would be a second set of money rules that drift apart the first time
 * either is touched — so this reads, checks, and hands rows back for the
 * screen to send through that one door, one at a time.
 *
 * One at a time is also what makes a half-failed import survivable: row
 * forty failing is row forty, not a rollback of thirty-nine orders somebody
 * then re-uploads and duplicates.
 */

/** Past this a paste is a mistake, and the browser would not survive it either. */
const MAX_ROWS = 1000;
const MAX_BYTES = 4 * 1024 * 1024;

/** A phone that ordered inside this window is «already has one», not history. */
const RECENT_DAYS = 30;

export async function GET() {
  try {
    await requireContext();
    await requirePermission('orders.create');
    return new NextResponse(importTemplateCsv(), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="orders-template.csv"',
      },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(req: Request) {
  try {
    const { companyId, storeId } = await requireContext();
    await requirePermission('orders.create');

    const form = await req.formData().catch(() => null);
    const file = form?.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'أرفِق ملفاً (CSV أو Excel)' }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'الملف أكبر من 4 ميغابايت' }, { status: 400 });
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const parsed = parseOrderSheet(buf);

    if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 });
    if (parsed.missingRequired.length > 0) {
      return NextResponse.json(
        {
          error: `الملف ينقصه: ${parsed.missingRequired.join('، ')}. حمّل النموذج وقارِن العناوين.`,
          code: 'MISSING_COLUMNS',
          missing: parsed.missingRequired,
        },
        { status: 400 }
      );
    }
    if (parsed.rows.length > MAX_ROWS) {
      return NextResponse.json(
        { error: `الملف يحوي ${parsed.rows.length} صفاً — الحدّ ${MAX_ROWS}. قسّمه.`, code: 'TOO_MANY_ROWS' },
        { status: 400 }
      );
    }

    const phones = [...new Set(parsed.rows.map((r) => r.phone).filter((p): p is string => !!p))];

    /**
     * WHO IN THIS FILE ALREADY HAS AN ORDER WITH US.
     *
     * The commonest real duplicate is not two lines in one sheet — it is a
     * marketer re-uploading yesterday's export. So the recent orders are
     * read once for every phone in the file and reported per row, never
     * refused: a customer ordering twice in a month is a good customer.
     *
     * Rejected and cancelled ones do not count. Somebody whose order was
     * cancelled and who is ordering again is not a duplicate, and calling
     * them one is how a real sale gets dropped.
     */
    const since = new Date(Date.now() - RECENT_DAYS * 86_400_000);
    const recent = phones.length
      ? await db.order.findMany({
          where: {
            companyId,
            ...(storeId ? { storeId } : {}),
            createdAt: { gte: since },
            confirmationStatus: { notIn: ['REJECTED', 'CANCELLED'] },
            customer: { phone: { in: phones } },
          },
          select: { orderNumber: true, createdAt: true, customer: { select: { phone: true } } },
          orderBy: { createdAt: 'desc' },
        })
      : [];
    const existingByPhone = new Map<string, { orderNumber: string; createdAt: Date }>();
    for (const o of recent) {
      const p = o.customer?.phone;
      if (p && !existingByPhone.has(p)) existingByPhone.set(p, { orderNumber: o.orderNumber, createdAt: o.createdAt });
    }

    /** A blocked number never becomes an order, so it is said here and not at row forty. */
    const blocked = new Set<string>();
    for (const p of phones) {
      if (await activeBlock(db, companyId, p)) blocked.add(p);
    }

    /**
     * THE NAME IN THE SHEET, AGAINST THE CATALOGUE.
     *
     * `POST /api/orders` takes a product id, not a name — as it should: a
     * name is what somebody typed, and two products can be «كريم». So the
     * matching happens here, once, with the catalogue in hand, and the
     * screen never guesses. A row whose product we cannot find is reported
     * as a problem like any other and the person fixes it in the file.
     *
     * The matcher is the one the AI intake already uses. A second
     * name-matching rule would mean an order typed by hand and the same
     * order imported could land on two different products.
     */
    const catalogue = await db.product.findMany({
      where: { companyId, ...(storeId ? { storeId } : {}), status: 'ACTIVE' },
      select: { id: true, name: true, nameEn: true, sku: true, basePrice: true },
    });

    const rows = parsed.rows.map((r) => {
      const existing = r.phone ? existingByPhone.get(r.phone) : undefined;
      const isBlocked = !!r.phone && blocked.has(r.phone);
      const product = r.values.productName ? matchProduct(r.values.productName, catalogue) : null;
      const problems = product || !r.values.productName
        ? r.problems
        : [...r.problems, { field: 'productName', kind: 'MISSING' as const, ar: `لا منتج باسم «${r.values.productName}»` }];
      return {
        ...r,
        problems,
        productId: product?.id ?? null,
        productLabel: product?.name ?? null,
        blocked: isBlocked,
        existingOrder: existing ? { orderNumber: existing.orderNumber, at: existing.createdAt } : null,
        // What the screen ticks by default: nothing broken, nobody blocked.
        // A duplicate stays ticked — it is a warning, and the person looking
        // at the row is the one who knows whether it is a real second order.
        importable: problems.length === 0 && !isBlocked,
      };
    });

    return NextResponse.json({
      columns: IMPORT_COLUMNS.map((c) => ({ key: c.key, ar: c.ar, required: c.required, found: parsed.columns[c.key] !== undefined })),
      rows,
      counts: {
        total: rows.length,
        importable: rows.filter((r) => r.importable).length,
        problems: rows.filter((r) => r.problems.length > 0).length,
        duplicatesInFile: rows.filter((r) => r.duplicateOfLine !== null).length,
        alreadyOrdered: rows.filter((r) => r.existingOrder).length,
        blocked: rows.filter((r) => r.blocked).length,
      },
      recentDays: RECENT_DAYS,
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
