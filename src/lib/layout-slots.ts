/**
 * THE ENGINE'S PARTS CATALOGUE.
 *
 * Every variant of every component the storefront can draw, named once.
 * A template picks from this list, the shop's theme stores the pick, and
 * the components read it — three readers, one vocabulary.
 *
 * WHY ITS OWN MODULE. It began inside store-skin.ts, which is the
 * template CONTRACT. But the contract imports the block library (its
 * home sections are that library's own section types), so the block
 * library could not import the contract back to learn which hero
 * variants exist — and a second list of hero names is exactly how a
 * template comes to ask for one nobody built.
 *
 * So the catalogue sits under both: the contract picks from it, the
 * parts declare themselves in it, and neither depends on the other.
 *
 * ADDING A VARIANT IS TWO EDITS, DELIBERATELY: a name here and the CSS
 * or markup that draws it. A name with nothing behind it renders the
 * default and tells nobody, which is the failure this list exists to
 * make impossible.
 */
export const LAYOUT_SLOTS = Object.freeze({
  header: ['minimal', 'searchFirst', 'split', 'stacked', 'transparent'],
  /**
   * WHAT THE FIRST SCREEN LEADS WITH — named by that, not by its shape.
   *
   * «البطل بيعرض منتجات أو عروض أو فئات — أبداً مش اسم المتجر لحاله».
   * Naming these `productFirst` / `offerStrip` / `categoryTiles` /
   * `editorial` puts that rule in the vocabulary: there is no name here
   * a template could choose that means «the shop's name, alone».
   *
   * `slider` is the one named after a shape, and it still obeys the
   * rule: what it turns through is products or offers. «بثلاث شرائح
   * كحد أقصى» and by hand — nothing that moves on its own, which is
   * the motion rule the contract already enforces.
   */
  hero: ['productFirst', 'offerStrip', 'categoryTiles', 'editorial', 'slider'],
  categoryNav: ['chips', 'tiles', 'sidebar', 'dropdown'],
  productCard: ['portrait', 'square', 'wide', 'compact'],
  categoryPage: ['grid2', 'grid3', 'list', 'mixed'],
  productPage: ['gallerySide', 'galleryTop', 'sticky'],
  cart: ['drawer', 'page'],
} as const);

export type LayoutSlot = keyof typeof LAYOUT_SLOTS;
export type HeroVariant = (typeof LAYOUT_SLOTS.hero)[number];
export type CategoryPageVariant = (typeof LAYOUT_SLOTS.categoryPage)[number];

/**
 * ═══════════════════════════════════════════════════════════════════════
 * RETIRED — NAMED, NOT DELETED, AND NEVER SILENT.
 *
 * The warning at the top of this file («a name with nothing behind it
 * renders the default and tells nobody») was not enough on its own: it
 * said what must not happen without giving anybody a way to say «this one
 * is deliberately gone». So thirteen of twenty-seven names drifted into
 * exactly that state — see `docs/storefront/AUDIT-2a-delta.md`.
 *
 * A retired variant is one nobody will build. It is:
 *
 *   NOT DELETED. A store's theme may already hold it, and deleting the
 *   name would make that theme fail to parse — a seller's shop going
 *   blank because of a decision about a list.
 *
 *   NOT OFFERED. `liveVariants()` is what the editor shows, so a seller
 *   cannot newly choose one.
 *
 *   NOT SILENT. The theme screen reads `retiredNoteAr()` and says, on the
 *   seller's own screen, which variant their template is holding and what
 *   the shop draws instead. Falling back without a word is the failure;
 *   falling back and saying so is a decision.
 *
 * The value is what the shopper actually gets.
 * ═══════════════════════════════════════════════════════════════════════
 */
export const RETIRED_VARIANTS: Partial<Record<LayoutSlot, Record<string, string>>> = Object.freeze({
  /*
   * `mixed` was «a big first card, small ones after». It is a layout with
   * no rule for WHICH product earns the big cell, and every answer to that
   * is a ranking this system refuses to invent — the shelf has no
   * editorial order, and «newest» is not a reason to be twice the size.
   */
  categoryPage: Object.freeze({ mixed: 'grid3' }),
  /*
   * `drawer` was a side panel for the cart. The cart has been a page at
   * `/s/<store>/cart` since it was written, nothing ever read this slot,
   * and a drawer is a second checkout entrance to keep working on a phone
   * — for a shop whose whole order path is one form.
   */
  cart: Object.freeze({ drawer: 'page' }),
} as const);

/** Is this variant one nobody will build? */
export function isRetired(slot: LayoutSlot, variant: string): boolean {
  return Boolean(RETIRED_VARIANTS[slot]?.[variant]);
}

/**
 * The variant a shop actually gets — itself, or what replaced it.
 *
 * Every renderer reads the slot through this, so a stored retired value
 * can never reach a `data-` attribute with no rule behind it.
 */
export function effectiveVariant<S extends LayoutSlot>(slot: S, variant: string): string {
  return RETIRED_VARIANTS[slot]?.[variant] ?? variant;
}

/** What the editor may offer: everything still built. */
export function liveVariants(slot: LayoutSlot): readonly string[] {
  return LAYOUT_SLOTS[slot].filter((v) => !isRetired(slot, v));
}

/**
 * What to tell the SELLER when their template holds a retired variant.
 *
 * Arabic, on the theme screen, naming both halves: a note that said only
 * «this is old» would leave them guessing what their shoppers see.
 */
export function retiredNoteAr(slot: LayoutSlot, variant: string): string | null {
  const to = RETIRED_VARIANTS[slot]?.[variant];
  if (!to) return null;
  return `هذا القالب يحمل «${variant}» وهو خيار متقاعد لم يعد يُبنى — المتجر يعرض «${to}» بدلاً منه.`;
}
