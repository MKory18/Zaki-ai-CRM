/**
 * npx tsx scripts/apply-wallets.ts            ← تجربة، لا تكتب شيئاً
 * npx tsx scripts/apply-wallets.ts --apply    ← تطبيق
 *
 * يضيف محافظ «صحة بلس» الخمس (scripts/wallets/catalog.ts). يُعاد تشغيله بأمان.
 */
import { db } from '../src/lib/db';
import { applyWallets } from './wallets/apply';

async function main() {
  const report = await applyWallets({ db, log: (l) => console.log(l) }, { apply: process.argv.includes('--apply') });
  await db.$disconnect();
  if (report.warnings.length) process.exitCode = 2;
}

main().catch(async (e) => {
  console.error('❌', e instanceof Error ? e.message : e);
  await db.$disconnect().catch(() => undefined);
  process.exit(1);
});
