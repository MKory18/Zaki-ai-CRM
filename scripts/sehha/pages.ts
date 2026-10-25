import type { PrismaClient } from '@prisma/client';
import { landingSectionsSchema, newSection, type LandingSection } from '../../src/lib/landing-sections';
import { buildTemplate } from '../../src/lib/page-templates';
import { CATALOG, STORE_NAMES, type Item } from './catalog';

/**
 * صفحات هبوط «صحة بلس»: صفحة مسودة لكل منتج من المنتجات السبعة (scripts/sehha/catalog.ts)، على نمط صفحات YouCan:
 * البوسترات كاملة، واحد تحت الثاني، ثم نموذج الطلب («مضغوط» + اختيار الكمية كقائمة راديو)، وزر «اطلب الآن» عائم.
 *
 * ── ما يضمنه ──
 *   • مسودة غير منشورة دائماً (`isPublished: false`) وبلا ظهور بالمتجر (`showInStore: false`): ما تنشر ولا تغيّر المتجر.
 *     يراجعها صاحب المتجر وينشرها بيده من «صفحات الهبوط».
 *   • تُجرَّب أولاً بلا كتابة (الافتراضي)، وتكتب مع `--apply` فقط. يُعاد تشغيله بأمان: صفحة بنفس الرابط عند نفس المنتج تُترك كما هي
 *     (لا تُنشأ مرتين ولا تُمسّ إن عدّلها صاحبها). رابط مأخوذ لمنتج آخر أو متجر آخر يتوقف عنده بتحذير.
 *   • لا يحذف ولا يعدّل صفحة موجودة — إلا مع `--restyle`: يضبط شكل النموذج (مضغوط + قائمة راديو) على **مسودة** من صفحاته لم يُختر
 *     فيها شكل بعد، ولا يمسّ أي شيء آخر فيها، ولا يمسّ صفحة منشورة. ولا يرفع صوراً: البوسترات هي نفسها صور المنتج التي رفعها `apply-sehha`.
 *   • لا ينسخ أي سعر ولا عرض إلى الصفحة: النموذج يقرأ عروض المنتج مباشرة، فالأسعار تبقى حيث كتبها `apply-sehha` من البوسترات.
 *   • يعمل على متجر واحد بالاسم، وإن لم يجده أو وجد أكثر من واحد يتوقف.
 *
 * البوسترات الداخلة هي `item.posters` فقط (بوسترات «آراء العملاء / نتائج حقيقية» المتروكة لا تدخل).
 */

export interface PagesDeps {
  db: PrismaClient;
  /** A page that takes the address must stand a redirect down, exactly as the create door does. */
  standDownRedirectsTo: (slug: string) => Promise<unknown>;
  log: (line: string) => void;
}

export interface PagesReport {
  store: string;
  pages: { key: string; slug: string; actions: string[]; warnings: string[] }[];
}

/**
 * The sections of one product page — and not one price in them.
 * The order form reads the product's own offers at render time.
 */
export function sectionsFor(posters: string[], title?: PageTitle): LandingSection[] {
  const stack = { ...newSection('gallery'), title: '', images: posters.slice(0, 12), layout: 'stack' };
  // Trust is left EMPTY on purpose: the renderer then draws the facts (cash on delivery) instead of words nobody measured.
  const form = { ...newSection('form'), ...YOUCAN_FORM };
  const blocks: LandingSection[] = [
    ...(title ? [titleBlock(title) as LandingSection] : []),
    stack as LandingSection,
    form as LandingSection,
    newSection('trust'),
    newSection('footer'),
    newSection('sticky'),
  ];
  return landingSectionsSchema.parse(blocks);
}

/** What sits above the posters: the product's name, and the line its posters carry about delivery and payment. */
export interface PageTitle {
  name: string;
  line: string;
}

/** The block's id: how `restyled` knows a page already has its title (and never adds a second). */
export const TITLE_ID = 'sehha-title';

/**
 * THE PRODUCT'S NAME, ABOVE THE POSTERS, IN A DISPLAY FACE.
 *
 * A `text` block: its title is the name — drawn as the block's heading, so it wears the page's colours — in «المصيري»
 * (the font list calls it «أنيق للعناوين»), a little larger than body size, bold. The body is the line the posters
 * already say (free delivery · pay on receipt), because a text block with no body draws nothing at all.
 */
function titleBlock(t: PageTitle) {
  return {
    ...newSection('text'),
    id: TITLE_ID,
    title: t.name,
    body: t.line,
    look: {
      ...newSection('text').look,
      space: 'tight',
      text: { font: 'messiri', scale: 'l', weight: 'bold', italic: false, color: '', headingColor: '' },
    },
  };
}

/** The form the way a YouCan order form reads: a plain column, and the bundles as a radio list. */
export const YOUCAN_FORM = { formStyle: 'compact', offerStyle: 'radio' } as const;

/**
 * The saved sections with the YouCan form look put on every form block that has not had a look chosen yet.
 * Returns null when there is nothing to change — so a page the owner already styled is never touched.
 */
