import { LAYOUT_SLOTS } from './layout-slots';
import type { ThemeFont } from './landing-theme';
import { LANDING_FAMILIES, type LandingFamilyId } from './landing-matcher';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * THE FAMILIES — FOUR LOOKS A SHOPPER CAN TELL APART WITHOUT BEING TOLD.
 *
 * Ten templates were measured in `docs/storefront/AUDIT.md` §5 and the
 * answer was that they are one shop in ten palettes: the same header, the
 * same first screen, the same card, a different accent. A seller who
 * tried two of them learned that the feature is decoration, and stopped
 * trying the other eight.
 *
 * A FAMILY is the unit that actually differs — the owner's D3:
 *
 *   «عيادة»   problem-solving, medical. Sells on evidence.
 *   «عطّار»   natural, herbal, heritage. Sells on a story.
 *   «ترند»    beauty, impulse. Sells on the offer.
 *   «علامة»   one brand, many worlds. Sells on the product itself.
 *             Added by the owner on 15/10 — see
 *             `docs/storefront/FAMILIES.md`.
 *
 * Each family names a typeface pair, a rhythm, an imagery treatment and
 * one variant per engine slot. Every store, old or new, can wear any of
 * them; a new store starts on the default.
 *
 * ── WHY THIS IS NOT AN ELEVENTH TEMPLATE SYSTEM ──
 *
 * A family is carried BY THE ENGINE, through `LAYOUT_SLOTS` and the skin
 * contract, and nothing else. It holds no colour of its own: colours stay
 * the seller's, derived from their accent in `store-theme.ts`. It holds no
 * selling logic: price, offers, cart, order, search and attribution are
 * the engine's, shared by all four. What it holds is the LOOK — and
 * exactly the look:
 *
 *     THE OWNER'S RULING, 15/10: «a theme/template changes the LOOK. It
 *     never changes the ARRANGEMENT of anything a person arranged.»
 *
 * So nothing here reorders a published home page's blocks, a shop's
 * menus, or the checkout's fields. A family that could would be a
 * template undoing a seller's work every time they tried one on, and
 * `store-family-arrangement.test.ts` is what stops it.
 *
 * ── AND THE TEN SKINS ARE NOT DELETED ──
 *
 * `SKIN_FAMILY` below is `AUDIT.md` §7.3: six skins are kept as their
 * family's voices, three are merged into a kept one, one is retired. A
 * merged or retired skin is HIDDEN from the gallery and still parses, so
 * a shop wearing one keeps exactly the look it has until its owner
 * changes it. Deleting the name would make that shop's theme fail to
 * parse — a seller's storefront going blank because of a decision about
 * a list.
 * ═══════════════════════════════════════════════════════════════════════
 */

/**
 * THE FOUR IDS COME FROM THE ONE LIST THAT ALREADY HAD THEM.
 *
 * `landing-matcher.ts` shipped `LANDING_FAMILIES` on the S3 branch with a
 * note written to this one: «the families are being built on their own
 * branch (2a-2)… when that branch lands, its renderer reads these ids;
 * two lists of the same four would be two lists to keep in step, so the
 * ids are the contract».
 *
 * This is that renderer, and it reads them. What the matcher holds is an
 * id and one line about who the family is for — what a page can be
 * PROPOSED as. What this file holds is the LOOK: the typography, the
 * rhythm, the imagery and one variant per engine slot. Neither repeats
 * the other, and the id is the joint.
 *
 * It also settled a spelling. This file said `herbalist` and the matcher
 * said `herbal` for the same «عطّار» — two names for one family, which is
 * exactly how a seller's shop comes to wear a family the matcher can
 * never propose. The matcher's spelling wins because it shipped first and
 * because `selling-blocks.ts` already derives from it.
 */
export const FAMILY_IDS = LANDING_FAMILIES.map((f) => f.id) as readonly LandingFamilyId[];
export type FamilyId = LandingFamilyId;

