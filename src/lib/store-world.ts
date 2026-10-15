import { contrastRatio, isValidHex, nearestPassing, readableOn } from './landing-theme';
import type { ProductAttributes } from './product-attributes';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * A PRODUCT'S OWN WORLD — THE COLOURS «علامة» WEARS, PER PRODUCT.
 *
 * The owner's §٢: «ألوان العالم بتنحفظ مع المنتج. المالك بيختارها، أو
 * بتنقترح من صورة المنتج» — and then the rule that decides everything
 * else about this file:
 *
 *     «لون النص بيتختار لحاله عشان يضلّ مقروء — AA على الأقلّ فوق
 *      الخلفيّة المحسوبة.»
 *
 * So no colour here is returned without being measured against the one it
 * will be read on. Not a lightness threshold — a measured ratio, through
 * the same `contrastRatio` the template contract refuses a skin with.
 * §١٠.٣ is the test: every world this function can produce passes AA.
 *
 * ── WHERE THE COLOUR COMES FROM, IN ORDER ──
 *
 * 1. THE OWNER'S OWN, when the product's category has a colour question
 *    and this product answered it. That answer is the «بكبسة» half of
 *    §٢: one field on the product, stored with the product, no new
 *    column and no migration.
 *
 * 2. OTHERWISE a curated world, chosen by a stable hash of the product's
 *    id. Stable matters more than clever: a world that changed on every
 *    render would repaint the shop while a shopper scrolled it.
 *
 * ⚠️ WHAT IS NOT HERE, AND THE OWNER SHOULD KNOW: «بتنقترح من صورة
 * المنتج» — sampling the edges of the photograph — is NOT implemented.
 * It needs image decoding on the render path (or a column to cache it
 * in), and both are decisions above an agent's pay grade. What is built
 * is the half that needs neither: the owner's press, and a curated world
 * under it. Recorded in `docs/storefront/FAMILIES.md`.
 *
 * ── AND WHY CURATED RATHER THAN GENERATED ──
 *
 * A hue spun off a hash gives muddy olive-browns about a third of the
 * time, and «a third of your products look dirty» is not a trade worth
 * making for cleverness. Eight worlds, hand-mixed, each a different hue
 * and each dark enough to carry a photograph — the shop stays coherent
 * whichever product a shopper lands on.
 * ═══════════════════════════════════════════════════════════════════════
 */

/** What one product's world is made of, every member already measured. */
export interface ProductWorld {
  /** Which curated world this is — for a test, and for the gallery. */
  key: string;
  /** The page and the hero behind the product. */
  bg: string;
  /** A deeper panel inside it — the ingredient section, the video card. */
  deep: string;
  /** The product's own colour: the filled button, the chosen circle. */
  accent: string;
  /** Readable over `accent` — AA or better, measured. */
  accentText: string;
  /**
   * The accent WHEN IT IS INK rather than a fill: a link, a small label.
   * A brand colour that passes on a button does not necessarily pass as
   * text on the page, and the two are different questions.
   */
  accentInk: string;
  /** The body ink over `bg` — AA or better, measured. */
  text: string;
  /** The quieter ink over `bg` — still AA, never «grey enough to look nice». */
  muted: string;
  /** A hairline: the ink at low alpha, so it follows whatever ink won. */
  border: string;
}

/**
 * THE EIGHT, each a different hue and each mixed to hold a photograph.
 *
 * `bg` is the world; `deep` is the same world one step further in, for a
 * panel that must read as inside it rather than on top of it.
 */
export const WORLDS: readonly { key: string; bg: string; deep: string; accent: string }[] =
  Object.freeze([
    { key: 'ink', bg: '#171311', deep: '#0f0c0b', accent: '#c0803c' },
    { key: 'forest', bg: '#101814', deep: '#0a110d', accent: '#4f9c6b' },
    { key: 'night', bg: '#121626', deep: '#0b0e1a', accent: '#7183d8' },
    { key: 'plum', bg: '#1a1119', deep: '#110a10', accent: '#b06a9b' },
    { key: 'clay', bg: '#1b1412', deep: '#120c0a', accent: '#cf7a52' },
    { key: 'sea', bg: '#0e1819', deep: '#081112', accent: '#46a3a8' },
    { key: 'olive', bg: '#171810', deep: '#0f100a', accent: '#a2a84a' },
    { key: 'wine', bg: '#1a1013', deep: '#11090c', accent: '#c25a63' },
  ]);

