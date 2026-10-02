/**
 * A CATALOGUE TO LOOK AT — added to a shop that already exists.
 *
 * NOT `prisma/seed.ts`. That one builds a world from nothing and would
 * take this database's company, users and stores with it. This adds
 * rows to ONE existing shop and touches nothing else, because the thing
 * it is for is looking at a storefront that has been built blind: every
 * page, every template and every fact engine in this system is correct
 * and shows nothing, because `products` is 0.
 *
 * IT IS ADDITIVE AND IDEMPOTENT. Nothing is deleted, and a product whose
 * SKU is already there is left exactly as it is — so running it twice is
 * the same as running it once, and running it on a shop somebody has
 * edited does not undo their edits.
 *
 * IT IS FOR A DEVELOPMENT DATABASE. It refuses to run against anything
 * whose DATABASE_URL is not local, because demo products in a real shop
 * are products a real customer can order.
 *
 *   npx tsx scripts/demo-catalogue.ts [store-slug]
 */
import { PrismaClient } from '@prisma/client';
import { slugify, uniqueSlug } from '../src/lib/slug';
import { STORE_TEMPLATES } from '../src/lib/store-templates';
import { skinToStoreTheme } from '../src/lib/store-skin';

const db = new PrismaClient();

/** The questions this kind of thing is described by. */
const CATEGORIES = [
  {
    name: 'العناية بالبشرة',
    fields: [
      { key: 'need', label: 'مناسب لـ', kind: 'multi', options: ['جفاف', 'حبوب', 'تصبّغات', 'تجاعيد'], unit: '' },
      { key: 'skin', label: 'نوع البشرة', kind: 'select', options: ['جافة', 'دهنية', 'مختلطة', 'حساسة'], unit: '' },
      { key: 'ml', label: 'الحجم', kind: 'number', options: [], unit: 'مل' },
      { key: 'made', label: 'المكوّنات', kind: 'text', options: [], unit: '' },
    ],
  },
  {
    name: 'العناية بالشعر',
    fields: [
      { key: 'need', label: 'مناسب لـ', kind: 'multi', options: ['تساقط', 'قشرة', 'جفاف', 'تقصّف'], unit: '' },
      { key: 'ml', label: 'الحجم', kind: 'number', options: [], unit: 'مل' },
    ],
  },
  {
    name: 'مكمّلات',
    fields: [
      { key: 'need', label: 'مناسب لـ', kind: 'multi', options: ['نوم', 'مفاصل', 'مناعة', 'طاقة'], unit: '' },
      { key: 'age', label: 'الفئة العمرية', kind: 'select', options: ['بالغون', 'كبار السن', 'أطفال'], unit: '' },
      { key: 'made', label: 'المكوّنات', kind: 'text', options: [], unit: '' },
    ],
  },
];

interface Seedling {
  name: string;
  sku: string;
  category: string;
  price: number;
  description: string;
  attributes: Record<string, unknown>;
  /** quantity, free, price — the bundles a shopper chooses between. */
  offers: [number, number, number][];
}

