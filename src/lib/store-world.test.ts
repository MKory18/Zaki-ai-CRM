import { describe, expect, it } from 'vitest';
import { WORLDS, namedColour, worldIsReadable, worldOf, worldVars } from './store-world';
import { contrastRatio } from './landing-theme';
import { repoFile, stripComments } from './guard-source';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * «ولون النص بيعدّي AA فوق كل خلفيّة عالم محسوبة» — §١٠.٣.
 *
 * The owner's third acceptance item for «علامة», and the only one of the
 * three that is about arithmetic rather than about a page. A family that
 * gives every product its own background has, by construction, a
 * background nobody reviewed — so the ink is not chosen, it is MEASURED,
 * and this is where that is held down.
 *
 * ── WHY THIS SWEEPS RATHER THAN SAMPLES ──
 *
 * There are eight curated worlds and an unbounded number of colours a
 * seller may type into their category's colour question. A test that
 * checked «the ink on the first world» would pass forever and prove
 * nothing about the eighth. So: every world, every ink, both the page and
 * the deep panel — and then a sweep of the hue circle to stand in for
 * «whatever the seller types».
 * ═══════════════════════════════════════════════════════════════════════
 */

/** Every ink this family puts on a page, as the pairs that must pass. */
const pairs = (w: ReturnType<typeof worldOf>) => [
  ['النص على خلفية العالم', w.text, w.bg],
  ['النص الهادي على خلفية العالم', w.muted, w.bg],
  ['اللون البارز كنصّ', w.accentInk, w.bg],
  ['النص على الزرّ', w.accentText, w.accent],
  ['النص على اللوح الداكن', w.text, w.deep],
] as const;

