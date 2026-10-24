import type { PrismaClient } from '@prisma/client';
import { logAudit } from '../../src/lib/audit';
import { STORE_NAMES } from './catalog';

/**
 * تصنيف منتجات «صحة بلس» (25 منتجاً بالإنتاج) — بحسب ما هو المنتج (كريم، قطرة، جهاز، صوبة…).
 *
 * ── ما يضمنه ──
 *   • يصنّف فقط ما بلا تصنيف: منتج له تصنيف (اختاره صاحب المتجر) لا يُمسّ أبداً.
 *   • يستعمل تصنيفاً موجوداً بنفس الاسم (ككلّ «ملابس») ولا يكرّره، وينشئ الناقص فقط.
 *   • المنتجات الغامضة بالاسم (ما يُعرف من اسمها ما هي) تُترك بلا تصنيف وتُذكر بالتقرير — لا تخمين.
 *   • لا يحذف ولا يغيّر اسم تصنيف. تجربة بلا كتابة افتراضياً، و`--apply` للتنفيذ؛ إعادة التشغيل آمنة.
 *   • كل تصنيف جديد وكل منتج يُصنَّف يُسجَّل بسجل التدقيق.
 *   • يعمل على متجر واحد بالاسم، وإن لم يجده أو وجد أكثر من واحد يتوقف.
 *
 * التصنيفات تظهر بالمتجر وحدها: كتالوج المتجر يقرأ تصنيفات منتجاته (`storefrontCatalog`) ويعرضها أزرار تصفية.
 */

export interface CategoryPlan {
  name: string;
  nameEn: string;
  /** SKUs of the products that belong on this shelf. */
  skus: string[];
}

export const PLAN: CategoryPlan[] = [
  { name: 'العناية بالبشرة والجسم', nameEn: 'Skin & Body Care', skus: ['LEG-4', 'LEG-5', 'LEG-21', 'LEG-22', 'LEG-6', 'LEG-8'] },
  { name: 'العناية بالشعر', nameEn: 'Hair Care', skus: ['LEG-17', 'LEG-23'] },
  { name: 'الصحة والعلاجات', nameEn: 'Health & Remedies', skus: ['LEG-18', 'LEG-19', 'LEG-7'] },
  { name: 'أجهزة العناية والليزر', nameEn: 'Personal Care Devices', skus: ['LEG-10', 'LEG-16'] },
  { name: 'أجهزة منزلية وتدفئة', nameEn: 'Home Appliances & Heating', skus: ['LEG-11', 'LEG-12', 'LEG-13', 'LEG-15'] },
  { name: 'إلكترونيات', nameEn: 'Electronics', skus: ['LEG-14'] },
  { name: 'ملابس', nameEn: 'Clothing', skus: ['HOODIE-01'] },
  { name: 'مستلزمات منزلية', nameEn: 'Household', skus: ['LEG-3'] },
];

/**
 * Names that say nothing about what the thing IS — left unfiled on purpose, and reported.
 * (ماء الذهب · زيت الفلق · سليكس · بكج الزقات الصينية)
 */
export const LEFT_UNFILED = ['LEG-1', 'LEG-2', 'LEG-20', 'LEG-9'];

export interface CategoriesDeps {
  db: PrismaClient;
  log: (line: string) => void;
}

export interface CategoriesReport {
  store: string;
  createdCategories: string[];
  filed: { sku: string; name: string; category: string }[];
  kept: { sku: string; name: string; category: string }[];
  unfiled: { sku: string; name: string }[];
  warnings: string[];
}

export async function applyCategories(deps: CategoriesDeps, opts: { apply: boolean }): Promise<CategoriesReport> {
  const { db, log } = deps;
  const stores = await db.store.findMany({ where: { name: { in: STORE_NAMES } }, select: { id: true, companyId: true, name: true } });
  if (stores.length !== 1) {
    throw new Error(`وجدت ${stores.length} متجر بالأسماء ${STORE_NAMES.join(' / ')} — لازم واحد بالضبط، توقفت.`);
  }
  const { id: storeId, companyId, name: storeName } = stores[0];
  log(`${opts.apply ? 'تطبيق' : 'تجربة'} على المتجر «${storeName}»`);

  const report: CategoriesReport = { store: storeName, createdCategories: [], filed: [], kept: [], unfiled: [], warnings: [] };
  const products = await db.product.findMany({
    where: { companyId, storeId },
    select: { id: true, sku: true, name: true, categoryId: true, category: { select: { name: true } } },
  });
  const bySku = new Map(products.map((p) => [p.sku, p]));

  for (const plan of PLAN) {
    const wanted = plan.skus.map((s) => bySku.get(s)).filter((p): p is NonNullable<typeof p> => !!p);
    for (const s of plan.skus) if (!bySku.has(s)) report.warnings.push(`${s} غير موجود بالمتجر — تُخطّي`);
    const toFile = wanted.filter((p) => !p.categoryId);
    for (const p of wanted.filter((x) => x.categoryId)) report.kept.push({ sku: p.sku, name: p.name, category: p.category?.name ?? '?' });
    if (!toFile.length) continue;

    let category = await db.category.findFirst({ where: { companyId, name: plan.name }, select: { id: true } });
    if (!category) {
      report.createdCategories.push(plan.name);
      if (opts.apply) {
        category = await db.category.create({ data: { companyId, name: plan.name, nameEn: plan.nameEn }, select: { id: true } });
        await logAudit({
          companyId, userId: null, action: 'CATEGORY_CREATED', entity: 'Category', entityId: category.id,
          newData: { name: plan.name, via: 'scripts/apply-sehha-categories' },
        });
      }
    }
    for (const p of toFile) {
      report.filed.push({ sku: p.sku, name: p.name, category: plan.name });
      if (opts.apply && category) {
        // `categoryId: null` in the WHERE: a product somebody filed a moment ago is never overwritten.
        const done = await db.product.updateMany({ where: { id: p.id, companyId, storeId, categoryId: null }, data: { categoryId: category.id } });
        if (done.count === 1) {
          await logAudit({
            companyId, userId: null, action: 'PRODUCT_UPDATED', entity: 'Product', entityId: p.id,
            previousData: { categoryId: null }, newData: { categoryId: category.id, category: plan.name, via: 'scripts/apply-sehha-categories' },
          });
        }
      }
    }
  }

  const planned = new Set(PLAN.flatMap((p) => p.skus));
  for (const p of products) {
    if (!p.categoryId && !planned.has(p.sku)) report.unfiled.push({ sku: p.sku, name: p.name });
  }

  log(`${opts.apply ? '✔' : '·'} تصنيفات جديدة: ${report.createdCategories.join('، ') || 'لا شيء'}`);
  for (const f of report.filed) log(`   ${opts.apply ? '✔' : '·'} ${f.sku} «${f.name}» ← ${f.category}`);
  for (const k of report.kept) log(`   = ${k.sku} «${k.name}» له تصنيف (${k.category}) — لم يُمسّ`);
  for (const u of report.unfiled) log(`   ? ${u.sku} «${u.name}» — بلا تصنيف (الاسم لا يدل على نوعه)، صنّفه من «المنتجات»`);
  for (const w of report.warnings) log(`   ⚠ ${w}`);
  if (!opts.apply) log('\nتجربة بلا كتابة. للتطبيق: أضف --apply');
  return report;
}