export function restyled(sectionsJson: string | null, title?: PageTitle): string | null {
  if (!sectionsJson) return null;
  let list: unknown;
  try {
    list = JSON.parse(sectionsJson);
  } catch {
    return null;
  }
  if (!Array.isArray(list)) return null;
  let changed = false;
  // The product's name above the posters — once: a page that already has it (or had it and lost it on purpose) keeps its own.
  const hasTitle = list.some((s) => s && typeof s === 'object' && (s as { id?: string }).id === TITLE_ID);
  const head = title && !hasTitle ? [JSON.parse(JSON.stringify(titleBlock(title)))] : [];
  if (head.length) changed = true;
  const next = [...head, ...list].map((s) => {
    if (s && typeof s === 'object' && (s as { type?: string }).type === 'form' && !('formStyle' in s) && !('offerStyle' in s)) {
      changed = true;
      return { ...s, ...YOUCAN_FORM };
    }
    return s;
  });
  return changed ? JSON.stringify(next) : null;
}

export async function applyPages(deps: PagesDeps, opts: { apply: boolean; only?: string[]; restyle?: boolean }): Promise<PagesReport> {
  const { db, log } = deps;
  const stores = await db.store.findMany({ where: { name: { in: STORE_NAMES } }, select: { id: true, companyId: true, name: true } });
  if (stores.length !== 1) {
    throw new Error(`وجدت ${stores.length} متجر بالأسماء ${STORE_NAMES.join(' / ')} — لازم واحد بالضبط، توقفت.`);
  }
  const { id: storeId, companyId, name: storeName } = stores[0];
  log(`${opts.apply ? 'تطبيق' : 'تجربة'} على المتجر «${storeName}» — صفحات مسودة غير منشورة`);

  const items: Item[] = opts.only?.length ? CATALOG.filter((i) => opts.only!.includes(i.key)) : CATALOG;
  const theme = JSON.stringify(buildTemplate('classic').theme);
  const report: PagesReport = { store: storeName, pages: [] };

  for (const item of items) {
    const actions: string[] = [];
    const warnings: string[] = [];
    const done = () => report.pages.push({ key: item.key, slug: item.slug, actions, warnings });

    const product = await db.product.findFirst({ where: { companyId, storeId, sku: item.sku }, select: { id: true } });
    if (!product) {
      warnings.push(`المنتج ${item.sku} غير موجود بالمتجر — شغّل apply-sehha أولاً. تُخطّي.`);
      done();
      continue;
    }

    const holder = await db.landingPage.findFirst({
      where: { slug: item.slug },
      select: { id: true, companyId: true, storeId: true, productId: true, isPublished: true, sections: true },
    });
    if (holder) {
      if (holder.companyId === companyId && holder.storeId === storeId && holder.productId === product.id) {
        const next = opts.restyle && !holder.isPublished ? restyled(holder.sections, { name: item.pageName, line: item.strip }) : null;
        if (next) {
          actions.push(`الصفحة /lp/${item.slug} (مسودة): شكل النموذج ← مضغوط + قائمة اختيار الكمية، واسم المنتج فوق البوسترات`);
          if (opts.apply) {
            // `isPublished: false` in the WHERE: a page published a moment ago is never touched.
            await db.landingPage.updateMany({ where: { id: holder.id, isPublished: false }, data: { sections: next } });
          }
        } else {
          actions.push(`الصفحة /lp/${item.slug} موجودة${holder.isPublished ? ' (منشورة)' : ' (مسودة)'} — تُركت كما هي`);
        }
      } else {
        warnings.push(`الرابط /lp/${item.slug} مأخوذ لصفحة غير هذه (منتج أو متجر آخر) — تُخطّي، لم تُمسّ.`);
      }
      done();
      continue;
    }

    // The posters are the product's own pictures, put there by apply-sehha — found by the marker it wrote, in the poster order.
    const rows = await db.productImage.findMany({
      where: { productId: product.id, altText: { startsWith: `sehha:${item.key}:` } },
      select: { url: true, altText: true },
    });
    const posters = item.posters.map((n) => rows.find((r) => r.altText === `sehha:${item.key}:${n}`)?.url).filter((u): u is string => !!u);
    if (posters.length !== item.posters.length) {
      warnings.push(`بوسترات «${item.key}» ناقصة بصور المنتج (${posters.length} من ${item.posters.length}) — شغّل apply-sehha --apply أولاً. تُخطّي.`);
      done();
      continue;
    }

    actions.push(`صفحة مسودة «${item.pageName}» على /lp/${item.slug} — ${posters.length} بوستر كاملة ثم نموذج الطلب (عروض المنتج الحيّة)`);
    if (opts.apply) {
      await db.landingPage.create({
        data: {
          companyId,
          storeId,
          name: item.pageName,
          slug: item.slug,
          productId: product.id,
          builderMode: 'BLOCKS',
          theme,
          sections: JSON.stringify(sectionsFor(posters, { name: item.pageName, line: item.strip })),
          isPublished: false,
          showInStore: false,
        },
      });
      await deps.standDownRedirectsTo(item.slug);
    }
    done();
  }

  for (const p of report.pages) {
    log(`\n▸ ${p.key}`);
    for (const a of p.actions) log(`   ${opts.apply ? '✔' : '·'} ${a}`);
    for (const w of p.warnings) log(`   ⚠ ${w}`);
  }
  log(opts.apply ? '\nانتهى. كل الصفحات مسودة غير منشورة — راجعها وانشرها من «صفحات الهبوط».' : '\nتجربة بلا كتابة. للتطبيق: أضف --apply');
  return report;
}
