/**
 * A PHOTOGRAPH FOR EVERY DEMO PRODUCT — so the shop can be MEASURED.
 *
 * Not decoration. Every performance number this system is held to is a
 * number about pictures: the largest paint on a product page is the
 * photograph, the responsive `srcset` has nothing to prove without one,
 * and a shelf of letter placeholders loads in no time and tells you
 * nothing about the shelf a seller will actually have.
 *
 * It writes what a real upload writes — a WebP at 1200px, through the same
 * sharp settings as `storage.ts` — so the bytes measured here are the bytes
 * a seller's own upload would produce.
 *
 * ADDITIVE, IDEMPOTENT, AND FOR A DEVELOPMENT DATABASE. A product that
 * already has an image is left alone, and it refuses to run against a
 * DATABASE_URL that is not local, because a generated placeholder in a real
 * shop is a product a real customer orders by its picture.
 *
 *   npx tsx scripts/demo-photos.ts [store-slug]
 */
import { PrismaClient } from '@prisma/client';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { LOCAL_STORAGE_DIR } from '../src/lib/storage';

const db = new PrismaClient();

/** One flat colour per category, so a shelf reads as a shelf. */
const TINT: Record<string, { r: number; g: number; b: number }> = {
  'العناية بالبشرة': { r: 232, g: 221, b: 212 },
  'العناية بالشعر': { r: 214, g: 226, b: 228 },
  'مكمّلات': { r: 224, g: 229, b: 214 },
};
const DEFAULT_TINT = { r: 226, g: 226, b: 230 };

async function main() {
  if (!/@(localhost|127\.0\.0\.1)[:/]/.test(process.env.DATABASE_URL ?? '')) {
    throw new Error('هذه البذرة للتطوير فقط — DATABASE_URL ليست محليّة.');
  }
  const slug = process.argv[2] ?? 'main';
  const store = await db.store.findFirst({ where: { slug } });
  if (!store) throw new Error(`لا متجر بالاسم «${slug}»`);

  const sharp = await import('sharp').then((m) => m.default ?? m);
  const products = await db.product.findMany({
    where: { storeId: store.id },
    select: { id: true, name: true, companyId: true, category: { select: { name: true } } },
  });

  let made = 0;
  let skipped = 0;
  for (const p of products) {
    const already = await db.productImage.count({ where: { productId: p.id } });
    if (already > 0) {
      skipped++;
      continue;
    }

    const tint = TINT[p.category?.name ?? ''] ?? DEFAULT_TINT;
    // A soft radial so the picture is not one flat rectangle a compressor
    // reduces to nothing — the byte counts have to mean something.
    const svg = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200">` +
        `<defs><radialGradient id="g" cx="38%" cy="30%" r="78%">` +
        `<stop offset="0%" stop-color="rgb(255,255,255)"/>` +
        `<stop offset="55%" stop-color="rgb(${tint.r},${tint.g},${tint.b})"/>` +
        `<stop offset="100%" stop-color="rgb(${Math.max(0, tint.r - 38)},${Math.max(0, tint.g - 38)},${Math.max(0, tint.b - 38)})"/>` +
        `</radialGradient></defs>` +
        `<rect width="1200" height="1200" fill="url(#g)"/>` +
        `<circle cx="600" cy="520" r="250" fill="rgba(255,255,255,0.45)"/>` +
        `<rect x="470" y="760" width="260" height="300" rx="40" fill="rgba(255,255,255,0.6)"/>` +
        `</svg>`,
      'utf8'
    );

    // The same settings as the upload pipeline in storage.ts.
    const out = await sharp(svg)
      .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();

    const id = crypto.randomUUID();
    const fileName = `${id}.webp`;
    const storageKey = `companies/${p.companyId}/products/${p.id}/${fileName}`;
    const abs = path.join(LOCAL_STORAGE_DIR, storageKey);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, out);

    await db.productImage.create({
      data: {
        companyId: p.companyId,
        productId: p.id,
        url: `/api/media/${storageKey}`,
        storageKey,
        fileName,
        mimeType: 'image/webp',
        fileSize: out.length,
        altText: p.name,
        isPrimary: true,
        sortOrder: 0,
      },
    });
    made++;
  }

  console.log(`store    : ${store.slug}`);
  console.log(`photos   : ${made} written, ${skipped} already had one`);
  console.log(`stored at: ${path.join(LOCAL_STORAGE_DIR, 'companies')}`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