/**
 * What a shop that has chosen nothing wears.
 *
 * «عيادة» and not «علامة»: the default must be the family that asks the
 * least of a seller's content. A brand world needs a photograph per
 * product to be worth looking at; a clinic needs a name and a price.
 */
export const DEFAULT_FAMILY: FamilyId = 'clinic';

export interface StoreFamilyLook {
  id: FamilyId;
  /** What the seller reads in the gallery. */
  name: string;
  /** One line, in the gallery, under the name. */
  line: string;
  suggestedFor: string;
  /** Two faces at most, as the skin contract already allows. */
  type: { heading: ThemeFont; body: ThemeFont };
  /**
   * How much air the family breathes, written as a scale the stylesheet
   * reads through `[data-family]`. Not a pixel count here: a rhythm that
   * named numbers would be a second spacing system beside the sheet's.
   */
  rhythm: 'tight' | 'open' | 'loud' | 'wide';
  /** What a photograph for this family should look like. */
  imagery: string;
  /** One variant per slot the engine draws. */
  layout: {
    header: (typeof LAYOUT_SLOTS.header)[number];
    hero: (typeof LAYOUT_SLOTS.hero)[number];
    categoryNav: (typeof LAYOUT_SLOTS.categoryNav)[number];
    productCard: (typeof LAYOUT_SLOTS.productCard)[number];
    categoryPage: (typeof LAYOUT_SLOTS.categoryPage)[number];
    productPage: (typeof LAYOUT_SLOTS.productPage)[number];
  };
}

