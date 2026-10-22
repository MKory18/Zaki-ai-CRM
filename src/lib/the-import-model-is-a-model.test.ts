import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isValidPhoneFor, PHONE_RULES, samplePhoneFor } from './phone-rules';
import { IMPORT_COLUMNS, importTemplateCsv, parseOrderSheet, sampleRows, TEMPLATE_EXAMPLES } from './order-import';
import { matchProduct } from './order-parser';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * THE MODEL FILE OF AN ORDER IMPORT IS A MODEL — «لما اعمل استثيراد طلبات ما في ملف مرجعي نموذج» (THE OWNER, 21/10).
 *
 * The file existed and was no use as a model. Its one example row was Syrian whoever downloaded it: a phone the rule of a
 * Jordanian store refuses, a product no store has — so the model's own row came back «فيه نقص» — and its price cell was EMPTY,
 * which `POST /api/orders` stored as a price of ZERO (an empty price is a refused row now — 22/10, the owner's ruling «ارفض الصف»).
 * So what is held here is not «a file is returned» but that the example rows are
 * rows the importer ACCEPTS, for the store that downloaded them, against its own catalogue, through the real door — and that
 * where there is nothing real to give, nothing is invented.
 * ═══════════════════════════════════════════════════════════════════════
 */

const { db, requireContext, requirePermission, getPermissionScope, activeBlock } = vi.hoisted(() => ({
  db: {
    product: { findMany: vi.fn() },
    region: { findFirst: vi.fn() },
    order: { findMany: vi.fn() },
  },
  requireContext: vi.fn(),
  requirePermission: vi.fn(),
  getPermissionScope: vi.fn(),
  activeBlock: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ db }));
vi.mock('@/lib/geo-context', () => ({ requireContext: (...a: unknown[]) => requireContext(...a) }));
vi.mock('@/lib/authorization', () => ({
  requirePermission: (...a: unknown[]) => requirePermission(...a),
  getPermissionScope: (...a: unknown[]) => getPermissionScope(...a),
}));
vi.mock('@/lib/blacklist', () => ({ activeBlock: (...a: unknown[]) => activeBlock(...a) }));

import { GET, POST } from '@/app/api/orders/import/route';

const JO = { id: 'co-jo', code: 'JO', minorUnit: 3, currencyCode: 'JOD' };
const SY = { id: 'co-sy', code: 'SY', minorUnit: 2, currencyCode: 'SYP' };
const CTX = (country = JO, storeId: string | null = 's1') => ({ user: { id: 'u1' }, companyId: 'c1', storeId, country });
const stock = (name: string, basePrice: number) => ({ name, basePrice });

beforeEach(() => {
  vi.clearAllMocks();
  requireContext.mockResolvedValue(CTX());
  requirePermission.mockResolvedValue(undefined);
  getPermissionScope.mockReturnValue({ scope: 'ALL_COMPANY' });
  activeBlock.mockResolvedValue(null);
  db.product.findMany.mockResolvedValue([stock('كريم مرطّب', 12.5), stock('ساعة ذكية', 80)]);
  db.region.findFirst.mockResolvedValue({ name: 'عمّان' });
  db.order.findMany.mockResolvedValue([]);
});

const download = async () => {
  const res = await GET();
  return { res, csv: await res.text() };
};

describe('a phone for every country the system has a rule for', () => {
  it('— each rule carries a sample its OWN rule accepts, in Latin digits', () => {
    for (const [code, rule] of Object.entries(PHONE_RULES)) {
      expect(isValidPhoneFor(code, rule.sample), `${code}: ${rule.sample}`).toBe(true);
      expect(rule.sample, code).toMatch(/^[0-9]+$/);
    }
  });

  it('and the sample is not the placeholder — «07XXXXXXXX» says what a number looks like, and a sample row needs one that passes', () => {
    for (const [code, rule] of Object.entries(PHONE_RULES)) expect(rule.sample, code).not.toBe(rule.example);
  });

  it('and a number of one country is refused by another — so the Syrian sample the file used to carry could not have served a Jordanian store', () => {
    expect(isValidPhoneFor('JO', PHONE_RULES.SY.sample)).toBe(false);
    expect(isValidPhoneFor('SY', PHONE_RULES.JO.sample)).toBe(false);
  });

  it('and a country with no rule still gets a number the permissive check accepts', () => {
    for (const code of ['ZZ', 'XX', '', null, undefined]) {
      expect(isValidPhoneFor(code, samplePhoneFor(code)), String(code)).toBe(true);
    }
  });

  it('and the code is read the way the rule table reads it — lower case, padded', () => {
    expect(samplePhoneFor(' jo ')).toBe(PHONE_RULES.JO.sample);
  });
});

describe('the example rows', () => {
  const input = (over: Record<string, unknown> = {}) => ({
    phone: '0791234567',
    region: 'عمّان',
    minorUnit: 3,
    products: [
      { name: 'كريم مرطّب', price: 12.5 },
      { name: 'ساعة ذكية', price: 80 },
      { name: 'طاقية إنبات', price: 25 },
      { name: 'منتج رابع', price: 9 },
    ],
    ...over,
  });

  it('— are the store’s own products, in the order given, at most three', () => {
    const rows = sampleRows(input());
    expect(rows.map((r) => r.productName)).toEqual(['كريم مرطّب', 'ساعة ذكية', 'طاقية إنبات']);
    expect(rows).toHaveLength(TEMPLATE_EXAMPLES);
  });

  it('and the price of a row is for the WHOLE line — the product’s price times the row’s quantity, in the currency’s own minor unit', () => {
    const rows = sampleRows(input({ products: [{ name: 'أ', price: 12.5 }, { name: 'ب', price: 7.125 }], minorUnit: 2 }));
    expect(rows.map((r) => [r.quantity, r.sellingPrice])).toEqual([[1, 12.5], [2, 14.25]]);
  });

  it('and a price is rounded to the currency’s own places — three for the dinar, two for the pound', () => {
    const three = sampleRows(input({ products: [{ name: 'أ', price: 3.333 }], minorUnit: 3 }));
    expect(three[0].sellingPrice).toBe(3.333);
    const two = sampleRows(input({ products: [{ name: 'أ', price: 3.333 }, { name: 'ب', price: 3.333 }], minorUnit: 2 }));
    expect(two.map((r) => r.sellingPrice)).toEqual([3.33, 6.67]);
  });

  it('and no price is empty or zero — an empty cell is a refused row, and a zero is a free order', () => {
    for (const r of sampleRows(input())) expect(r.sellingPrice).toBeGreaterThan(0);
  });

  it('and a product with no real price is not an example', () => {
    const rows = sampleRows(input({ products: [{ name: 'مجّاني', price: 0 }, { name: 'سالب', price: -5 }, { name: 'ليس رقماً', price: Number.NaN }, { name: 'لا نهاية', price: Number.POSITIVE_INFINITY }, { name: 'سليم', price: 10 }] }));
    expect(rows.map((r) => r.productName)).toEqual(['سليم']);
  });

  it('and a name that Excel would run as a formula, or that would split the row, is not an example — the next product takes its place', () => {
    const rows = sampleRows(
      input({
        products: [
          { name: '=HYPERLINK("http://x")', price: 5 },
          { name: '+cmd', price: 5 },
          { name: '-1+1', price: 5 },
          { name: '@SUM(A1)', price: 5 },
          { name: 'سطرٌ\nثانٍ', price: 5 },
          { name: 'اسمٌ سليم', price: 6 },
          { name: '   ', price: 7 },
        ],
      })
    );
    expect(rows.map((r) => r.productName)).toEqual(['اسمٌ سليم']);
  });

  it('and the phone is the one given with its last digit moved on per row — three numbers, all valid, no «same number twice»', () => {
    const phones = sampleRows(input()).map((r) => r.customerPhone);
    expect(phones).toEqual(['0791234567', '0791234568', '0791234569']);
    for (const ph of phones) expect(isValidPhoneFor('JO', ph), ph).toBe(true);
  });

  it('and a last digit of 9 wraps to 0 and 1 — still a valid number, still all different', () => {
    const phones = sampleRows(input({ phone: '0791234569' })).map((r) => r.customerPhone);
    expect(phones).toEqual(['0791234569', '0791234560', '0791234561']);
    expect(new Set(phones).size).toBe(3);
  });

  it('and the region is the store’s own — or empty when it has none', () => {
    expect(sampleRows(input()).every((r) => r.customerCity === 'عمّان')).toBe(true);
    expect(sampleRows(input({ region: null })).every((r) => r.customerCity === '')).toBe(true);
  });

  it('and with no product to give there is no example row — nothing is invented', () => {
    expect(sampleRows(input({ products: [] }))).toEqual([]);
  });
});

describe('the file', () => {
  const rows = () => sampleRows({ phone: '0791234567', region: 'عمّان', minorUnit: 3, products: [{ name: 'كريم مرطّب', price: 12.5 }, { name: 'ساعة ذكية', price: 80 }] });

  it('— is the header alone when there are no rows, and the header is every column the parser reads, the required ones starred', () => {
    const csv = importTemplateCsv();
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const lines = csv.trim().split('\n');
    expect(lines).toHaveLength(1);
    for (const c of IMPORT_COLUMNS) expect(lines[0]).toContain(c.required ? `${c.ar} *` : c.ar);
  });

  it('and a row has a cell for every column the parser reads, in the parser’s own order', () => {
    const csv = importTemplateCsv(rows());
    const lines = csv.replace(/^﻿/, '').trim().split('\n');
    expect(lines).toHaveLength(3);
    expect(lines[1].split(',')).toHaveLength(IMPORT_COLUMNS.length);
  });

  it('and the parser accepts every example row: no problem on any of them, the figures read as the numbers they were', () => {
    const out = parseOrderSheet(importTemplateCsv(rows()));
    expect(out.error).toBeUndefined();
    expect(out.missingRequired).toEqual([]);
    expect(out.rows).toHaveLength(2);
    for (const r of out.rows) expect(r.problems, `السطر ${r.line}`).toEqual([]);
    expect(out.rows.map((r) => [r.quantity, r.sellingPrice])).toEqual([[1, 12.5], [2, 160]]);
    expect(out.rows.every((r) => r.duplicateOfLine === null), 'أمثلةٌ مكرَّرة').toBe(true);
  });

  it('and the column an example does not fill — the alternative phone — is an EMPTY cell, not the word «undefined»', () => {
    const out = parseOrderSheet(importTemplateCsv(rows()));
    for (const r of out.rows) expect(r.values.customerAltPhone).toBe('');
  });

  it('and a name with a comma or a quote in it survives the round trip — it is quoted, not split into two columns', () => {
    const odd = sampleRows({ phone: '0791234567', region: 'عمّان', minorUnit: 2, products: [{ name: 'كريم، مرطّب "فاخر"', price: 10 }] });
    const out = parseOrderSheet(importTemplateCsv(odd));
    expect(out.rows[0].values.productName).toBe('كريم، مرطّب "فاخر"');
    expect(out.rows[0].problems).toEqual([]);
  });
});

describe('the door gives the file to the store that asked', () => {
  it('— the example rows are the store’s own: its own active products at their prices, a number its country accepts, one of its regions', async () => {
    const { csv } = await download();
    const out = parseOrderSheet(csv);
    expect(out.rows.map((r) => r.values.productName)).toEqual(['كريم مرطّب', 'ساعة ذكية']);
    expect(out.rows.map((r) => r.sellingPrice)).toEqual([12.5, 160]);
    expect(out.rows.every((r) => r.values.customerCity === 'عمّان')).toBe(true);
    for (const r of out.rows) expect(isValidPhoneFor('JO', r.values.customerPhone)).toBe(true);
  });

  it('and a store of ANOTHER country gets ITS number — not the Syrian one the file used to carry', async () => {
    requireContext.mockResolvedValue(CTX(SY));
    db.region.findFirst.mockResolvedValue({ name: 'حمص' });
    const { csv } = await download();
    const out = parseOrderSheet(csv);
    for (const r of out.rows) {
      expect(isValidPhoneFor('SY', r.values.customerPhone), r.values.customerPhone).toBe(true);
      expect(isValidPhoneFor('JO', r.values.customerPhone)).toBe(false);
    }
    expect(out.rows[0].values.customerCity).toBe('حمص');
  });

  it('and the price in the model is rounded to THIS store’s currency — the dinar keeps three places', async () => {
    db.product.findMany.mockResolvedValue([stock('عيّنة', 1.2345)]);
    const out = parseOrderSheet((await download()).csv);
    expect(out.rows[0].sellingPrice).toBe(1.235);
  });

  it('and the products are asked for THIS store’s catalogue — active ones with a price, in a fixed order, a dozen at most', async () => {
    await download();
    const args = db.product.findMany.mock.calls[0][0];
    expect(args.where).toEqual({ companyId: 'c1', storeId: 's1', status: 'ACTIVE', basePrice: { gt: 0 } });
    expect(args.orderBy).toEqual([{ name: 'asc' }, { id: 'asc' }]);
    expect(args.take).toBe(12);
    expect(Object.keys(args.select).sort()).toEqual(['basePrice', 'name']);
  });

  it('and with no store selected the company’s catalogue — as the products list reads it', async () => {
    requireContext.mockResolvedValue(CTX(JO, null));
    await download();
    expect(db.product.findMany.mock.calls[0][0].where).toEqual({ companyId: 'c1', status: 'ACTIVE', basePrice: { gt: 0 } });
  });

  it('and the region is the country’s own, active, first by its order', async () => {
    await download();
    expect(db.region.findFirst.mock.calls[0][0]).toEqual({
      where: { countryId: 'co-jo', isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: { name: true },
    });
  });

  it('and it is a download, in UTF-8, never cached — it is made from this store’s catalogue and not for the next person', async () => {
    const { res } = await download();
    expect(res.headers.get('Content-Type')).toBe('text/csv; charset=utf-8');
    expect(res.headers.get('Content-Disposition')).toContain('orders-template.csv');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it('and it is still `orders.create` that opens it', async () => {
    await download();
    expect(requirePermission).toHaveBeenCalledWith('orders.create');
  });
});

describe('where there is nothing real to give, nothing is invented', () => {
  it('— a store with no active priced product gets the header alone, and no query for a region', async () => {
    db.product.findMany.mockResolvedValue([]);
    const { csv } = await download();
    expect(csv.trim().split('\n')).toHaveLength(1);
    expect(db.region.findFirst).not.toHaveBeenCalled();
  });

  it('and a caller who may not see the products gets the header alone — `orders.create` is not `products.view`, and a model file is not a way to read a price', async () => {
    getPermissionScope.mockReturnValue(null);
    const { res, csv } = await download();
    // A header-only FILE, not an error body that happens to be one line long.
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('text/csv; charset=utf-8');
    for (const c of IMPORT_COLUMNS) expect(csv).toContain(c.ar);
    expect(csv.trim().split('\n')).toHaveLength(1);
    expect(db.product.findMany).not.toHaveBeenCalled();
    expect(csv).not.toContain('كريم');
  });

  it.each([
    ['a grant by CATEGORY', { scope: 'CATEGORY', scopeIds: ['cat-1'] }],
    ['a grant by SPECIFIC product', { scope: 'SPECIFIC', scopeIds: ['p1'] }],
  ])('and %s — a part of the catalogue — gets the header alone too', async (_name, scope) => {
    getPermissionScope.mockReturnValue(scope);
    const { csv } = await download();
    expect(csv.trim().split('\n')).toHaveLength(1);
    expect(db.product.findMany).not.toHaveBeenCalled();
  });

  it('and `products.view` is asked of THIS caller', async () => {
    await download();
    expect(getPermissionScope).toHaveBeenCalledWith(CTX().user, 'products.view');
  });

  it('and a store whose country has no region on file still gets example rows — with an empty city, not an invented one', async () => {
    db.region.findFirst.mockResolvedValue(null);
    const out = parseOrderSheet((await download()).csv);
    expect(out.rows).toHaveLength(2);
    expect(out.rows.every((r) => r.values.customerCity === '')).toBe(true);
  });
});

describe('and the model imports — through the real door', () => {
  /** The file the store downloaded, posted back the way the dialog posts a file. */
  const importIt = async (csv: string) => {
    const body = new FormData();
    body.append('file', new File([csv], 'orders.csv', { type: 'text/csv' }));
    const res = await POST(new Request('http://localhost/api/orders/import', { method: 'POST', body }));
    return { res, data: (await res.json()) as any };
  };

  beforeEach(() => {
    // The import door matches names against `{ id, name, nameEn, sku, basePrice }` — the catalogue of the same store.
    db.product.findMany.mockImplementation(async (args: { select?: Record<string, boolean> }) =>
      args.select && 'sku' in args.select
        ? [
            { id: 'p-1', name: 'كريم مرطّب', nameEn: null, sku: 'CR-1', basePrice: 12.5 },
            { id: 'p-2', name: 'ساعة ذكية', nameEn: null, sku: 'WT-1', basePrice: 80 },
          ]
        : [stock('كريم مرطّب', 12.5), stock('ساعة ذكية', 80)]
    );
  });

  it('— every example row of the model comes back importable: no problem, its product found in the catalogue, nobody blocked', async () => {
    const { csv } = await download();
    const { res, data } = await importIt(csv);
    expect(data.counts, 'صفوفُ النموذج نفسِه لا تمرّ').toMatchObject({ total: 2, importable: 2, problems: 0, blocked: 0 });
    expect(res.status).toBe(200);
    expect(data.rows.map((r: any) => r.productId)).toEqual(['p-1', 'p-2']);
    expect(data.rows.every((r: any) => r.importable)).toBe(true);
  });

  it('and the same is true for a store of another country — its own number is a number ITS door accepts', async () => {
    requireContext.mockResolvedValue(CTX(SY));
    const { csv } = await download();
    const { data } = await importIt(csv);
    expect(data.counts).toMatchObject({ total: 2, importable: 2, problems: 0 });
  });

  it('and the product names in the model are found by the one matcher the AI intake uses — the same name lands on the same product', async () => {
    const out = parseOrderSheet((await download()).csv);
    const catalogue = [
      { id: 'p-1', name: 'كريم مرطّب', sku: 'CR-1' },
      { id: 'p-2', name: 'ساعة ذكية', sku: 'WT-1' },
    ];
    expect(out.rows.map((r) => matchProduct(r.values.productName, catalogue)?.id)).toEqual(['p-1', 'p-2']);
  });
});
