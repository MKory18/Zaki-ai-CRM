/**
 * npx tsx scripts/apply-sehha-pages.ts                 ← تجربة، لا تكتب شيئاً
 * npx tsx scripts/apply-sehha-pages.ts --apply         ← إنشاء الصفحات كمسودات غير منشورة
 * npx tsx scripts/apply-sehha-pages.ts --apply --only=cap,vara
 *
 * يُشغَّل بعد apply-sehha (الأسعار والعروض والصور). من جذر التطبيق، وبـ DATABASE_URL المعتاد.
 */
import { db } from '../src/lib/db';
import { standDownRedirectsTo } from '../src/lib/store-redirects';
import { applyPages } from './sehha/pages';

async function main() {
  const args = process.argv.slice(2);
  const only = args.find((a) => a.startsWith('--only='))?.slice('--only='.length).split(',').filter(Boolean);
  const report = await applyPages(
    { db, standDownRedirectsTo, log: (l) => console.log(l) },
    { apply: args.includes('--apply'), only }
  );
  const warned = report.pages.some((p) => p.warnings.length > 0);
  await db.$disconnect();
  if (warned) process.exitCode = 2;
}

main().catch(async (e) => {
  console.error('❌', e instanceof Error ? e.message : e);
  await db.$disconnect().catch(() => undefined);
  process.exit(1);
});
