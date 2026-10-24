import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';

const { logAudit } = vi.hoisted(() => ({ logAudit: vi.fn() }));
vi.mock('@/lib/audit', () => ({ logAudit: (...a: unknown[]) => logAudit(...a) }));

import { applyCategories, LEFT_UNFILED, PLAN } from '../../scripts/sehha/categories';

/**
 * «التصنيفات: صنّف المنتجات إنت بناءً على مواصفات المنتج وأظهر هذا الشي بالمتجر».
 *
 * Each product goes on the shelf its name says it belongs to; the ones whose name says nothing stay unfiled and
 * are reported; a product somebody already filed is never moved; a shelf that exists is reused, never doubled.
 * The shop shows the shelves by itself (the catalogue reads its products' categories).
 */

const STORE = { id: 'st1', companyId: 'co1', name: 'متجر صحة بلس' };
const ALL = ['LEG-1', 'LEG-2', 'LEG-3', 'LEG-4', 'LEG-5', 'LEG-6', 'LEG-7', 'LEG-8', 'LEG-9', 'LEG-10', 'LEG-11', 'LEG-12', 'LEG-13', 'LEG-14', 'LEG-15', 'LEG-16', 'LEG-17', 'LEG-18', 'LEG-19', 'LEG-20', 'LEG-21', 'LEG-22', 'LEG-23', 'HOODIE-01'];

interface P { id: string; sku: string; name: string; categoryId: string | null; category: { name: string } | null }

function fake(opts: { stores?: unknown[]; products?: P[]; categories?: { id: string; name: string }[] } = {}) {
  const products: P[] = opts.products ?? ALL.map((sku) => ({ id: `id-${sku}`, sku, name: sku, categoryId: null, category: null }));
  const cats = [...(opts.categories ?? [])];
  const db = {
    store: { findMany: vi.fn(async () => opts.stores ?? [STORE]) },
    product: {
      findMany: vi.fn(async () => products),
      updateMany: vi.fn(async ({ where, data }: { where: { id: string; categoryId: null }; data: { categoryId: string } }) => {
        const p = products.find((x) => x.id === where.id);
        if (!p || p.categoryId !== null) return { count: 0 };
        p.categoryId = data.categoryId;
        p.category = { name: cats.find((c) => c.id === data.categoryId)!.name };
        return { count: 1 };
      }),
    },
    category: {
      findFirst: vi.fn(async ({ where }: { where: { name: string } }) => cats.find((c) => c.name === where.name) ?? null),
      create: vi.fn(async ({ data }: { data: { name: string } }) => {
        const c = { id: `cat-${cats.length + 1}`, name: data.name };
        cats.push(c);
        return c;
      }),
    },
  };
  return { db: db as unknown as PrismaClient, raw: db, products, cats };
}

const run = (db: PrismaClient, apply: boolean) => applyCategories({ db, log: () => undefined }, { apply });
beforeEach(() => vi.clearAllMocks());

describe('the plan', () => {
  it('puts every product on at most one shelf, and none of the left-unfiled ones on any', () => {
    const skus = PLAN.flatMap((p) => p.skus);
    expect(new Set(skus).size).toBe(skus.length);
    for (const s of LEFT_UNFILED) expect(skus).not.toContain(s);
  });

  it('files by what a thing IS: a cream is skin care, a heater is heating, a laser is a device, a hoodie is clothing', () => {
    const shelf = (sku: string) => PLAN.find((p) => p.skus.includes(sku))?.name;
    expect(shelf('LEG-4')).toBe('العناية بالبشرة والجسم');
    expect(shelf('LEG-13')).toBe('أجهزة منزلية وتدفئة');
    expect(shelf('LEG-16')).toBe('أجهزة العناية والليزر');
    expect(shelf('HOODIE-01')).toBe('ملابس');
    expect(shelf('LEG-18')).toBe('الصحة والعلاجات');
    expect(shelf('LEG-23')).toBe('العناية بالشعر');
  });
});

