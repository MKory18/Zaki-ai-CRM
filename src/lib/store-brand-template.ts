import { PROSE_KEYS } from './product-dna';
import type { ProductAttributes } from './product-attributes';
import { worldOf, type ProductWorld } from './store-world';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * «علامة» IS A TEMPLATE, NOT A PAGE SOMEBODY BUILT BY HAND.
 *
 * The owner's rule 0, and it outranks every detail under it:
 *
 *     «علامة قالب، مش صفحات بتنعمل بالإيد. أي منتج جديد بيطلع بنفس
 *      الشكل من حقوله، بلا مصمّم ولا شغل يدوي. كلّ إشي تحت لازم ينبني
 *      من الحقول.»
 *
 * So this file is the whole template, expressed as a function of the
 * fields a product already has. Nothing it returns is authored anywhere;
 * nothing it returns is invented. A product saved an hour ago comes out
 * looking like the one in the owner's reference image, and it does so
 * without anybody opening an editor.
 *
 * ── AND THE SECOND HALF OF RULE 0 ──
 *
 *     «⚠️ أي حقل فاضي، قسمه بيختفي لحاله والصفحة بتضلّ كاملة.»
 *
 * An empty field does not leave a hole, a placeholder, or a heading over
 * nothing. It takes its whole section with it and the page closes up. That
 * is why `brandSections` exists as a FUNCTION of the content rather than
 * as a list the page walks: the page cannot draw a section this file did
 * not name, so «قسم مكسور» is unreachable rather than merely avoided.
 * §١٠ of the owner's note is the test, and it is in
 * `store-brand-template.test.ts`.
 *
 * ── WHICH FIELD FEEDS WHICH SECTION ──
 *
 * | الحقل | من وين | القسم |
 * |---|---|---|
 * | صورة رئيسيّة  | `product.image`            | الصورة الكبيرة · الكرت · المبدّل |
 * | الاسم عربي    | `product.name`            | العنوان الضخم |
 * | الاسم لاتيني  | `product.nameEn`          | الكلمة الضخمة الباهتة |
 * | الجملة        | أول جملة من `description` | السطر تحت الاسم |
 * | الوعود        | بقيّة سطور `description`  | دائرة الوعود |
 * | الشارات       | أجوبة الفئة القصيرة       | سطر المواصفات |
 * | المكوّن        | `attributes.ingredients`  | القسم الداكن |
 * | لقطة قريبة    | الصورة الثانية            | القسم الداكن |
 * | فيديو         | `attributes.video`        | كرت الفيديو |
 * | كيف بتستعمله  | `attributes.howTo`        | الخطوات المرقّمة |
 * | الأسعار       | العروض الحيّة (المحرّك)     | كروت الكميّة |
 *
 * ⚠️ TWO SECTIONS OF THE OWNER'S NOTE HAVE NO FIELD BEHIND THEM, so by
 * rule 0 they do not appear, and this is where that is written down:
 *
 *   «مبدّل الشكل» (قناع ١٥٠ مل / بخاخ ٥٠ مل) needs PRODUCT VARIANTS. The
 *   schema has none — a product has one price and its offers are quantity
 *   bundles, which the order section already draws as the quantity cards.
 *   Inventing a shape switcher out of bundles would put the same three
 *   prices on the page twice under two different meanings.
 *
 *   «من الواتساب» (customer message bubbles) has no field and no source.
 *   Seeding two would be exactly the invented social proof the honesty
 *   rule forbids — «no invented reviews, ratings, counters or stock» —
 *   «مثال» badge or not.
 *
 * Both are listed in `docs/storefront/FAMILIES.md` as open, with what each
 * would need.
 * ═══════════════════════════════════════════════════════════════════════
 */

/** Every section this template can draw, in the order it draws them. */
export const BRAND_SECTIONS = [
  'hero',
  'ghost',
  'badges',
  'price',
  'cta',
  'proof',
  'promises',
  'closeup',
  'video',
  'howto',
  'order',
  'faq',
  'series',
  'sticky',
] as const;
export type BrandSection = (typeof BRAND_SECTIONS)[number];

/**
 * The sections that are not a field's to take away.
 *
 * A product has a name, a photograph and a price, or it is not on the
 * shelf at all — `storeShelf` refuses `basePrice: 0`. And the order form
 * and the two questions every COD shopper asks are the page's whole job.
 */
export const ALWAYS: readonly BrandSection[] = ['hero', 'price', 'cta', 'order', 'faq', 'sticky'];

