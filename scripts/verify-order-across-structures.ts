/**
 * «طلب COD حقيقي عبر كل بنية، يثبت إن الطلب والـ COD والأحداث متطابقة مهما
 * كانت البنية والمظهر.»
 *
 * The same order, placed ten times through ten different persuasion
 * structures, and then compared field by field. Anything that differs came
 * from the structure — which is the thing being tested.
 *
 * IT CALLS `createPublicOrder`, NOT THE HTTP ROUTE. The route adds an IP rate
 * limit (ten in ten minutes), an origin check and a body-size cap: real
 * protections against abuse, and none of them part of what an order IS.
 * Driving ten orders through the limiter would measure the limiter. What is
 * exercised here is everything that decides the order — validation against
 * the store's own country and regions, offer resolution, the COD figure, the
 * stock movement, the notification and the app events — which is the same
 * function the route calls with the same surface the route builds.
 *
 * THE ORDERS ARE REAL AND THEY STAY. This system never deletes an order (a
 * mistake is VOIDed with reversing entries), so the ten it writes are ten
 * rows a person will see in the orders screen, named «فحص المصفوفة». That is
 * deliberate: an order that could be deleted afterwards would not have been
 * a real order.
 *
 * IT IS FOR A DEVELOPMENT DATABASE.
 *
 *   npx tsx scripts/verify-order-across-structures.ts [store-slug]
 */
import { PrismaClient } from '@prisma/client';
import { createPublicOrder, type SellingSurface } from '../src/lib/public-order';
import { LANDING_PAGE_SOURCE } from '../src/lib/landing-pages';
import { LANDING_STRUCTURES } from '../src/lib/landing-structures';

const db = new PrismaClient();

/** What a customer types. Identical for all ten — that is the point. */
const CUSTOMER = {
  full_name: 'فحص المصفوفة',
  phone: '0790000001',
  address: 'شارع الفحص، بناية 5، طابق 2',
  notes: 'طلب فحص — المرحلة الخامسة',
  website: '',
};

