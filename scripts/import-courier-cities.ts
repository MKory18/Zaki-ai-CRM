/**
 * Fill in a courier's own city ids from the list they sent us.
 *
 *   npx tsx scripts/import-courier-cities.ts BASHA --dry
 *   npx tsx scripts/import-courier-cities.ts BASHA
 *
 * Their list is per VILLAGE; a shipment is addressed per CITY, and our
 * orders carry a محافظة. So for each of our regions we take the courier's
 * city whose name is the region's own — "مدينة اللاذقية" out of the 38 they
 * list under اللاذقية — and the street address carries the rest, exactly as
 * it does today.
 *
 * It prints what it will change before changing anything, and it never
 * invents a match: a region their list does not cover is reported, not
 * guessed at. Guessing there would address a parcel to the wrong governorate.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { db } from '../src/lib/db';

interface Village {
  villageId: number;
  villageName: string;
  cityId: number;
  cityName: string;
  regionId: number;
  regionName: string;
}

/** Arabic written two ways is the same place: أ/إ/آ→ا, ة→ه, ى→ي, no harakat. */
function norm(s: string): string {
  return (s || '')
    .trim()
    .replace(/[ؗ-ًؚ-ْ]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/\s+/g, ' ');
}

async function main() {
  const code = (process.argv[2] || '').toUpperCase();
  const dry = process.argv.includes('--dry');
  if (!code) {
    console.error('الاستعمال: npx tsx scripts/import-courier-cities.ts <رمز الشركة> [--dry]');
    process.exit(1);
  }

  const file = join(process.cwd(), 'reference', 'couriers', `${code.toLowerCase()}-villages.json`);
  const villages: Village[] = JSON.parse(readFileSync(file, 'utf8'));

  const provider = await db.deliveryProvider.findFirst({
    where: { code },
    select: { id: true, name: true },
  });
  if (!provider) {
    console.error(`لا شركة شحن برمز ${code}`);
    process.exit(1);
  }

  // Their cities, grouped by the region name they file them under.
  const byRegion = new Map<string, Map<number, string>>();
  for (const v of villages) {
    const key = norm(v.regionName);
    if (!byRegion.has(key)) byRegion.set(key, new Map());
    byRegion.get(key)!.set(v.cityId, v.cityName);
  }

  const fees = await db.deliveryFee.findMany({
    where: { deliveryProviderId: provider.id },
    select: { id: true, courierCityId: true, region: { select: { name: true } } },
    orderBy: { region: { name: 'asc' } },
  });

  const updates: { id: string; cityId: number; region: string; city: string; was: number | null }[] = [];
  const unmatched: string[] = [];

  for (const fee of fees) {
    const cities = byRegion.get(norm(fee.region.name));
    if (!cities || cities.size === 0) {
      unmatched.push(fee.region.name);
      continue;
    }
    // The city that IS the governorate centre, else the only/first one.
    const exact = [...cities].find(([, name]) => norm(name).includes(norm(fee.region.name)));
    const [cityId, cityName] = exact ?? [...cities].sort((a, b) => a[0] - b[0])[0];
    if (fee.courierCityId === cityId) continue;
    updates.push({ id: fee.id, cityId, region: fee.region.name, city: cityName, was: fee.courierCityId });
  }

  console.log(`${provider.name} — ${villages.length} قرية، ${byRegion.size} محافظة عندهم\n`);
  for (const u of updates) {
    console.log(`  ${u.region.padEnd(12)} → ${String(u.cityId).padEnd(8)} ${u.city}${u.was ? `  (كان ${u.was})` : ''}`);
  }
  if (unmatched.length) {
    console.log(`\n  ⚠️  لا يخدمون هذه المحافظات: ${unmatched.join('، ')}`);
    console.log('     الشحنات إليها لا يمكن إنشاؤها عندهم — حوّلها لشركة أخرى أو اسألهم.');
  }

  if (dry) {
    console.log('\n(تجربة — لم يُكتب شيء)');
  } else {
    for (const u of updates) {
      await db.deliveryFee.update({ where: { id: u.id }, data: { courierCityId: u.cityId } });
    }
    console.log(`\nحُدِّث ${updates.length} صفّاً.`);
  }

  await db.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await db.$disconnect();
  process.exit(1);
});
