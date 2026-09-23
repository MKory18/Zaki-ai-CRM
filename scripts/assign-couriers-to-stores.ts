/**
 * Give every courier the store it has actually been working for.
 *
 *   npx tsx scripts/assign-couriers-to-stores.ts --dry
 *   npx tsx scripts/assign-couriers-to-stores.ts
 *
 * Couriers used to belong to the company, so they were offered in every
 * store. Now each store is its own business with its own account, and a
 * courier that belongs to nobody would be offered to nobody — so the rows
 * that exist have to be placed before the stricter rule is switched on.
 *
 * The store is READ FROM THE RECORDS: the orders, batches and statements
 * already carry one. Nothing is guessed. A courier whose records point at
 * two different stores is reported with the split rather than assigned to
 * the bigger one behind your back, and a courier with no records at all is
 * left alone for you to place — it is the one case the data cannot answer.
 */
import { db } from '../src/lib/db';

async function main() {
  const dry = process.argv.includes('--dry');

  const stores = new Map(
    (await db.store.findMany({ select: { id: true, name: true } })).map((s) => [s.id, s.name])
  );
  const providers = await db.deliveryProvider.findMany({
    select: { id: true, name: true, code: true, storeId: true },
    orderBy: { name: 'asc' },
  });

  const planned: { id: string; name: string; storeId: string; why: string }[] = [];
  const ambiguous: string[] = [];
  const orphans: string[] = [];

  for (const p of providers) {
    if (p.storeId) continue; // already placed

    const counts = new Map<string, number>();
    const add = (rows: unknown) => {
      for (const r of rows as { storeId: string | null; _count: number }[]) {
        if (!r.storeId) continue;
        counts.set(r.storeId, (counts.get(r.storeId) ?? 0) + r._count);
      }
    };
    // The three tables that already know which store a parcel belonged to.
    const where = { deliveryProviderId: p.id };
    add(await db.order.groupBy({ by: ['storeId'], where, _count: true }));
    add(await db.shippingBatch.groupBy({ by: ['storeId'], where, _count: true }));
    add(await db.courierStatement.groupBy({ by: ['storeId'], where, _count: true }));

    if (counts.size === 0) {
      orphans.push(`${p.name} (${p.code})`);
      continue;
    }

    const sorted = [...counts].sort((a, b) => b[1] - a[1]);
    const [topStore, topCount] = sorted[0];
    const rest = sorted.slice(1);

    // A real split — both stores genuinely used this courier — is a decision,
    // not a majority vote. One stray empty batch is not a split.
    const contested = rest.filter(([, n]) => n > 1);
    if (contested.length > 0) {
      ambiguous.push(
        `${p.name}: ` + sorted.map(([s, n]) => `${stores.get(s) ?? s} ${n}`).join(' · ')
      );
      continue;
    }

    const strays = rest.map(([s, n]) => `${n} سجل في ${stores.get(s) ?? s}`);
    planned.push({
      id: p.id,
      name: p.name,
      storeId: topStore,
      why: `${topCount} سجل${strays.length ? ` (وتُترك ${strays.join('، ')} كما هي)` : ''}`,
    });
  }

  console.log(`${providers.length} شركة شحن، ${providers.filter((p) => p.storeId).length} مُسنَدة مسبقاً\n`);
  for (const p of planned) {
    console.log(`  ${p.name.padEnd(20)} → ${stores.get(p.storeId)}`);
    console.log(`  ${''.padEnd(20)}   ${p.why}`);
  }
  if (ambiguous.length) {
    console.log('\n  ⚠️  استعملها أكثر من متجر — قرارك:');
    ambiguous.forEach((a) => console.log('     ' + a));
  }
  if (orphans.length) {
    console.log('\n  ⚠️  بلا أي سجل — لا تدلّ البيانات على متجرها:');
    orphans.forEach((o) => console.log('     ' + o));
    console.log('     تُسنَد يدوياً من /settings/couriers.');
  }

  if (dry) {
    console.log('\n(تجربة — لم يُكتب شيء)');
  } else {
    for (const p of planned) {
      await db.deliveryProvider.update({ where: { id: p.id }, data: { storeId: p.storeId } });
    }
    console.log(`\nأُسنِدت ${planned.length} شركة.`);
  }

  await db.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await db.$disconnect();
  process.exit(1);
});
