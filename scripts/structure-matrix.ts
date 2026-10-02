/**
 * «لقطات مقارنة: عشر بنى × ثلاث مظاهر على الأقل × ثلاث عروض.»
 *
 * The matrix of pages that comparison needs, as real published landing pages
 * on a development database — because every claim stage 5 makes is about a
 * page a browser renders, and a claim about a page nobody rendered is a
 * claim about a data structure.
 *
 * IT IS IDEMPOTENT, BY SLUG. Running it twice is running it once; a page it
 * made earlier is updated in place, so the links stay stable across runs and
 * a screenshot taken yesterday names the same page today.
 *
 * AND IT TOUCHES NOTHING ELSE. The pages it writes are its own — slug
 * `mx-<structure>-<skin>` — and it never edits a page a person made. It
 * creates no product and no offer: it points every page at a product the
 * shop already sells, because a page selling an invented product would
 * measure a hero with an invented price in it.
 *
 * IT IS FOR A DEVELOPMENT DATABASE. These pages are PUBLISHED, which on a
 * real shop means a stranger can order from them.
 *
 *   npx tsx scripts/structure-matrix.ts [store-slug] [--clean]
 */
import { PrismaClient } from '@prisma/client';
import { LANDING_STRUCTURES } from '../src/lib/landing-structures';
import { structureToSections } from '../src/lib/landing-structure';
import { newSection } from '../src/lib/landing-sections';
import { STORE_TEMPLATES } from '../src/lib/store-templates';
import { skinToLandingTheme } from '../src/lib/store-skin';

const db = new PrismaClient();

/** «ثلاث مظاهر على الأقل» — the three furthest apart in mood and type. */
export const MATRIX_SKINS = ['lab', 'heritage', 'tender'];

const PREFIX = 'mx-';

/**
 * The copy every page in the matrix carries.
 *
 * Real sentences, not «نص تجريبي»: a hero measured with a placeholder in it
 * measures a line that will not be there, and Arabic placeholder text is
 * usually shorter than Arabic prose — which is the direction that hides a
 * layout problem rather than showing one.
 */
const SAY: Record<string, string> = {
  heroTitle: 'تعبان من وجع ضهرك كل صبح؟',
  heroSub: 'مش لازم تعيش معه. في طريقة أبسط ممّا جرّبت.',
  whyItHurts: 'بتقوم تعبان، بتقعد بالشغل مش مركّز، وبآخر النهار ما بقي فيك تلعب مع ولادك.',
  whatFailed: 'جرّبت المسكّنات، بتريّح ساعتين وبترجع. وجرّبت الكمّادات، بتريّح وإنت قاعد بس.',
  theSolution: 'حزام بيسند أسفل الضهر وإنت واقف وقاعد، فالعضلة بترتاح وهي شغّالة.',
  howItWorks: 'بتلبسه فوق الأواعي، بتظبط الشدّ مرة وحدة، وبتنساه.',
};

/**
 * THE CONTENT THE SLOTS STILL CANNOT REACH — AND IT IS NOW TWO BLOCKS, NOT
 * SEVEN.
 *
 * This used to fill the comparison's rows, the timeline's points, the quiz's
 * questions, the objections and the mechanism's steps, because a slot could
 * address one named field and none of those is one. A slot's address now
 * carries a row and a column (`points.0.when`), so the STRUCTURES fill them —
 * each cell with its own purpose, its own «ممنوع» and its own example — and
 * repeating that here would be a second copy of the page's words, drifting.
 *
 * What is left is `reviews` and `faq`. Neither has a slot in any structure
 * and neither should: a review is a customer's sentence and belongs to the
 * proof engine, and the questions a shop is actually asked are the shop's.
 * The matrix writes some so a comparison screenshot is not a page with two
 * gaps in it.
 */
