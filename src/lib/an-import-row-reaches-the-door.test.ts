import { beforeEach, describe, expect, it, vi } from 'vitest';
import { repoFile, stripComments } from './guard-source';

/**
 * THE WHOLE PATH, FROM A CELL IN A SPREADSHEET TO THE ROW PRISMA IS HANDED.
 *
 * Ten vacuous guards have been found in this audit, and the shape of all ten
 * was the same: a test that asserted a reader in isolation while the thing
 * the reader fed went on unmeasured. The importer's defect is exactly that
 * shape in reverse — the reader is in `order-import.ts`, the figure it
 * produces is posted by `ImportOrdersDialog.tsx`, and the door that would
 * have refused a malformed number is `POST /api/orders`, three files away
 * and looking at a number that is already clean. No one of the three can be
 * tested alone and mean anything.
 *
 * So this file drives all four links:
 *
 *   1. a CSV with «٣٥٠٠» in the price column, through `POST /api/orders/import`
 *   2. the row that door answers with
 *   3. the request body `ImportOrdersDialog` builds — NOT retyped here but
 *      EVALUATED out of the component's own source, so a change to what the
 *      screen posts changes what this test posts
 *   4. the real `POST /api/orders`, with the figure read off
 *      `order.create`'s `data`
 *
 * THE ROW IS ASSERTED BEFORE THE STATUS CODE, deliberately. An earlier
 * agent's first draft asserted the status first, so when it was mutated the
 * output said «200 instead of 400» and the figure that had been stored never
 * appeared. A guard on money has to print the money.
 */

