/**
 * npx tsx scripts/apply-sehha-categories.ts            ← تجربة، لا تكتب شيئاً
 * npx tsx scripts/apply-sehha-categories.ts --apply    ← ينشئ الناقص من التصنيفات ويصنّف ما بلا تصنيف
 *
 * من جذر التطبيق، وبـ DATABASE_URL المعتاد. يُعاد تشغيله بأمان.
 */
import { db } from '../src/lib/db';
import { applyCategories } from './sehha/categories';

async function main() {
  await applyCategories({ db, log: (l) => console.log(l) }, { apply: process.argv.includes('--apply') });
  await db.$disconnect();
}

main().catch(async (e) => {
  console.error('❌', e instanceof Error ? e.message : e);
  await db.$disconnect().catch(() => undefined);
  process.exit(1);
});
