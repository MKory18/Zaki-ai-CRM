/**
 * Put every customer with the store that serves them.
 *
 *   npx tsx scripts/place-customers-in-stores.ts "<fallback store>" --dry
 *
 * Read from their ORDERS, which already carry a store. A customer who has
 * bought from two stores is reported, not voted on — that is one person the
 * two shops must each hold their own record of, and splitting a history is
 * not something to do behind anyone's back.
 *
 * A customer with no order at all has nothing to read, so they go to the
 * fallback store NAMED ON THE COMMAND LINE.
 */
import { db } from '../src/lib/db';

async function main() {
  const fallbackName = process.argv[2];
  const dry = process.argv.includes('--dry');
  if (!fallbackName || fallbackName.startsWith('--')) {
    console.error('الاستعمال: npx tsx scripts/place-customers-in-stores.ts "<اسم المتجر الافتراضي>" [--dry]');
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

  const seen = new Map<string, Map<string, number>>();
  for (const o of await db.order.findMany({ select: { customerId: true, storeId: true } })) {
    if (!o.customerId || !o.storeId) continue;
    if (!seen.has(o.customerId)) seen.set(o.customerId, new Map());
    const m = seen.get(o.customerId)!;
    m.set(o.storeId, (m.get(o.storeId) ?? 0) + 1);
  }

  const customers = await db.customer.findMany({
    select: { id: true, fullName: true, storeId: true },
  });

  const plan = new Map<string, string>();
  const split: string[] = [];
  let fromOrders = 0;
  let toFallback = 0;

  for (const c of customers) {
    if (c.storeId) continue;
    const mine = seen.get(c.id);
    if (!mine || mine.size === 0) {
      plan.set(c.id, fallback.id);
      toFallback++;
      continue;
    }
    if (mine.size > 1) {
      split.push(`${c.fullName}: ` + [...mine].map(([s, n]) => `${stores.get(s) ?? s} ${n}`).join(' · '));
      continue;
    }
    plan.set(c.id, [...mine][0][0]);
    fromOrders++;
  }

  const byStore = new Map<string, number>();
  for (const s of plan.values()) byStore.set(s, (byStore.get(s) ?? 0) + 1);

  console.log(`${customers.length} عميل · ${customers.filter((c) => c.storeId).length} مُسنَد مسبقاً\n`);
  console.log(`  من طلباتهم: ${fromOrders}`);
  console.log(`  إلى «${fallback.name}» (بلا طلبات): ${toFallback}\n`);
  for (const [s, n] of byStore) console.log(`  ${stores.get(s)} → ${n} عميل`);
  if (split.length) {
    console.log('\n  ⚠️  اشترى من أكثر من متجر — لم يُسنَد، قرارك:');
    split.forEach((x) => console.log('     ' + x));
  }

  if (dry) {
    console.log('\n(تجربة — لم يُكتب شيء)');
  } else {
    await db.$transaction(
      [...plan].map(([id, storeId]) => db.customer.update({ where: { id }, data: { storeId } }))
    );
    console.log(`\nأُسنِد ${plan.size} عميل.`);
  }
  await db.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await db.$disconnect();
  process.exit(1);
});