function fillComparisonOnlyBlocks(sections: ReturnType<typeof structureToSections>) {
  for (const s of sections as unknown as Record<string, unknown>[]) {
    if (s.type === 'reviews') {
      s.items = [
        { name: 'أم محمد', text: 'بأسبوع راحت القشور. ما توقّعت.', stars: 5 },
        { name: 'سارة', text: 'خفيف وما بيلمّع. بستعمله تحت المكياج.', stars: 5 },
      ];
    }
    if (s.type === 'faq') {
      s.items = [
        { q: 'كم يكفي العلبة؟', a: 'شهران بالاستعمال اليومي مرّتين.' },
        { q: 'بينفع للبشرة الدهنية؟', a: 'نعم — خفيف وما بيسدّ المسام.' },
      ];
    }
  }
  return sections;
}

async function main() {
  const url = process.env.DATABASE_URL ?? '';
  if (!/@(localhost|127\.0\.0\.1)[:/]/.test(url)) {
    throw new Error('هذه المصفوفة للتطوير فقط — DATABASE_URL ليست محليّة.');
  }

  const slug = process.argv.find((a) => !a.startsWith('--') && !a.endsWith('.ts') && !a.includes('node')) ?? 'main';
  const store = await db.store.findFirst({ where: { slug }, select: { id: true, companyId: true, name: true } });
  if (!store) throw new Error(`لا متجر بالاسم «${slug}»`);

  if (process.argv.includes('--clean')) {
    const { count } = await db.landingPage.deleteMany({
      where: { companyId: store.companyId, slug: { startsWith: PREFIX } },
    });
    console.log(`حُذفت ${count} صفحة من المصفوفة.`);
    return;
  }

  const product = await db.product.findFirst({
    where: { storeId: store.id, status: 'ACTIVE' },
    select: { id: true, name: true, basePrice: true },
    orderBy: { createdAt: 'asc' },
  });
  if (!product) throw new Error('لا منتج نشِط في هذا المتجر');

  const skins = STORE_TEMPLATES.filter((t) => MATRIX_SKINS.includes(t.id));
  if (skins.length !== MATRIX_SKINS.length) throw new Error('مظهر من الثلاثة غير موجود');

  /*
   * EVERY SLOT FILLED FROM THE STRUCTURE'S OWN EXAMPLE, with `SAY` overriding
   * the handful that should read as one product across all ten pages.
   *
   * The examples are written per cell and per structure — «الأسبوع الأول»
   * has a different one from «الأسبوع الثامن» — so a comparison screenshot
   * drawn from them shows what a seller who followed the guide would get,
   * which is the only version worth comparing.
   */
  const copy: Record<string, Record<string, string>> = {};
  for (const structure of LANDING_STRUCTURES) {
    for (const slot of structure.slots) {
      copy[slot.key] = { levantine: SAY[slot.key] ?? slot.example };
    }
  }
  const made: string[] = [];

  for (const structure of LANDING_STRUCTURES) {
    for (const skin of skins) {
      const pageSlug = `${PREFIX}${structure.id}-${skin.id}`.slice(0, 60);
      const data = {
        companyId: store.companyId,
        storeId: store.id,
        productId: product.id,
        name: `${structure.name} × ${skin.name}`,
        builderMode: 'BLOCKS',
        theme: JSON.stringify(skinToLandingTheme(skin)),
        sections: JSON.stringify(
          fillComparisonOnlyBlocks(structureToSections(structure, copy, 'levantine', newSection))
        ),
        isPublished: true,
        // Never in the shop's window: the matrix is reached by its links.
        showInStore: false,
      };
      const existing = await db.landingPage.findFirst({ where: { slug: pageSlug }, select: { id: true } });
      if (existing) {
        await db.landingPage.update({ where: { id: existing.id }, data });
      } else {
        await db.landingPage.create({ data: { ...data, slug: pageSlug } });
      }
      made.push(`/lp/${pageSlug}`);
    }
  }

  console.log(`${made.length} صفحة: ${LANDING_STRUCTURES.length} بنية × ${skins.length} مظاهر`);
  console.log(`المنتج: ${product.name} — ${product.basePrice}`);
  for (const m of made) console.log('  ' + m);
}

main()
  .catch((e) => {
    console.error(e.message);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