export interface BrandProductInput {
  id: string;
  name: string;
  /** The Latin name, for the huge faint word. A real column: `Product.nameEn`. */
  nameEn?: string | null;
  description?: string | null;
  image?: string | null;
  /** Every image, primary first — the second one is the close-up. */
  gallery?: readonly string[];
  attributes?: ProductAttributes | null;
  /** How many delivered orders, ABOVE the engine's floor, or null. */
  orderedCount?: number | null;
  /** How many other products are in the series. */
  siblings?: number;
}

export interface BrandContent {
  world: ProductWorld;
  /** The huge faint word behind the photograph, or nothing. */
  latin: string | null;
  title: string;
  /** The sentence under the title. */
  line: string | null;
  /** The specification line, and the hero's badges: the same short facts. */
  badges: string[];
  /** Up to three, numbered, around the circle. Never a fourth. */
  promises: string[];
  closeup: string | null;
  ingredient: string | null;
  video: string | null;
  steps: string[];
  orderedCount: number | null;
  siblings: number;
}

/**
 * THE MARKS A PERSON PUTS IN FRONT OF A LINE THEY MEAN AS AN ITEM.
 *
 * A dash, a bullet, a number and its dot — and the number may be
 * ١ ٢ ٣ as easily as 1 2 3, because the seller is typing Arabic. Stripped
 * so the list this template draws numbers the lines itself: a line that
 * arrived as «١. وزّعه» and kept its «١.» would be numbered twice, which
 * is what the first version of this did.
 *
 * Western digits are what this product DISPLAYS; what a seller types in
 * their own description is their own, and reading only one of the two
 * would quietly keep the mark for half the shops.
 */
const BULLET = /^\s*[-–—*·•)٠-٩۰-۹0-9.]+\s*/;

/**
 * THE LATIN WORD IS LATIN, OR THERE IS NO LATIN WORD.
 *
 * `nameEn` is a free text column and sellers put anything in it — the
 * Arabic name again, a SKU, a sentence. The huge faint word only works as
 * one short Latin word or two, so that is what is accepted: Latin
 * letters, digits and the few marks a product name carries, up to 24
 * characters. Anything else answers null and the ghost disappears, which
 * is rule 0 doing its job rather than a page with «سيروم فيتامين سي»
 * stretched across it at 120px.
 *
 * UPPERCASE, AND ONLY HERE. `text-transform` means nothing in Arabic and
 * the stylesheet must not carry a rule that could reach it — so the
 * casing is done in the data, on a string already proved to be Latin.
 */