/**
 * The category questions whose answer is read as this product's colour.
 *
 * Several spellings because a category's questions are the SELLER's, in
 * their own words: a shop may have called it «اللون» and another `world`.
 * Matching a small set of names costs nothing and saves the seller being
 * told to rename a field they already filled in.
 */
export const WORLD_KEYS: readonly string[] = ['world', 'عالم', 'color', 'colour', 'اللون', 'لون'];

/**
 * A STABLE NUMBER FROM A STRING — and `Math.random` would be a shop that
 * changes colour between the card and the page it opens.
 *
 * FNV-1a, which is four lines and spreads short ids well enough that
 * eight worlds come out evenly. Nothing cryptographic is being asked of
 * it: the only requirement is «the same id gives the same world, today
 * and after a deploy».
 */
function hashOf(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * The hue of a colour, 0–360, or null for anything unparseable.
 *
 * WHY THIS IS LOCAL. `landing-theme.ts` keeps its own parser private and
 * exports what a PALETTE needs — lightness, contrast, the nearest passing
 * colour. A hue is not among them because no palette ever needed one; the
 * world does, to answer «which of the eight is this colour's own». Three
 * lines of arithmetic here is a smaller debt than a second exported
 * colour API, and `isValidHex` above is still the one gate.
 */
function hueOf(hex: string): number | null {
  if (!isValidHex(hex) || hex.length !== 7) return null;
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return 0;
  const d = max - min;
  const h =
    max === r ? ((g - b) / d + (g < b ? 6 : 0)) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

/** How far apart two hues are on the circle — 0 to 180. */
function hueGap(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/**
 * The colour a product names for itself, if it names one.
 *
 * Read off the product's answers to its category's questions — the same
 * `attributes` every other surface reads — and only if it really is a
 * colour. A seller who typed «ذهبي» into that field has said something
 * true and unusable, and the world falls back rather than failing.
 */
export function namedColour(attributes: ProductAttributes | null | undefined): string | null {
  if (!attributes) return null;
  for (const key of WORLD_KEYS) {
    const value = attributes[key];
    if (typeof value !== 'string') continue;
    const hex = value.trim().toLowerCase();
    if (isValidHex(hex) && hex.length === 7) return hex;
  }
  return null;
}

/**
 * THIS PRODUCT'S WORLD, measured into readability before it is returned.
 *
 * The ink is chosen by `readableOn` — ink or paper, whichever actually
 * passes on the computed background — and the quiet ink is walked away
 * from mid-grey until it passes too. `nearestPassing` keeps the hue and
 * moves the lightness, so «quieter» stays quiet instead of becoming a
 * second body colour.
 */
export function worldOf(product: {
  id: string;
  attributes?: ProductAttributes | null;
}): ProductWorld {
  const named = namedColour(product.attributes);
  const hue = named ? hueOf(named) : null;

  /*
   * THE OWNER'S COLOUR PICKS THE WORLD IT BELONGS IN, and then stays the
   * accent itself. Taking it as the BACKGROUND was the other option and
   * it is worse: a seller picks their brand colour, which is the colour
   * of their bottle and almost never a colour a page can be — a whole
   * screen of mid-pink with a photograph on it.
   */
  const base =
    hue === null
      ? WORLDS[hashOf(product.id) % WORLDS.length]
      : [...WORLDS].sort((a, b) => hueGap(hueOf(a.accent) ?? 0, hue) - hueGap(hueOf(b.accent) ?? 0, hue))[0];

  const accent = named ?? base.accent;
  const text = readableOn(base.bg);
  /*
   * AA, NOT «looks muted». A muted grey that fails on this background is
   * the single most common way a dark page becomes unreadable outdoors,
   * and the fallback is the body ink rather than a prettier failure.
   */
  const muted = nearestPassing('#9a9a9a', base.bg, 4.5) ?? text;
  const accentInk = nearestPassing(accent, base.bg, 4.5) ?? text;

  /*
   * ── WHY `readableOn` ALONE IS NOT ENOUGH ON THE BUTTON ──
   *
   * It returns ink or paper, whichever is BETTER — and for a colour in
   * the middle of the range both are bad. Worked out rather than
   * guessed: the two curves cross at a relative luminance of about
   * 0.205, where each gives 4.12:1. So a seller who names a mid-grey or
   * a mid-olive gets a button that misses AA and nothing says so.
   *
   * Walking the winner's own lightness until it passes fixes it in the
   * direction it was already going — ink goes to black, paper stays
   * paper — and the fallback is the unwalked winner, which is still the
   * better of the two.
   */
  const onAccent = readableOn(accent);

  return {
    key: base.key,
    bg: base.bg,
    deep: base.deep,
    accent,
    accentText: nearestPassing(onAccent, accent, 4.5) ?? onAccent,
    accentInk,
    text,
    muted,
    /*
     * The ink at low alpha, so the hairline follows whichever ink won
     * instead of being a grey that only works on a dark world. Eight
     * digits of hex is CSS, not a trick — and it needs no colour-mixing
     * support to be true in every browser this shop opens in.
     */
    border: `${text}2e`,
  };
}

/**
 * ═══════════════════════════════════════════════════════════════════════
 * THE WORLD, WRITTEN AS THE SHOP'S OWN VARIABLES — not as a new family.
 *
 * `--store-*` and nothing else. A shop's look is `--store-*`, the
 * system's is `--sys-*`, and `theme-isolation.test.ts` enforces both
 * ways; a world is one of a shop's products wearing its own colours, so
 * it belongs in the shop's family rather than in a third prefix nobody
 * else reads.
 *
 * ── AND WRITING THEM ON THE ELEMENT IS WHAT MAKES THE FAMILY AFFORDABLE ──
 *
 * MEASURED. The first version emitted `--store-world-*` and then had a
 * stylesheet rule mapping those onto `--store-*` for every element that
 * needed them, plus a coloured rule per element. That rule alone was 584
 * bytes of every brand shop's stylesheet, and the family came to 7.8 KB
 * against a 50 KB whole-sheet budget that the base already spends 43.3 of.
 *
 * Emitting the shop's OWN names here instead means every rule already
 * written — the landing blocks, the offer cards, the order form, the FAQ
 * box, the card — paints itself in this product's world with no new
 * selector at all. The cost moves to the HTML, where it is a few hundred
 * highly repetitive bytes that gzip to almost nothing, and the saving is
 * in the render-blocking stylesheet, where it is real.
 *
 * `--store-accent-ink` is the one name that is new, and it is a real
 * distinction rather than a synonym: `--store-accent` is what a button is
 * FILLED with, and this is the accent walked until it can be READ on this
 * world's background. A brand colour that passes on a button does not
 * necessarily pass as text, and those are two questions.
 * ═══════════════════════════════════════════════════════════════════════
 */
export function worldVars(world: ProductWorld): Record<string, string> {
  return {
    '--store-page': world.bg,
    '--store-card': world.deep,
    '--store-surface': world.deep,
    '--store-surface-2': world.deep,
    '--store-text': world.text,
    '--store-muted': world.muted,
    '--store-border': world.border,
    '--store-accent': world.accent,
    '--store-accent-text': world.accentText,
    '--store-accent-dark': world.accent,
    '--store-accent-ink': world.accentInk,
    '--store-price': world.text,
    '--store-price-compare': world.muted,
  };
}

/** Does every ink in this world actually pass AA on it? For the guard. */
export function worldIsReadable(world: ProductWorld): boolean {
  return (
    contrastRatio(world.text, world.bg) >= 4.5 &&
    contrastRatio(world.muted, world.bg) >= 4.5 &&
    contrastRatio(world.accentInk, world.bg) >= 4.5 &&
    contrastRatio(world.accentText, world.accent) >= 4.5 &&
    /*
     * AND ON THE DEEP PANEL TOO. The ingredient section and the video
     * card sit on `deep`, which is darker than `bg` — darker is easier
     * for a light ink and harder for a dark one, and a light world
     * (the owner may name one) is exactly where that flips.
     */
    contrastRatio(world.text, world.deep) >= 4.5
  );
}
