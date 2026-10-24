/**
 * npx tsx scripts/apply-sehha.ts                 ← تجربة، لا تكتب شيئاً
 * npx tsx scripts/apply-sehha.ts --apply         ← تطبيق
 * npx tsx scripts/apply-sehha.ts --apply --only=cap,vara
 *
 * يطبّق أسعار وعروض وصور منتجات «صحة بلس» (scripts/sehha/catalog.ts).
 * لازم يشتغل من جذر التطبيق (حيث مجلد `uploads`)، وبـ DATABASE_URL المعتاد.
 */
import path from 'node:path';
import { db } from '../src/lib/db';
import { saveProductImage } from '../src/lib/storage';
import { applyCatalog } from './sehha/apply';

async function main() {
  const args = process.argv.slice(2);
  const only = args.find((a) => a.startsWith('--only='))?.slice('--only='.length).split(',').filter(Boolean);
  const report = await applyCatalog(
    {
      db,
      saveImage: (o) => saveProductImage(o),
      imagesDir: path.join(process.cwd(), 'scripts', 'sehha', 'images'),
      log: (l) => console.log(l),
    },
    { apply: args.includes('--apply'), only }
  );
  const warned = report.items.some((i) => i.warnings.length > 0);
  await db.$disconnect();
  if (warned) process.exitCode = 2;
}

main().catch(async (e) => {
  console.error('❌', e instanceof Error ? e.message : e);
  await db.$disconnect().catch(() => undefined);
  process.exit(1);
});