export function latinWord(nameEn: string | null | undefined): string | null {
  const raw = (nameEn ?? '').trim();
  if (!raw || raw.length > 24) return null;
  if (!/^[A-Za-z][A-Za-z0-9 .'&-]*$/.test(raw)) return null;
  return raw.toUpperCase();
}

/**
 * THE PRODUCT'S OWN TEXT, CUT WHERE A PERSON WOULD CUT IT.
 *
 * The first line (or first sentence) is the sentence under the title. The
 * lines after it are the promises — «من نصّ المنتج نفسه», the owner's §٤
 * — and a promise is short: a seller's paragraph about shipping is not
 * one, so anything over 60 characters is left where it was.
 *
 * THREE AT MOST, AND THE SECTION'S OWN HEADING SAYS SO: «تلات وعود، ولا
 * وعد زيادة». A fourth would not fit the circle, and a circle that fits
 * «whatever the seller typed» is a layout that breaks on the first shop
 * that types five.
 */
export function readProductText(description: string | null | undefined): {
  line: string | null;
  promises: string[];
} {
  const raw = (description ?? '').replace(/\r/g, '').trim();
  if (!raw) return { line: null, promises: [] };

  const parts = raw
    .split(/\n+|\s*[·•]\s*/)
    .map((p) => p.replace(BULLET, '').trim())
    .filter(Boolean);

  if (parts.length === 0) return { line: null, promises: [] };

  /*
   * ONE PARAGRAPH IS ONE SENTENCE AND NO PROMISES. Splitting a flowing
   * paragraph on its full stops gave three half-sentences arranged as
   * promises, which reads as a machine chopping somebody's writing up.
   * A seller who wants promises writes them as lines, which is also how
   * they write them everywhere else in this product.
   */
  const first = parts[0];
  const line = first.length > 140 ? `${first.slice(0, 139).trimEnd()}…` : first;
  const promises = parts.slice(1).filter((p) => p.length <= 60).slice(0, 3);
  return { line, promises };
}

/**
 * The short facts the hero prints as a specification line.
 *
 * A category's SELECT and MULTI answers: «قناع شعر», «بخلاصة الأرز»,
 * «صُنع في الأردن». Numbers are left out — «500» on its own says nothing
 * without the label, and the label is the category's, not the product's.
 * Prose is left out too, except `made`, which is the one prose key that
 * is always a badge-shaped sentence.
 */
export function badgesFrom(attributes: ProductAttributes | null | undefined): string[] {
  if (!attributes) return [];
  const out: string[] = [];
  for (const [key, value] of Object.entries(attributes)) {
    if (PROSE_KEYS.includes(key) && key !== 'made') continue;
    for (const v of Array.isArray(value) ? value : [value]) {
      if (typeof v !== 'string') continue;
      const text = v.trim();
      if (!text || text.length > 30 || out.includes(text)) continue;
      out.push(text);
    }
  }
  return out.slice(0, 3);
}

/** The keys a seller's category may have called the video and the steps. */
export const VIDEO_KEYS: readonly string[] = ['video', 'فيديو', 'الفيديو'];
export const HOWTO_KEYS: readonly string[] = ['howTo', 'howto', 'use', 'الاستعمال', 'طريقة الاستعمال'];
export const INGREDIENT_KEYS: readonly string[] = ['ingredients', 'المكوّن', 'المكونات', 'المكوّنات'];

function textAnswer(attributes: ProductAttributes | null | undefined, keys: readonly string[]): string | null {
  if (!attributes) return null;
  for (const key of keys) {
    const value = attributes[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

/**
 * A VIDEO ADDRESS WE WILL ACTUALLY LOAD, or none.
 *
 * Our own media path or an https address, and nothing else: a `javascript:`
 * or a `data:` in a seller's text field must never reach a `src`. The
 * section disappears for anything else, which is rule 0 again and also the
 * safe answer.
 */
export function videoFrom(attributes: ProductAttributes | null | undefined): string | null {
  const raw = textAnswer(attributes, VIDEO_KEYS);
  if (!raw) return null;
  if (/^\/[^/\\]/.test(raw)) return raw;
  if (/^https:\/\/[^\s"'<>]+$/i.test(raw)) return raw;
  return null;
}

/** «كيف بتستعمله» — numbered steps, from the seller's own lines. */
export function stepsFrom(attributes: ProductAttributes | null | undefined): string[] {
  const raw = textAnswer(attributes, HOWTO_KEYS);
  if (!raw) return [];
  return raw
    .split(/\n+|\s*[·•]\s*/)
    .map((s) => s.replace(BULLET, '').trim())
    .filter(Boolean)
    .slice(0, 4);
}

/** The whole template, read off one product. */
export function brandContent(product: BrandProductInput): BrandContent {
  const { line, promises } = readProductText(product.description);
  const gallery = product.gallery ?? [];

  return {
    world: worldOf({ id: product.id, attributes: product.attributes }),
    latin: latinWord(product.nameEn),
    title: product.name,
    line,
    badges: badgesFrom(product.attributes),
    promises,
    /*
     * THE CLOSE-UP IS THE SECOND PHOTOGRAPH, not a crop of the first.
     *
     * The owner's §٤ labels it «من نفس صورة المنتج», and a CSS crop of
     * the main image was the first implementation. It was wrong for a
     * reason worth recording: a crop of a product shot on white is a
     * bigger piece of white, and the section promised a texture it could
     * not show. A second image is a real field the seller already fills
     * in, and when there is only one image the section goes — which is
     * what rule 0 asks for anyway.
     */
    closeup: gallery.length > 1 ? gallery[1] : null,
    ingredient: textAnswer(product.attributes, INGREDIENT_KEYS),
    video: videoFrom(product.attributes),
    steps: stepsFrom(product.attributes),
    orderedCount: product.orderedCount ?? null,
    siblings: product.siblings ?? 0,
  };
}

/**
 * WHICH SECTIONS THIS PRODUCT ACTUALLY HAS.
 *
 * The page draws this list and cannot draw anything else, so an empty
 * field cannot leave a heading behind. Read it as rule 0 in one screen.
 */
export function brandSections(content: BrandContent): BrandSection[] {
  const has: Partial<Record<BrandSection, boolean>> = {
    ghost: Boolean(content.latin),
    badges: content.badges.length > 0,
    proof: typeof content.orderedCount === 'number' && content.orderedCount > 0,
    promises: content.promises.length > 0,
    closeup: Boolean(content.closeup || content.ingredient),
    video: Boolean(content.video),
    howto: content.steps.length > 0,
    series: content.siblings > 0,
  };
  return BRAND_SECTIONS.filter((s) => ALWAYS.includes(s) || has[s]);
}