export const STORE_FAMILIES: readonly StoreFamilyLook[] = Object.freeze([
  /**
   * «عيادة» — THE ONE THAT ARGUES.
   *
   * One clinical face at two weights, a thin header that gets out of the
   * way, and a first screen that puts the shop's own terms beside
   * something priced: `splitProof`. The card is `wide` because this
   * shopper reads a card rather than browsing it — they arrived with a
   * complaint and they are looking for the answer to it.
   */
  {
    id: 'clinic',
    name: 'عيادة',
    line: 'للمنتج اللي بيحلّ مشكلة — إثبات وأرقام، بلا زخرفة',
    suggestedFor: 'الصحة والعناية الطبية',
    type: { heading: 'ibm', body: 'ibm' },
    rhythm: 'tight',
    imagery: 'إضاءة ساطعة، خلفية بيضاء، المنتج وحده — بلا أيدٍ ولا ظلال قاسية',
    layout: {
      header: 'minimal',
      hero: 'splitProof',
      categoryNav: 'chips',
      productCard: 'wide',
      categoryPage: 'grid3',
      productPage: 'gallerySide',
    },
  },

  /**
   * «عطّار» — THE ONE THAT TELLS.
   *
   * A Naskh heading over a neutral body, a centred stacked header, and
   * the one first screen that leads with words — `editorial` — because
   * what this shop sells is where the thing came from. Square cards in
   * a calm two-up grid: a shelf of jars, read slowly.
   */
  {
    id: 'herbal',
    name: 'عطّار',
    line: 'للطبيعي والتراثي — حكاية وأصل، وإيقاع هادي',
    suggestedFor: 'الأعشاب والزيوت والمنتجات الطبيعية',
    type: { heading: 'amiri', body: 'tajawal' },
    rhythm: 'open',
    imagery: 'ضوء دافئ، خلفية خشب أو كتّان، تفاصيل قريبة للملمس',
    layout: {
      header: 'stacked',
      hero: 'editorial',
      categoryNav: 'tiles',
      productCard: 'square',
      categoryPage: 'grid2',
      productPage: 'galleryTop',
    },
  },

  /**
   * «ترند» — THE ONE THAT SHOUTS, ONCE.
   *
   * A display face for the shout and a text face for everything anybody
   * reads. The header sits over the hero, and the hero IS the offer
   * strip — the cheapest «من» prices first, because this shopper did not
   * arrive with a problem, they arrived with a thumb.
   */
  {
    id: 'trend',
    name: 'ترند',
    line: 'للشراء السريع — العرض أول إشي، والكروت زي اللي بتشوفها كل يوم',
    suggestedFor: 'الجمال والعناية والجمهور الشاب',
    type: { heading: 'changa', body: 'readex' },
    rhythm: 'loud',
    imagery: 'ألوان مشبعة، خلفية ملوّنة، لقطات قريبة بنسبة طويلة 9:13',
    layout: {
      header: 'transparent',
      hero: 'offerStrip',
      categoryNav: 'chips',
      productCard: 'tile',
      categoryPage: 'grid3',
      productPage: 'sticky',
    },
  },

  /**
   * «علامة» — THE TEMPLATE, NOT THE PAGE.
   *
   * The owner's own words on 15/10: «علامة قالب، مش صفحات بتنعمل
   * بالإيد. أي منتج جديد بيطلع بنفس الشكل من حقوله، بلا مصمّم ولا شغل
   * يدوي.» Every section of it is built from a product field, and an
   * empty field takes its section with it — see
   * `store-brand-template.ts`, which is where that rule lives, and
   * §١٠ of the owner's note, which is the test it has to pass.
   *
   * Its colours are the only ones in this file that are not the
   * seller's: each product carries its OWN world, computed in
   * `store-world.ts` and readable at AA over whatever comes out.
   */
  {
    id: 'brand',
    name: 'علامة',
    line: 'لعلامة واحدة بأكثر من منتج — كل منتج بعالمه ولونه، والصفحة بتتبنى من حقوله',
    suggestedFor: 'العلامات التجارية ذات السلسلة — عناية، عطور، مكمّلات',
    /*
     * ── THE FACES THE OWNER NAMED ARE NOT ALL IN THE REPOSITORY ──
     *
     * §٨ asks for El Messiri for headings, IBM Plex Sans Arabic for the
     * body and Cinzel for the Latin names, all three served from the
     * repository as `RV39` did for the dashboard — never fetched from
     * Google at build time.
     *
     * Of the three, only IBM Plex Sans Arabic is here:
     * `src/app/(system)/fonts/plex-arabic-*.woff2` with its OFL licence.
     * El Messiri and Cinzel are not, and downloading a font file is the
     * owner's decision, not an agent's. So this family ships on the face
     * that IS in the repository, at two weights, and the Latin names are
     * set in the same family's Latin half — tracked out, which is
     * allowed for Latin and never for Arabic.
     *
     * Swapping in the two display faces is one line here plus the woff2
     * files and their licences. Recorded in `docs/storefront/FAMILIES.md`
     * as the one open item.
     */
    type: { heading: 'ibm', body: 'ibm' },
    rhythm: 'wide',
    imagery: 'المنتج على خلفية داكنة بلون عالمه، إضاءة من جنب، وصورة ثانية قريبة للملمس',
    layout: {
      header: 'split',
      hero: 'worldFirst',
      categoryNav: 'dropdown',
      productCard: 'world',
      categoryPage: 'grid2',
      productPage: 'galleryTop',
    },
  },
]);

export function familyById(id: string | null | undefined): StoreFamilyLook | null {
  return STORE_FAMILIES.find((f) => f.id === id) ?? null;
}

/**
 * ═══════════════════════════════════════════════════════════════════════
 * THE TEN SKINS → THE FOUR FAMILIES — `AUDIT.md` §7.3, as data.
 *
 * `keep` is a voice the gallery offers. `merge` is a skin whose job
 * another one does better, and `retire` is one nobody will build on.
 * Neither is deleted and neither is silent: `familyNoteAr` is what the
 * seller reads on their own screen when their shop is wearing one.
 * ═══════════════════════════════════════════════════════════════════════
 */
export interface SkinPlacement {
  family: FamilyId | null;
  state: 'reference' | 'voice' | 'merged' | 'retired';
  /** The kept skin a merged one folds into — the look a seller is sent to. */
  into?: string;
  why: string;
}

