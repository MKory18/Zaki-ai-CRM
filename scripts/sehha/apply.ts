import fs from 'node:fs';
import path from 'node:path';
import type { PrismaClient } from '@prisma/client';
import { CATALOG, STORE_NAME, STORE_NAMES, type Item } from './catalog';

/**
 * يطبّق `catalog.ts` على قاعدة البيانات: أسعار وعروض المنتجات السبعة وصورها. (صفحات الهبوط خطوة لاحقة منفصلة.)
 *
 * ── ما يضمنه ──
 *   • يُجرَّب أولاً بلا كتابة (الافتراضي)، ولا يكتب إلا مع `--apply`.
 *   • يُعاد تشغيله بأمان: ما انطبق لا يتكرر (الصور لا تُرفع مرتين، والصفحة لا تُنشأ مرتين، والعرض لا يتضاعف).
 *   • لا يحذف شيئاً أبداً. العرض القديم الذي لا مقابل له بالصورة يصير INACTIVE، وبقاؤه بالسجل.
 *   • لا يمسّ إنشاء الطلب ولا حساب المال: الأسعار تُكتب كما هي بالصور، والسيرفر هو الذي يحسب الطلب منها.
 *   • يعمل على متجر واحد بالاسم، وإن لم يجده أو وجد أكثر من واحد يتوقف.
 */

export interface Deps {
  db: PrismaClient;
  /** `saveProductImage` from src/lib/storage — injected so a test needs no disk. */
  saveImage: (o: {
    companyId: string;
    productId: string;
    buffer: Buffer;
    mimeType: string;
    originalName: string;
    optimize?: boolean;
  }) => Promise<{ url: string; storageKey: string; fileName: string; mimeType: string; fileSize: number }>;
  /** Directory holding `<key>/N.webp` and `<key>/cover.webp`. */
  imagesDir: string;
  log: (line: string) => void;
}

export interface Options {
  apply: boolean;
  /** Keys to touch; empty = all. */
  only?: string[];
}

export interface Report {
  store: string;
  items: { key: string; actions: string[]; warnings: string[] }[];
}

const COVER_ALT = (key: string) => `sehha:${key}:cover`;
const POSTER_ALT = (key: string, n: number) => `sehha:${key}:${n}`;