const PRODUCTS: Seedling[] = [
  {
    name: 'كريم مرطّب للوجه',
    sku: 'SKIN-01',
    category: 'العناية بالبشرة',
    price: 14,
    description: 'كريم يوميّ للبشرة الجافة، بملمس خفيف لا يترك أثراً دهنياً.',
    attributes: { need: ['جفاف'], skin: 'جافة', ml: 50, made: 'ماء، جلسرين، زبدة الشيا، فيتامين هـ' },
    offers: [[1, 0, 14], [2, 0, 25], [3, 1, 36]],
  },
  {
    name: 'غسول للبشرة الدهنية',
    sku: 'SKIN-02',
    category: 'العناية بالبشرة',
    price: 9,
    description: 'غسول يوميّ ينظّف دون أن يسحب رطوبة البشرة.',
    attributes: { need: ['حبوب'], skin: 'دهنية', ml: 150, made: 'ماء، حمض الساليسيليك، ألوفيرا' },
    offers: [[1, 0, 9], [2, 0, 16]],
  },
  {
    name: 'سيروم فيتامين سي',
    sku: 'SKIN-03',
    category: 'العناية بالبشرة',
    price: 22,
    description: 'سيروم للتصبّغات، يُستعمل صباحاً تحت الواقي الشمسي.',
    attributes: { need: ['تصبّغات', 'تجاعيد'], skin: 'مختلطة', ml: 30, made: 'فيتامين سي ١٥٪، حمض الفيروليك' },
    offers: [[1, 0, 22], [2, 0, 40]],
  },
  {
    name: 'كريم ليلي للتجاعيد',
    sku: 'SKIN-04',
    category: 'العناية بالبشرة',
    price: 28,
    description: 'كريم كثيف للاستعمال الليلي.',
    attributes: { need: ['تجاعيد', 'جفاف'], skin: 'جافة', ml: 50, made: 'ريتينول، سكوالان' },
    offers: [[1, 0, 28], [2, 0, 52]],
  },
  {
    name: 'واقٍ شمسي SPF 50',
    sku: 'SKIN-05',
    category: 'العناية بالبشرة',
    price: 17,
    description: 'واقٍ يوميّ لا يترك طبقة بيضاء.',
    attributes: { need: ['تصبّغات'], skin: 'حساسة', ml: 60, made: 'أكسيد الزنك' },
    offers: [[1, 0, 17], [3, 1, 45]],
  },
  {
    name: 'زيت الأرغان للشعر',
    sku: 'HAIR-01',
    category: 'العناية بالشعر',
    price: 12,
    description: 'زيت للأطراف المتقصّفة، قطرات بعد الاستحمام.',
    attributes: { need: ['تقصّف', 'جفاف'], ml: 100 },
    offers: [[1, 0, 12], [2, 1, 22]],
  },
  {
    name: 'شامبو ضد القشرة',
    sku: 'HAIR-02',
    category: 'العناية بالشعر',
    price: 11,
    description: 'شامبو طبّي، مرّتين أسبوعياً.',
    attributes: { need: ['قشرة'], ml: 250 },
    offers: [[1, 0, 11], [2, 0, 20]],
  },
  {
    name: 'سيروم لتساقط الشعر',
    sku: 'HAIR-03',
    category: 'العناية بالشعر',
    price: 26,
    description: 'سيروم لفروة الرأس، يُستعمل ليلاً.',
    attributes: { need: ['تساقط'], ml: 60 },
    offers: [[1, 0, 26], [3, 1, 70]],
  },
  {
    name: 'مكمّل المغنيسيوم للنوم',
    sku: 'SUP-01',
    category: 'مكمّلات',
    price: 15,
    description: 'قرص قبل النوم بساعة.',
    attributes: { need: ['نوم'], age: 'بالغون', made: 'مغنيسيوم جلايسينات ٤٠٠ ملغ' },
    offers: [[1, 0, 15], [2, 0, 28], [3, 1, 40]],
  },
  {
    name: 'كولاجين للمفاصل',
    sku: 'SUP-02',
    category: 'مكمّلات',
    price: 32,
    description: 'مسحوق يومي، يُذاب في ماء أو عصير.',
    attributes: { need: ['مفاصل'], age: 'كبار السن', made: 'كولاجين النوع الثاني، فيتامين سي' },
    offers: [[1, 0, 32], [2, 0, 60]],
  },
  {
    name: 'فيتامين د ٥٠٠٠',
    sku: 'SUP-03',
    category: 'مكمّلات',
    price: 10,
    description: 'قرص أسبوعي أو حسب وصف الطبيب.',
    attributes: { need: ['مناعة'], age: 'بالغون', made: 'فيتامين د٣' },
    offers: [[1, 0, 10], [3, 1, 27]],
  },
  {
    name: 'شراب حديد للأطفال',
    sku: 'SUP-04',
    category: 'مكمّلات',
    price: 13,
    description: 'شراب بطعم مقبول، ملعقة يومياً.',
    attributes: { need: ['طاقة', 'مناعة'], age: 'أطفال', made: 'حديد، فيتامين ب١٢' },
    offers: [[1, 0, 13], [2, 0, 24]],
  },
];

