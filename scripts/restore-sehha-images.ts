/**
 * npx tsx scripts/restore-sehha-images.ts            ← تجربة، لا تكتب شيئاً
 * npx tsx scripts/restore-sehha-images.ts --apply    ← يرجّع الملفات الناقصة بمفاتيحها المسجّلة
 *
 * من جذر التطبيق (حيث مجلد `uploads`)، وبـ DATABASE_URL المعتاد. يُعاد تشغيله بأمان.
 */
import path from 'node:path';
import { db } from '../src/lib/db';
import { LOCAL_STORAGE_DIR } from '../src/lib/storage';
import { restoreImages } from './sehha/restore';

async function main() {
  const report = await restoreImages(
    {
      db,
      imagesDir: path.join(process.cwd(), 'scripts', 'sehha', 'images'),
      uploadsDir: LOCAL_STORAGE_DIR,
      log: (l) => console.log(l),
    },
    { apply: process.argv.includes('--apply') }
  );
  await db.$disconnect();
  if (report.warnings.length) process.exitCode = 2;
}

main().catch(async (e) => {
  console.error('❌', e instanceof Error ? e.message : e);
  await db.$disconnect().catch(() => undefined);
  process.exit(1);
});