describe('applying', () => {
  it('a dry run writes nothing, but names the shelves it would make and the products it would file', async () => {
    const { db, raw } = fake();
    const r = await run(db, false);
    expect(raw.category.create).not.toHaveBeenCalled();
    expect(raw.product.updateMany).not.toHaveBeenCalled();
    expect(logAudit).not.toHaveBeenCalled();
    expect(r.createdCategories).toHaveLength(PLAN.length);
    expect(r.filed).toHaveLength(PLAN.flatMap((p) => p.skus).length);
  });

  it('NEGATIVE: a dry run writes nothing even when the shelves already exist', async () => {
    const { db, raw } = fake({ categories: PLAN.map((p, i) => ({ id: `cat-${i}`, name: p.name })) });
    await run(db, false);
    expect(raw.product.updateMany).not.toHaveBeenCalled();
    expect(raw.category.create).not.toHaveBeenCalled();
    expect(logAudit).not.toHaveBeenCalled();
  });

  it('--apply creates the shelves and files each product on its own, each act audited', async () => {
    const { db, products, cats } = fake();
    const r = await run(db, true);
    expect(cats.map((c) => c.name).sort()).toEqual(PLAN.map((p) => p.name).sort());
    for (const plan of PLAN) {
      const cat = cats.find((c) => c.name === plan.name)!;
      for (const s of plan.skus) expect(products.find((p) => p.sku === s)!.categoryId, s).toBe(cat.id);
    }
    expect(logAudit.mock.calls.filter((c) => c[0].action === 'CATEGORY_CREATED')).toHaveLength(PLAN.length);
    expect(logAudit.mock.calls.filter((c) => c[0].action === 'PRODUCT_UPDATED')).toHaveLength(r.filed.length);
  });

  it('the products whose names say nothing stay unfiled and are named in the report', async () => {
    const { db, products } = fake();
    const r = await run(db, true);
    for (const s of LEFT_UNFILED) expect(products.find((p) => p.sku === s)!.categoryId, s).toBeNull();
    expect(r.unfiled.map((u) => u.sku).sort()).toEqual([...LEFT_UNFILED].sort());
  });

  it('runs twice and the second run creates and files nothing', async () => {
    const { db, raw } = fake();
    await run(db, true);
    const creates = raw.category.create.mock.calls.length;
    logAudit.mockClear();
    const again = await run(db, true);
    expect(again.createdCategories).toEqual([]);
    expect(again.filed).toEqual([]);
    expect(raw.category.create.mock.calls.length).toBe(creates);
    expect(logAudit).not.toHaveBeenCalled();
  });

  it('a shelf that already exists (ملابس) is reused, not made again', async () => {
    const { db, raw, cats } = fake({ categories: [{ id: 'cat-0', name: 'ملابس' }] });
    await run(db, true);
    expect(cats.filter((c) => c.name === 'ملابس')).toHaveLength(1);
    expect(raw.category.create.mock.calls.map((c) => c[0].data.name)).not.toContain('ملابس');
  });

  it('NEGATIVE: a product somebody already filed is never moved, and the report says so', async () => {
    const products: P[] = ALL.map((sku) => ({
      id: `id-${sku}`, sku, name: sku,
      categoryId: sku === 'LEG-4' ? 'owner-cat' : null, category: sku === 'LEG-4' ? { name: 'اختياري' } : null,
    }));
    const { db } = fake({ products });
    const r = await run(db, true);
    expect(products.find((p) => p.sku === 'LEG-4')!.categoryId).toBe('owner-cat');
    expect(r.kept).toEqual([{ sku: 'LEG-4', name: 'LEG-4', category: 'اختياري' }]);
  });

  it('NEGATIVE: one filed a moment after the read is not overwritten (the update itself says categoryId is null)', async () => {
    const { db, raw, products } = fake();
    raw.product.updateMany.mockImplementation(async () => ({ count: 0 }));
    await run(db, true);
    expect(products.every((p) => p.categoryId === null)).toBe(true);
    expect(logAudit.mock.calls.filter((c) => c[0].action === 'PRODUCT_UPDATED')).toHaveLength(0);
    expect(raw.product.updateMany.mock.calls[0][0].where).toMatchObject({ companyId: 'co1', storeId: 'st1', categoryId: null });
  });

  it('a product missing from the store is reported, not invented', async () => {
    const products = ALL.filter((s) => s !== 'LEG-14').map((sku) => ({ id: `id-${sku}`, sku, name: sku, categoryId: null, category: null }));
    const { db } = fake({ products });
    const r = await run(db, true);
    expect(r.warnings.some((w) => w.includes('LEG-14'))).toBe(true);
  });

  it('NEGATIVE: no matching store, or two, stops before anything is written', async () => {
    for (const stores of [[], [STORE, { ...STORE, id: 'st2', name: 'صحة بلس' }]]) {
      const { db, raw } = fake({ stores });
      await expect(run(db, true)).rejects.toThrow(/بالضبط/);
      expect(raw.category.create).not.toHaveBeenCalled();
    }
  });
});
