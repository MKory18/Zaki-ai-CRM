import fs from 'node:fs';
import path from 'node:path';
import type { PrismaClient } from '@prisma/client';
import { CATALOG, STORE_NAMES } from './catalog';

/**
 * يرجّع ملفات صور «صحة بلس» إلى أماكنها على القرص — بنفس مفاتيح التخزين المسجّلة، فكل رابط محفوظ يرجع يشتغل.
 *
 * ── ليش ──
 * التطبيق على Coolify ما كان له تخزين دائم: الملفات المرفوعة كانت داخل الحاوية (`/app/uploads`)، فكل نشر مسحها.
 * سجلات `ProductImage` اللي كتبها `apply-sehha` بقيت، وروابطها (بصفحة المنتج وبصفحات الهبوط) صارت 404.
 *
 * ── ما يضمنه ──
 *   • يكتب الملف بمفتاح التخزين المسجّل بالسجل نفسه (`storageKey`) — لا سجل جديد، لا رابط جديد، لا تعديل بقاعدة البيانات.
 *   • لا يكتب فوق ملف موجود. ولا يكتب إلا إذا حجم الملف المحلي = `fileSize` بالسجل (البايتات نفسها التي رُفعت أول مرة).
 *   • يقرأ فقط صور المتجر الواحد بالاسم وبعلامة `sehha:<key>:<cover|n>`؛ أي صورة غيرها لا تُلمس.
 *   • تجربة بلا كتابة افتراضياً، و`--apply` للتنفيذ. مفتاح غير آمن (خارج مجلد الرفع) يُرفض.
 */

export interface RestoreDeps {
  db: PrismaClient;
  /** Where `scripts/sehha/images/<key>/<file>.webp` live. */
  imagesDir: string;
  /** The uploads root (`LOCAL_STORAGE_DIR`). */
  uploadsDir: string;
  log: (line: string) => void;
}

export interface RestoreReport {
  restored: string[];
  present: string[];
  warnings: string[];
}

/** A storage key that stays inside the uploads root — the same rule as `isSafeStorageKey`. */
function safeTarget(uploadsDir: string, key: string): string | null {
  if (!key || key.includes('\\')) return null;
  if (key.split('/').some((s) => s === '' || s === '.' || s === '..' || s.startsWith('.'))) return null;
  const root = path.resolve(uploadsDir);
  const abs = path.resolve(root, key);
  return abs.startsWith(root + path.sep) ? abs : null;
}

export async function restoreImages(deps: RestoreDeps, opts: { apply: boolean }): Promise<RestoreReport> {
  const { db, log } = deps;
  const stores = await db.store.findMany({ where: { name: { in: STORE_NAMES } }, select: { id: true, companyId: true, name: true } });
  if (stores.length !== 1) {
    throw new Error(`وجدت ${stores.length} متجر بالأسماء ${STORE_NAMES.join(' / ')} — لازم واحد بالضبط، توقفت.`);
  }
  const { id: storeId, companyId, name } = stores[0];
  log(`${opts.apply ? 'تطبيق' : 'تجربة'} على المتجر «${name}» — مجلد الرفع ${deps.uploadsDir}`);

  const report: RestoreReport = { restored: [], present: [], warnings: [] };
  for (const item of CATALOG) {
    const product = await db.product.findFirst({ where: { companyId, storeId, sku: item.sku }, select: { id: true } });
    if (!product) {
      report.warnings.push(`${item.key}: المنتج ${item.sku} غير موجود — تُخطّي`);
      continue;
    }
    const rows = await db.productImage.findMany({
      where: { companyId, productId: product.id, altText: { startsWith: `sehha:${item.key}:` } },
      select: { altText: true, storageKey: true, fileSize: true },
    });
    for (const row of rows) {
      const which = (row.altText ?? '').split(':')[2];
      const label = `${item.key}/${which}`;
      const source = path.join(deps.imagesDir, item.key, `${which}.webp`);
      const target = row.storageKey ? safeTarget(deps.uploadsDir, row.storageKey) : null;
      if (!target) {
        report.warnings.push(`${label}: مفتاح تخزين غير صالح — تُخطّي`);
        continue;
      }
      if (fs.existsSync(target)) {
        report.present.push(label);
        continue;
      }
      if (!fs.existsSync(source)) {
        report.warnings.push(`${label}: الملف المحلي ${path.basename(source)} غير موجود — تُخطّي`);
        continue;
      }
      const bytes = fs.readFileSync(source);
      if (row.fileSize != null && bytes.length !== row.fileSize) {
        report.warnings.push(`${label}: حجم الملف المحلي (${bytes.length}) ≠ المسجّل (${row.fileSize}) — ما كتبته`);
        continue;
      }
      if (opts.apply) {
        fs.mkdirSync(path.dirname(target), { recursive: true });
        // `wx`: never over a file that appeared meanwhile.
        fs.writeFileSync(target, bytes, { flag: 'wx' });
      }
      report.restored.push(label);
    }
  }

  log(`${opts.apply ? '✔ رجعت' : '· سترجع'} ${report.restored.length} · موجودة ${report.present.length}`);
  for (const r of report.restored) log(`   + ${r}`);
  for (const w of report.warnings) log(`   ⚠ ${w}`);
  if (!opts.apply) log('تجربة بلا كتابة. للتطبيق: أضف --apply');
  return report;
}
