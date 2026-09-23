/**
 * Put every product, production batch and inventory movement in a store.
 *
 *   npx tsx scripts/place-stock-in-stores.ts <fallback store name> --dry
 *   npx tsx scripts/place-stock-in-stores.ts "صحة بلس"
 *
 * Stock was the company's, so two stores could sell out of one pile. It is
 * a store's now, and the rows that already exist have to be placed before
 * anything reads the column.
 *
 * A product's store is READ FROM ITS SALES where it has any: the orders and
 * order lines already carry one. A product that has never sold has nothing
 * to read, so it goes to the fallback store NAMED ON THE COMMAND LINE —
 * never a default, because a product in the wrong store is stock the right
 * store cannot sell, and nobody finds out until a customer is told an item
 * is finished.
 *
 * Batches and movements follow their product. They are the same goods.
 */
import { db } from '../src/lib/db';

async function main() {
  const fallbackName = process.argv[2];
  const dry = process.argv.includes('--dry');
  if (!fallbackName || fallbackName.startsWith('--')) {
    console.error('الاستعمال: npx tsx scripts/place-stock-in-stores.ts "<اسم المتجر الافتراضي>" [--dry]');
    process.exit(1);
  }

  const fallback = await db.store.findFirst({
    where: { name: { contains: fallbackName } },
    select: { id: true, name: true },
  });
  if (!fallback) {
    console.error(`لا متجر اسمه يحوي «${fallbackName}»`);
    process.exit(1);
  }

  const stores = new Map(
    (await db.store.findMany({ select: { id: true, name: true } })).map((s) => [s.id, s.name])
  );

  // Where each product has actually sold. Both paths: the order's own
  // productId, and the lines of multi-product orders.
  const traced = new Map<string, Map<string, number>>();
  const note = (productId: string | null, storeId: string | null) => {
    if (!productId || !storeId) return;
    if (!traced.has(productId)) traced.set(productId, new Map());
    const m = traced.get(productId)!;
    m.set(storeId, (m.get(storeId) ?? 0) + 1);
  };

  for (const o of await db.order.findMany({ select: { productId: true, storeId: true } })) {
    note(o.productId, o.storeId);
  }
  for (const i of await db.orderItem.findMany({
    select: { productId: true, order: { select: { storeId: true } } },
  })) {
    note(i.productId, i.order?.storeId ?? null);
  }

  const products = await db.product.findMany({
    select: { id: true, name: true, storeId: true },
    orderBy: { name: 'asc' },
  });

  const plan = new Map<string, string>();
  const split: string[] = [];
  let fromSales = 0;
  let fromFallback = 0;

  for (const p of products) {
    if (p.storeId) continue; // already placed
    const seen = traced.get(p.id);
    if (!seen || seen.size === 0) {
      plan.set(p.id, fallback.id);
      fromFallback++;
      continue;
    }
    const sorted = [...seen].sort((a, b) => b[1] - a[1]);
    if (sorted.length > 1) {
      // Genuinely sold from two stores. That is a decision, not a majority.
      split.push(`${p.name}: ` + sorted.map(([s, n]) => `${stores.get(s) ?? s} ${n}`).join(' · '));
      continue;
    }
    plan.set(p.id, sorted[0][0]);
    fromSales++;
  }

  const byStore = new Map<string, number>();
  for (const s of plan.values()) byStore.set(s, (byStore.get(s) ?? 0) + 1);

  console.log(`${products.length} منتج · ${products.filter((p) => p.storeId).length} مُسنَد مسبقاً\n`);
  console.log(`  من المبيعات الفعلية: ${fromSales}`);
  console.log(`  إلى «${fallback.name}» (بلا مبيعات): ${fromFallback}\n`);
  for (const [s, n] of byStore) console.log(`  ${stores.get(s)} → ${n} منتج`);
  if (split.length) {
    console.log('\n  ⚠️  بيع من أكثر من متجر — لم يُسنَد، قرارك:');
    split.forEach((x) => console.log('     ' + x));
  }

  if (dry) {
    const batches = await db.productionBatch.count({ where: { storeId: null } });
    const movements = await db.inventoryMovement.count({ where: { storeId: null } });
    console.log(`\n  وسيتبع المنتجات: ${batches} تشغيلة · ${movements} حركة مخزون`);
    console.log('\n(تجربة — لم يُكتب شيء)');
    await db.$disconnect();
    return;
  }

  // One transaction: a half-placed catalogue is a catalogue where some
  // stock is visible to one store and the rest to none.
  const result = await db.$transaction(async (tx) => {
    let products = 0;
    for (const [productId, storeId] of plan) {
      await tx.product.update({ where: { id: productId }, data: { storeId } });
      products++;
    }
    // Batches and movements are the same goods as their product.
    const batches = await tx.$executeRawUnsafe(
      `UPDATE production_batches b SET store_id = p.store_id
       FROM products p WHERE p.id = b."productId" AND b.store_id IS NULL AND p.store_id IS NOT NULL`
    );
    const movements = await tx.$executeRawUnsafe(
      `UPDATE inventory_movements m SET store_id = p.store_id
       FROM products p WHERE p.id = m."productId" AND m.store_id IS NULL AND p.store_id IS NOT NULL`
    );
    return { products, batches, movements };
  });

  console.log(
    `\nأُسنِد ${result.products} منتج · ${result.batches} تشغيلة · ${result.movements} حركة مخزون.`
  );

  const left = await db.product.count({ where: { storeId: null } });
  if (left) console.log(`  بقي ${left} منتج بلا متجر (المختلف عليها أعلاه).`);

  await db.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await db.$disconnect();
  process.exit(1);
});