async function main() {
  const url = process.env.DATABASE_URL ?? '';
  if (!/@(localhost|127\.0\.0\.1)[:/]/.test(url)) {
    throw new Error('هذه البذرة للتطوير فقط — DATABASE_URL ليست محليّة.');
  }

  const slug = process.argv[2] ?? 'main';
  const store = await db.store.findFirst({ where: { slug } });
  if (!store) throw new Error(`لا متجر بالاسم «${slug}»`);
  const companyId = store.companyId;

  // ── The categories, and the questions each is described by ──
  const categoryIds = new Map<string, string>();
  for (const c of CATEGORIES) {
    const existing = await db.category.findFirst({ where: { companyId, name: c.name } });
    const row = existing
      ? await db.category.update({
          where: { id: existing.id },
          data: { attributeSchema: JSON.stringify(c.fields), slug: slugify(c.name) },
        })
      : await db.category.create({
          data: {
            companyId,
            name: c.name,
            attributeSchema: JSON.stringify(c.fields),
            slug: slugify(c.name),
          },
        });
    categoryIds.set(c.name, row.id);
  }

  // ── The products, their addresses and their bundles ──
  const taken = new Set(
    (await db.product.findMany({ where: { storeId: store.id }, select: { slug: true } }))
      .flatMap((p) => (p.slug ? [p.slug] : []))
  );

  let made = 0;
  let skipped = 0;
  for (const p of PRODUCTS) {
    const already = await db.product.findFirst({ where: { companyId, storeId: store.id, sku: p.sku } });
    if (already) {
      skipped++;
      continue;
    }

    const address = uniqueSlug(slugify(p.name), taken);
    if (address) taken.add(address);

    const product = await db.product.create({
      data: {
        companyId,
        storeId: store.id,
        name: p.name,
        sku: p.sku,
        slug: address || null,
        description: p.description,
        basePrice: p.price,
        status: 'ACTIVE',
        categoryId: categoryIds.get(p.category) ?? null,
        attributes: JSON.stringify(p.attributes),
      },
    });

    for (const [quantity, free, price] of p.offers) {
      await db.offer.create({
        data: {
          companyId,
          productId: product.id,
          name: free > 0 ? `${quantity} + ${free} مجاناً` : quantity > 1 ? `${quantity} قطع` : 'قطعة واحدة',
          quantity,
          freeQuantity: free,
          sellingPrice: price,
          deliveryIncluded: true,
          isDefault: quantity === 1,
          sortOrder: quantity,
          status: 'ACTIVE',
        },
      });
    }
    made++;
  }

  // ── And the shop opens, wearing a template ──
  const template = STORE_TEMPLATES.find((t) => t.id === 'lab')!;
  const theme = skinToStoreTheme(template);
  await db.store.update({
    where: { id: store.id },
    data: {
      storefrontEnabled: true,
      theme: JSON.stringify({
        accent: theme.accent,
        mood: theme.mood,
        font: theme.font,
        corners: theme.corners,
        fonts: theme.fonts,
        colors: theme.colors,
        layout: theme.layout,
      }),
      searchSynonyms: JSON.stringify([
        { from: 'حبوب', to: 'بثور' },
        { from: 'تساقط', to: 'تساقط الشعر' },
      ]),
    },
  });

  console.log(`store      : ${store.slug} — ${store.name}`);
  console.log(`template   : ${template.id} (${template.name})`);
  console.log(`categories : ${CATEGORIES.length}`);
  console.log(`products   : ${made} created, ${skipped} already there`);
  console.log(`open at    : /s/${store.slug}`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
