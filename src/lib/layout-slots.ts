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