async function main() {
  const url = process.env.DATABASE_URL ?? '';
  if (!/@(localhost|127\.0\.0\.1)[:/]/.test(url)) {
    throw new Error('هذا الفحص للتطوير فقط — DATABASE_URL ليست محليّة.');
  }

  const storeSlug = process.argv.find((a) => !a.includes('/') && !a.includes('\\') && !a.startsWith('-')) ?? 'main';
  const store = await db.store.findFirst({
    where: { slug: storeSlug },
    select: {
      id: true,
      companyId: true,
      countryId: true,
      country: { select: { code: true, currencyCode: true, orderPrefix: true, minorUnit: true } },
    },
  });
  if (!store) throw new Error(`لا متجر بالاسم «${storeSlug}»`);

  const region = await db.region.findFirst({
    where: { countryId: store.countryId, isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    select: { name: true },
  });
  if (!region) throw new Error('لا مناطق مفعَّلة في بلد هذا المتجر');

  const placed: { structure: string; orderNumber: string | null; error?: string }[] = [];

  /**
   * THE SAME OFFER EVERY TIME, AND IT IS NOT OPTIONAL.
   *
   * A product with offers refuses an order that names none — «يرجى اختيار أحد
   * العروض» — which is right: the offer IS the price, and a page showing
   * three tiers must be told which one was tapped. The first tier is the one
   * every page shows first, and all ten orders choose it, so the COD figure
   * below is comparable across the ten.
   */
  let offerId = '';

  for (const structure of LANDING_STRUCTURES) {
    const slug = `mx-${structure.id}-lab`;
    const lp = await db.landingPage.findFirst({
      where: { slug, isPublished: true },
      include: {
        company: { select: { id: true } },
        product: { select: { id: true, basePrice: true, name: true, image: true } },
        store: {
          select: {
            id: true,
            countryId: true,
            country: { select: { code: true, currencyCode: true, orderPrefix: true, minorUnit: true } },
          },
        },
      },
    });
    if (!lp?.store || !lp.product) {
      placed.push({ structure: structure.id, orderNumber: null, error: 'صفحة المصفوفة غير موجودة — شغّل scripts/structure-matrix.ts' });
      continue;
    }

    // The same surface the public route builds — see
    // src/app/api/public/landing-pages/[slug]/orders/route.ts.
    const surface: SellingSurface = {
      deviceClass: 'mobile',
      companyId: lp.company.id,
      store: lp.store,
      campaignId: null,
      products: [lp.product],
      landingPage: { id: lp.id, name: lp.name, slug: lp.slug },
      source: LANDING_PAGE_SOURCE,
      dedupeScope: `lp:${lp.id}`,
      notice: {
        title: 'طلب جديد من صفحة هبوط',
        message: (n) => `طلب جديد #${n} من صفحة الهبوط "${lp.name}" (${lp.slug}).`,
      },
    };

    if (!offerId) {
      const offer = await db.offer.findFirst({
        where: { productId: lp.product.id, status: 'ACTIVE' },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        select: { id: true, name: true, sellingPrice: true },
      });
      if (!offer) throw new Error('لا عرض نشِط على منتج المصفوفة');
      offerId = offer.id;
      console.log(`العرض المختار في الطلبات العشرة: «${offer.name}» — ${offer.sellingPrice}`);
    }

    const result = await createPublicOrder(surface, { ...CUSTOMER, city: region.name, offerId });
    placed.push(
      result.ok
        ? { structure: structure.id, orderNumber: (result.body as { orderNumber?: string }).orderNumber ?? null }
        : { structure: structure.id, orderNumber: null, error: JSON.stringify(result.body).slice(0, 160) }
    );
  }

  const numbers = placed.map((p) => p.orderNumber).filter(Boolean) as string[];
  console.log(`\nوُضع ${numbers.length} من ${LANDING_STRUCTURES.length} طلباً`);
  for (const p of placed) console.log(`  ${p.structure.padEnd(20)} ${p.orderNumber ?? 'FAILED: ' + p.error}`);
  if (numbers.length === 0) return;

  const orders = await db.order.findMany({
    where: { orderNumber: { in: numbers } },
    select: {
      orderNumber: true,
      // The money a courier collects at the door: the line's price plus what
      // shipping adds, in the country's own currency.
      sellingPrice: true,
      shippingCost: true,
      discountAmount: true,
      totalAmount: true,
      currency: true,
      status: true,
      confirmationStatus: true,
      settlementStatus: true,
      source: true,
      quantity: true,
      offerId: true,
      landingPageId: true,
      productId: true,
      customerId: true,
    },
  });

  /** Everything that must be identical — the landing page is what may differ. */
  const SAME = [
    'sellingPrice', 'shippingCost', 'discountAmount', 'totalAmount', 'currency',
    'status', 'confirmationStatus', 'settlementStatus', 'source', 'quantity',
    'offerId', 'productId', 'customerId',
  ] as const;

  const differ: string[] = [];
  for (const field of SAME) {
    const values = [...new Set(orders.map((o) => JSON.stringify((o as Record<string, unknown>)[field])))];
    if (values.length > 1) differ.push(`${field}: ${values.join(' | ')}`);
  }
  const pages = new Set(orders.map((o) => o.landingPageId));

  console.log('\nالمتطابق في كل الطلبات:');
  for (const field of SAME) {
    console.log(`  ${field.padEnd(20)} ${JSON.stringify((orders[0] as Record<string, unknown>)[field])}`);
  }
  console.log(`\nصفحات مختلفة: ${pages.size} (المتوقّع ${orders.length})`);
  console.log(differ.length ? `\nاختلف رغم أنّه لا يجب:\n  ${differ.join('\n  ')}` : '\nلا شيء اختلف. ✓');
  process.exitCode = differ.length || pages.size !== orders.length ? 1 : 0;
}

main()
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