const { db, requireContext, requirePermission, activeBlock, logAudit, notify, noteCustomersHandedOut } =
  vi.hoisted(() => ({
    db: {
      region: { findFirst: vi.fn() },
      customerBlock: { findFirst: vi.fn() },
      customer: { findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
      product: { findFirst: vi.fn(), findMany: vi.fn() },
      store: { findFirst: vi.fn() },
      deliveryFee: { findFirst: vi.fn() },
      productionBatch: { findMany: vi.fn() },
      offer: { findFirst: vi.fn() },
      user: { findFirst: vi.fn() },
      order: { create: vi.fn(), count: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
      orderItem: { createMany: vi.fn() },
      orderActivity: { create: vi.fn() },
      orderStatusLog: { create: vi.fn() },
      $transaction: vi.fn(),
    },
    requireContext: vi.fn(),
    requirePermission: vi.fn(),
    activeBlock: vi.fn(),
    logAudit: vi.fn(),
    notify: vi.fn(),
    noteCustomersHandedOut: vi.fn(),
  }));

vi.mock('@/lib/db', () => ({ db }));
vi.mock('@/lib/geo-context', () => ({ requireContext: (...a: unknown[]) => requireContext(...a) }));
vi.mock('@/lib/audit', () => ({ logAudit: (...a: unknown[]) => logAudit(...a) }));
vi.mock('@/lib/notify', () => ({ notify: (...a: unknown[]) => notify(...a), afterResponse: (w: () => Promise<unknown>) => void w() }));
vi.mock('@/lib/pii-alert', () => ({
  noteCustomersHandedOut: (...a: unknown[]) => noteCustomersHandedOut(...a),
  distinctCustomers: () => 0,
}));
vi.mock('@/lib/blacklist', () => ({ activeBlock: (...a: unknown[]) => activeBlock(...a) }));
vi.mock('@/lib/authorization', () => ({
  requirePermission: (...a: unknown[]) => requirePermission(...a),
  getPermissionScope: () => ({ scope: 'ALL_COMPANY' }),
  can: () => true,
  authorize: () => ({ allowed: true }),
}));
vi.mock('@/lib/rbac', () => ({ applyQueueFilter: (_u: unknown, w: unknown) => w }));

import { POST as IMPORT } from '@/app/api/orders/import/route';
import { POST as CREATE } from '@/app/api/orders/route';

const PRODUCT = 'كريم مرطّب';
const PRODUCT_ID = '11111111-1111-4111-8111-111111111111';
const HEAD = ['الاسم', 'الهاتف', 'العنوان', 'المنتج', 'الكمية', 'السعر'];

/** A one-row sheet, posted as a file the way the screen posts it. */
async function readSheet(qty: string, price: string) {
  const csv = [HEAD, ['أحمد المغني', '0999123456', 'حمص — شارع الحضارة', PRODUCT, qty, price]]
    .map((r) => r.map((c) => (c.includes(',') ? `"${c}"` : c)).join(','))
    .join('\n');
  const body = new FormData();
  body.append('file', new File([csv], 'orders.csv', { type: 'text/csv' }));
  const res = await IMPORT(new Request('http://localhost/api/orders/import', { method: 'POST', body }));
  return { status: res.status, data: (await res.json()) as any };
}

/**
 * THE BODY THE SCREEN POSTS, TAKEN OUT OF THE SCREEN.
 *
 * `JSON.stringify({ … })` in `ImportOrdersDialog.run` is sliced out of the
 * component by balanced braces and evaluated with the row bound to `r`. A
 * body retyped here would be a test of what somebody remembered the screen
 * sending; this is a test of what it sends. If the literal cannot be found
 * or cannot be evaluated, the extraction throws and the test fails — it
 * cannot quietly fall back to a body of its own.
 */
function bodyTheScreenPosts(row: unknown): Record<string, unknown> {
  const src = stripComments(repoFile('src/components/orders/ImportOrdersDialog.tsx'));
  const marker = 'JSON.stringify(';
  const start = src.indexOf(marker);
  if (start < 0) throw new Error('الشاشةُ لم تَعُد تُسلسِلُ جسمَ الطلب');
  const open = src.indexOf('{', start);
  let depth = 0;
  let end = -1;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end < 0) throw new Error('جسمُ الطلبِ غيرُ متوازنِ الأقواس');
  const literal = src.slice(open, end + 1);
  // It must really be the order body, not some other object in the file.
  expect(literal, 'الجسمُ المُستخرَجُ ليس جسمَ الطلب').toContain('customerPhone');
  const make = new Function('r', 'return ' + literal) as (r: unknown) => Record<string, unknown>;
  return make(row);
}

beforeEach(() => {
  vi.clearAllMocks();
  requireContext.mockResolvedValue({
    user: { id: 'u1', name: 'Admin', role: 'COMPANY_ADMIN', status: 'ACTIVE' },
    companyId: 'c1',
    storeId: 's1',
    countryId: 'co-sy',
    country: { id: 'co-sy', currencyCode: 'SYP', minorUnit: 2, orderPrefix: 'SY', allowNegativeStock: false },
  });
  requirePermission.mockResolvedValue({});
  activeBlock.mockResolvedValue(false);
  db.customerBlock.findFirst.mockResolvedValue(null);
  db.order.findMany.mockResolvedValue([]);
  db.order.findFirst.mockResolvedValue(null);
  db.product.findMany.mockResolvedValue([
    { id: PRODUCT_ID, name: PRODUCT, nameEn: null, sku: 'SKU-1', basePrice: 14, image: null, batches: [] },
  ]);
  db.product.findFirst.mockResolvedValue({ id: PRODUCT_ID, name: PRODUCT, image: null, basePrice: 14, batches: [] });
  db.productionBatch.findMany.mockResolvedValue([]);
  // The store does not fold the delivery fee into the price, so the figure
  // the sheet carried is the figure stored — no arithmetic in between.
  db.store.findFirst.mockResolvedValue({ priceIncludesDelivery: false });
  db.deliveryFee.findFirst.mockResolvedValue(null);
  db.customer.findUnique.mockResolvedValue({ id: 'cust1', firstOrderDate: null });
  db.customer.findFirst.mockResolvedValue({ id: 'cust1', firstOrderDate: null });
  db.order.create.mockResolvedValue({ id: 'o1', orderNumber: 'SY-2026-0001' });
  db.$transaction.mockImplementation(async (fn: any) => (typeof fn === 'function' ? fn(db) : fn));
});

/** The figures of the row `order.create` was actually handed. */
const stored = () => {
  expect(db.order.create, 'لم يُنشَأْ طلبٌ أصلاً').toHaveBeenCalled();
  const data = db.order.create.mock.calls[0][0].data;
  return { sellingPrice: data.sellingPrice, quantity: data.quantity, totalAmount: data.totalAmount };
};

describe('a price typed on an Arabic keypad survives the whole import path', () => {
  /**
   * NOTHING IS ASSERTED UNTIL THE WHOLE PATH HAS RUN, and then the STORED
   * FIGURE is asserted first. A draft of this test checked the parsed row on
   * the way past, so breaking the reader printed «expected +0 to be 3500»
   * about an intermediate value and the row Prisma was handed never
   * appeared. The figure that matters is the one in the column.
   */
  it('three thousand five hundred is stored as 3500 — not as zero', async () => {
    const read = await readSheet('1', '٣٥٠٠');
    const row = read.data.rows[0];
    const body = bodyTheScreenPosts(row);
    const res = await CREATE(
      new Request('http://localhost/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
    );

    // THE ROW PRISMA WAS HANDED, before anything else is looked at.
    expect(stored().sellingPrice, 'بريزما استلمت سعراً غير الذي في الجدول').toBe(3500);
    expect(stored().quantity, 'وكميّةً غيرَ التي في الجدول').toBe(1);

    // Then the links, so a failure says WHICH of them broke.
    expect(read.status, JSON.stringify(read.data)).toBe(200);
    expect(row.sellingPrice, 'الباب الأول قرأ السعر خطأً').toBe(3500);
    expect(row.problems).toEqual([]);
    expect(row.importable).toBe(true);
    expect(body.sellingPrice, 'الشاشةُ لا تُرسِلُ السعرَ الذي قُرِئ').toBe(3500);
    expect(res.status).toBe(200);
  });

  it('and a quantity typed the same way reaches the door as a count', async () => {
    const read = await readSheet('٣', '12');
    const row = read.data.rows[0];
    expect(row.quantity, 'الكميّةُ العربيّةُ لم تُقرأ').toBe(3);

    const body = bodyTheScreenPosts(row);
    expect(body.quantity).toBe(3);

    await CREATE(
      new Request('http://localhost/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
    );
    expect(stored().quantity).toBe(3);
    expect(stored().sellingPrice).toBe(12);
  });
});

describe('and a cell nobody can read never becomes an order at all', () => {
  it('the import door marks the row unimportable and says why, in Arabic', async () => {
    const read = await readSheet('1', '3,5');
    const row = read.data.rows[0];
    expect(row.sellingPrice, 'سعرٌ مُلفَّقٌ من خليّةٍ غامضة').toBeNull();
    expect(row.importable).toBe(false);
    expect(row.problems.map((p: any) => p.kind)).toContain('BAD_PRICE');
    expect(row.problems.find((p: any) => p.field === 'sellingPrice').ar).toContain('3,5');
    // And nothing was written by the reading door itself.
    expect(db.order.create).not.toHaveBeenCalled();
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  /**
   * AND IF SOMETHING DID POST IT, the door refuses it — which is the second
   * half of the ruling. The screen cannot tick such a row, so this is the
   * state of the world below the screen: the figure the sheet carried is not
   * a figure the create door will accept either, once the importer stops
   * rewriting it into one.
   */
  it('and the raw cell, posted as it stands, is refused by the create door', async () => {
    const res = await CREATE(
      new Request('http://localhost/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName: 'أحمد المغني',
          customerPhone: '0999123456',
          customerAddress: 'حمص',
          productId: PRODUCT_ID,
          quantity: 1,
          sellingPrice: '3,5',
        }),
      })
    );
    expect(db.order.create, 'الباب كَتَبَ سعراً من خليّةٍ غامضة').not.toHaveBeenCalled();
    expect(res.status).toBe(400);
  });

  /**
   * FOUND WHILE MEASURING THIS PATH, MEASURED, AND OPEN.
   *
   * An EMPTY price cell is legal — the column is `required: false` and the
   * template this very parser generates ships an example row with the price
   * blank. It was assumed to mean «charge the product's own price». It does
   * not. The create door builds its line as
   *
   *     unitPrice: sellingPrice ?? 0
   *
   * and reads `basePrice` nowhere, so a blank price cell stores an order at
   * ZERO on a product whose catalogue price is 14. That is the same silent
   * zero this whole change was about, reached by a different road: not a
   * mis-read cell, an absent one.
   *
   * IT IS RECORDED AND NOT FIXED, because the fix is a ruling and not a
   * line of code — make the price column required for an import, or have
   * the import door fill the catalogue price it already loads, or have the
   * create door fall back to `basePrice` — and the two files that would
   * carry any of the three (`api/orders/import/route.ts`,
   * `api/orders/route.ts`) are outside this change. The figures are asserted
   * so that the day one of the three is chosen, this fails and the record
   * has to go.
   */
  it('AN OPEN FINDING: an empty price cell stores a free order, not the catalogue price', async () => {
    const read = await readSheet('2', '');
    const row = read.data.rows[0];

    // The importer is right to let it through: an empty cell is not a
    // mis-read one, and nothing here is guessing.
    expect(row.sellingPrice).toBeNull();
    expect(row.problems, 'خليّةٌ فارغةٌ صارت مشكلة').toEqual([]);
    expect(row.importable).toBe(true);

    const body = bodyTheScreenPosts(row);
    expect('sellingPrice' in body, 'الشاشةُ تُرسِلُ سعراً لم يُكتَب').toBe(false);

    await CREATE(
      new Request('http://localhost/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
    );

    // AND THIS IS THE OPEN FIGURE. The catalogue says 14; the order says 0.
    expect(stored().sellingPrice, 'الباب صار يَأخُذُ سعرَ المنتج — فالسجلُّ أعلاه لزِمَ حذفُه').toBe(0);
    expect(stored().totalAmount).toBe(0);
    expect(stored().quantity).toBe(2);
    const catalogue = db.product.findMany.mock.results[0]?.value;
    expect(catalogue, 'الكتالوجُ لم يُقرأ').toBeTruthy();
  });

  it('and an unreadable quantity leaves the screen nothing to send', async () => {
    const read = await readSheet('0x10', '12');
    const row = read.data.rows[0];
    expect(row.quantity, 'ستّةَ عشرَ وحدةً من «0x10»').toBeNull();
    expect(row.importable).toBe(false);

    // The screen refuses it rather than posting a quantity nobody typed.
    const src = stripComments(repoFile('src/components/orders/ImportOrdersDialog.tsx'));
    expect(src).toContain('if (!r.productId || r.quantity === null) {');
  });
});