export const SKIN_FAMILY: Readonly<Record<string, SkinPlacement>> = Object.freeze({
  lab: { family: 'clinic', state: 'reference', why: 'المرجع — نفس ترويسة العائلة ونفس مزاجها' },
  pure: {
    family: 'clinic',
    state: 'merged',
    into: 'lab',
    why: 'نفس الترويسة ونفس المزاج (clean) — صوتان لا يُفرَّق بينهما',
  },
  herbs: { family: 'herbal', state: 'reference', why: 'المرجع — دافئ، تحريري، نسخي' },
  heritage: {
    family: 'herbal',
    state: 'merged',
    into: 'herbs',
    why: 'نفس الدفء ونفس البطل التحريري ونفس عائلة الخط',
  },
  ritual: { family: 'herbal', state: 'voice', why: 'الصوت الثاني — البطاقة العريضة وإيقاع مختلف فعلاً' },
  amber: {
    family: 'herbal',
    state: 'merged',
    into: 'ritual',
    why: 'مزاجه الجريء يخصّ «ترند» وتخطيطه يخصّ «عطّار» — فلا يقوم بعمل جديد',
  },
  pulse: { family: 'trend', state: 'reference', why: 'المرجع — شريط العروض والترويسة المقسومة' },
  souq: {
    family: 'trend',
    state: 'merged',
    into: 'pulse',
    why: 'نفس شريط العروض ونفس البطاقة المضغوطة',
  },
  tender: { family: 'trend', state: 'voice', why: 'الصوت الناعم — قالب ثانٍ حقيقي للعائلة نفسها' },
  pearl: {
    family: null,
    state: 'retired',
    why: 'بطل «slider» وترويسة شفّافة يكرّران عمل «نبض» بنيّة بيع أقل — يُخفى ولا يُحذف',
  },
  /**
   * The brand family's reference voice, added with the family on 15/10.
   * Its own entry rather than a special case in the lookup: «which family
   * does this skin belong to» must have exactly one answer for every
   * skin that ships.
   */
  alama: { family: 'brand', state: 'reference', why: 'المرجع — عالم لكل منتج، والصفحة من حقول المنتج' },
});

/** Which family a template belongs to, or null for a retired one. */
export function familyOfSkin(skinId: string | null | undefined): FamilyId | null {
  if (!skinId) return null;
  return SKIN_FAMILY[skinId]?.family ?? null;
}

/** What the gallery may offer: the kept voices, in the shipped order. */
export function isGalleryVoice(skinId: string): boolean {
  const state = SKIN_FAMILY[skinId]?.state;
  return state === 'reference' || state === 'voice';
}

/**
 * WHAT THE SELLER IS TOLD when their shop wears a skin nobody offers.
 *
 * The same shape as `retiredNoteAr` in `layout-slots.ts`, and for the
 * same reason: falling back without a word is the failure, saying so is a
 * decision. Here nothing falls back at all — the shop keeps its look —
 * so the note says that too, or a seller reads «متقاعد» as «broken».
 */
export function familyNoteAr(skinId: string): string | null {
  const placement = SKIN_FAMILY[skinId];
  if (!placement || placement.state === 'reference' || placement.state === 'voice') return null;
  const tail =
    placement.state === 'merged' && placement.into
      ? `صار جزءاً من «${placement.into}»`
      : 'ما عاد يُعرض للمتاجر الجديدة';
  return `متجرك يلبس قالب «${skinId}»، و${tail} — شكل متجرك ما تغيّر، وبيضلّ زي ما هو لحد ما تغيّره إنت.`;
}

/**
 * The voices of one family, kept ones first.
 *
 * Used by the gallery to draw a family's row. A family with no kept voice
 * would be a heading over nothing, which `store-families.test.ts`
 * refuses.
 */
export function voicesOf(family: FamilyId): string[] {
  return Object.entries(SKIN_FAMILY)
    .filter(([, p]) => p.family === family && (p.state === 'reference' || p.state === 'voice'))
    .sort(([, a], [, b]) => (a.state === 'reference' ? -1 : 0) - (b.state === 'reference' ? -1 : 0))
    .map(([id]) => id);
}