describe('every world a product can get is readable', () => {
  it.each(WORLDS.map((w) => [w.key, w] as const))('«%s» passes AA on every ink', (key, base) => {
    // Asked through the real entry point rather than from the table, so
    // the derivation is what is being tested and not the constants.
    const world = worldOf({ id: `seed-${key}` , attributes: { world: base.accent } });
    for (const [what, fg, bg] of pairs(world)) {
      const ratio = contrastRatio(fg, bg);
      expect(ratio, `${key} — ${what}: ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(4.5);
    }
    expect(worldIsReadable(world), key).toBe(true);
  });

  /**
   * AND FOR A COLOUR NOBODY HAS SEEN YET.
   *
   * The seller types the colour; this product cannot know in advance
   * which one. Thirty-six hues at full and at half saturation, plus the
   * two cases that break a «pick ink or paper» rule: a mid-grey, where
   * BOTH are below AA (the curves cross at about 4.12:1), and a near-
   * white.
   */
  const SWEEP: string[] = [];
  for (let h = 0; h < 360; h += 10) {
    const f = (n: number) => {
      const k = (n + h / 30) % 12;
      const a = 0.5 * Math.min(1, Math.max(-1, Math.min(k - 3, 9 - k)));
      return Math.round((0.5 - a) * 255)
        .toString(16)
        .padStart(2, '0');
    };
    SWEEP.push(`#${f(0)}${f(8)}${f(4)}`);
  }
  SWEEP.push('#808080', '#767676', '#fdfdfd', '#010101', '#b4a37d');

  it.each(SWEEP)('and a seller’s own «%s» still comes out readable', (hex) => {
    const world = worldOf({ id: 'p-1', attributes: { لون: hex } });
    for (const [what, fg, bg] of pairs(world)) {
      const ratio = contrastRatio(fg, bg);
      expect(ratio, `${hex} — ${what}: ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe('where a world comes from', () => {
  it('the same product gets the same world, today and after a deploy', () => {
    // `Math.random` here would be a shop that changes colour between the
    // card and the page it opens.
    const once = worldOf({ id: 'abc-123' });
    const again = worldOf({ id: 'abc-123' });
    expect(again).toEqual(once);
  });

  it('and different products do not all get the same one', () => {
    const keys = new Set(
      Array.from({ length: 40 }, (_, i) => worldOf({ id: `product-${i}` }).key)
    );
    expect(keys.size, 'كل المنتجات بنفس العالم').toBeGreaterThan(3);
  });

  it('the owner’s own colour wins, and becomes the accent', () => {
    const world = worldOf({ id: 'p-1', attributes: { world: '#c2255c' } });
    expect(world.accent).toBe('#c2255c');
  });

  it('and it picks the world its hue belongs in', () => {
    // A green accent must not land on a wine background: the owner's
    // colour chooses, the curated world follows it.
    expect(worldOf({ id: 'p-1', attributes: { world: '#4f9c6b' } }).key).toBe('forest');
    expect(worldOf({ id: 'p-1', attributes: { world: '#7183d8' } }).key).toBe('night');
  });

  it('a colour nobody can read as a colour is no colour at all', () => {
    // «ذهبي» is true and unusable. The world falls back rather than
    // failing, which is the rule the whole family is built on.
    expect(namedColour({ world: 'ذهبي' })).toBeNull();
    expect(namedColour({ world: '#12345' })).toBeNull();
    expect(namedColour({ other: '#123456' })).toBeNull();
    expect(namedColour(null)).toBeNull();
    expect(namedColour({ 'لون': '#123456' })).toBe('#123456');
  });
});

describe('what a world writes on the page', () => {
  it('writes the shop’s own variable names, never a third family', () => {
    const vars = worldVars(worldOf({ id: 'p-1' }));
    for (const name of Object.keys(vars)) {
      expect(name.startsWith('--store-'), name).toBe(true);
      // `theme-isolation.test.ts` enforces this both ways; here it is
      // enforced at the source, where the names are decided.
      expect(name.startsWith('--sys-'), name).toBe(false);
    }
    expect(vars['--store-page']).toBeTruthy();
    expect(vars['--store-accent-text']).toBeTruthy();
  });

  /**
   * AND THE SAVING THAT SHAPE BOUGHT IS REAL.
   *
   * The first version emitted `--store-world-*` and then needed a rule
   * mapping them onto the shop's names for every element, plus a coloured
   * rule per element: 7.8 KB of family, 51.1 KB of sheet against a 50 KB
   * budget. Writing the shop's own names on the element instead means the
   * rules that already exist paint the world. If somebody puts the
   * mapping back, the budget test will fail — and this says why, next to
   * the decision.
   */
  it('so the brand slice names almost no colour of its own', () => {
    const css = repoFile('src/components/storefront/styles.ts');
    const brand = css.slice(css.indexOf('const BRAND_CSS = `'), css.indexOf('export const FAMILY_MINI_CSS'));
    expect(brand.length, 'شريحة «علامة» ما انلقت').toBeGreaterThan(1000);
    // No hex, no rgb(), no colour name — every colour arrives as a variable.
    expect(brand, 'لون مكتوب بالشريحة').not.toMatch(/#[0-9a-fA-F]{3,6}\b/);
    expect(brand, 'لون مكتوب بالشريحة').not.toMatch(/rgba?\(/);
  });

  it('and the hairline follows whichever ink won', () => {
    // A grey border works on a dark world and vanishes on a light one.
    // The border is the ink at low alpha, so it cannot do that.
    const world = worldOf({ id: 'p-1' });
    expect(world.border.startsWith(world.text)).toBe(true);
    expect(world.border.length).toBe(world.text.length + 2);
  });
});

/**
 * AND THE HALF THAT IS NOT BUILT IS WRITTEN DOWN RATHER THAN IMPLIED.
 *
 * §٢ asks for the background to be suggested FROM THE PRODUCT'S IMAGE.
 * That needs image decoding on the render path or a column to cache it
 * in, and both are decisions above an agent's pay grade. A reader of this
 * module must not have to guess whether it was forgotten.
 */
describe('what is deliberately not here', () => {
  it('says so, in the file, where somebody looking for it would look', () => {
    const src = repoFile('src/lib/store-world.ts');
    expect(src, 'الملف ما بيقول إنّ قراءة الصورة مش مبنيّة').toMatch(/NOT implemented/);
    expect(stripComments(src), 'الملف صار يفكّ ترميز صور').not.toMatch(/sharp|createCanvas|getImageData/);
  });

  it('and the open item is in the owner’s own document', () => {
    expect(repoFile('docs/storefront/FAMILIES.md')).toMatch(/ألوان من الصورة/);
  });
});