export async function applyCatalog(deps: Deps, opts: Options): Promise<Report> {
  const { db, log } = deps;
  const stores = await db.store.findMany({ where: { name: { in: STORE_NAMES } }, select: { id: true, companyId: true, name: true } });
  if (stores.length !== 1) {
    throw new Error(`متجر «${STORE_NAMES.join('» أو «')}»: وُجد ${stores.length} (المطلوب واحد بالضبط) — توقّفت بلا كتابة.`);
  }
  const { id: storeId, companyId } = stores[0];
  const report: Report = { store: stores[0].name, items: [] };
  const items = CATALOG.filter((i) => !opts.only?.length || opts.only.includes(i.key));
  if (opts.only?.length && items.length !== opts.only.length) {
    throw new Error(`مفتاح غير معروف: ${opts.only.filter((k) => !CATALOG.some((i) => i.key === k)).join('، ')}`);
  }

  for (const item of items) {
    const actions: string[] = [];
    const warnings: string[] = [];
    const doit = async (what: string, fn: () => Promise<unknown>) => {
      actions.push(what);
      if (opts.apply) await fn();
    };

    // ── 1. the product ──
    let product = await db.product.findFirst({ where: { companyId, storeId, sku: item.sku } });
    if (!product) {
      if (!item.create) {
        warnings.push(`المنتج ${item.sku} غير موجود بالمتجر وما له بيانات إنشاء — تُخطّي.`);
        report.items.push({ key: item.key, actions, warnings });
        continue;
      }
      await doit(`إنشاء المنتج «${item.create.name}» (${item.sku}) بسعر ${item.basePrice}`, async () => {
        product = await db.product.create({
          data: {
            companyId,
            storeId,
            name: item.create!.name,
            nameEn: item.create!.nameEn ?? null,
            sku: item.sku,
            sourceType: item.create!.sourceType,
            status: 'ACTIVE',
            basePrice: item.basePrice,
          },
        });
      });
    } else if (product.basePrice !== item.basePrice) {
      const id = product.id;
      await doit(`سعر «${product.name}»: ${product.basePrice} ← ${item.basePrice}`, () =>
        db.product.update({ where: { id }, data: { basePrice: item.basePrice } })
      );
    }
    // A dry run of a product that does not exist yet has no id to read offers/images from.
    const productId = product?.id;

    // ── 2. its offers — matched by (quantity, free), never duplicated, never deleted ──
    const existing = productId ? await db.offer.findMany({ where: { productId } }) : [];
    const kept = new Set<string>();
    for (const [index, tier] of item.tiers.entries()) {
      const match = existing.find((o) => o.quantity === tier.quantity && o.freeQuantity === tier.freeQuantity);
      const data = {
        name: tier.name,
        sellingPrice: tier.price,
        compareAtPrice: tier.compareAt ?? null,
        deliveryIncluded: true,
        sortOrder: index,
        status: 'ACTIVE',
      };
      if (match) {
        kept.add(match.id);
        const same =
          match.name === data.name && match.sellingPrice === data.sellingPrice && (match.compareAtPrice ?? null) === data.compareAtPrice &&
          match.deliveryIncluded && match.sortOrder === index && match.status === 'ACTIVE';
        if (!same) {
          await doit(`عرض «${tier.name}»: ${match.sellingPrice} ← ${tier.price}${tier.compareAt ? ` (بدل ${tier.compareAt})` : ''}`, () =>
            db.offer.update({ where: { id: match.id }, data })
          );
        }
      } else {
        await doit(`عرض جديد «${tier.name}» = ${tier.price}`, () =>
          db.offer.create({
            data: { ...data, companyId, productId: productId!, quantity: tier.quantity, freeQuantity: tier.freeQuantity },
          })
        );
      }
    }
    for (const stale of existing.filter((o) => !kept.has(o.id) && o.status === 'ACTIVE')) {
      await doit(`إيقاف العرض «${stale.name}» (${stale.sellingPrice}) — ما له مقابل بالصور (لا حذف)`, () =>
        db.offer.update({ where: { id: stale.id }, data: { status: 'INACTIVE' } })
      );
    }

    // ── 3. the product's pictures — the cover first (primary), then the posters; once ──
    const dir = path.join(deps.imagesDir, item.key);
    const haveImages = productId ? await db.productImage.count({ where: { productId, altText: { startsWith: `sehha:${item.key}:` } } }) : 0;
    if (haveImages > 0) {
      actions.push(`صور المنتج: موجودة (${haveImages}) — بلا تكرار`);
    } else {
      await doit(`رفع صور المنتج: الغلاف + ${item.posters.length} بوستر`, async () => {
        const files = [{ file: 'cover.webp', alt: COVER_ALT(item.key), primary: true }].concat(
          item.posters.map((n) => ({ file: `${n}.webp`, alt: POSTER_ALT(item.key, n), primary: false }))
        );
        // Whatever picture the product already has stays; ours become primary only if it has none.
        const hadPrimary = (await db.productImage.count({ where: { productId: productId!, isPrimary: true } })) > 0;
        let order = await db.productImage.count({ where: { productId: productId! } });
        for (const f of files) {
          const buffer = fs.readFileSync(path.join(dir, f.file));
          const saved = await deps.saveImage({
            companyId, productId: productId!, buffer, mimeType: 'image/webp', originalName: f.file, optimize: false,
          });
          const primary = f.primary && !hadPrimary;
          await db.productImage.create({
            data: {
              companyId, productId: productId!, url: saved.url, storageKey: saved.storageKey, fileName: saved.fileName,
              mimeType: saved.mimeType, fileSize: saved.fileSize, altText: f.alt, isPrimary: primary, sortOrder: order++,
            },
          });
          if (primary) await db.product.update({ where: { id: productId! }, data: { image: saved.url } });
        }
      });
    }

    report.items.push({ key: item.key, actions, warnings });
  }

  for (const r of report.items) {
    log(`\n▸ ${r.key}`);
    for (const a of r.actions) log(`   ${opts.apply ? '✔' : '·'} ${a}`);
    for (const w of r.warnings) log(`   ⚠ ${w}`);
  }
  log(opts.apply ? '\nانتهى. الصفحات غير منشورة — راجعها وانشرها من «صفحات الهبوط».' : '\nتجربة بلا كتابة. للتطبيق: أضف --apply');
  return report;
}
