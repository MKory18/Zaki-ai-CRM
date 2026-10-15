import { describe, expect, it } from 'vitest';
import { stripComments } from '@/lib/guard-source';
import { SELLING_FAMILIES, DEFAULT_FAMILY, FAMILY_OF_TEMPLATE, type SellingFamily } from '@/lib/selling-blocks';
import { BLOCK_CSS } from './styles';

/**
 * THE THREE FAMILIES ARE A LOOK — AND A LOOK HAS TWO THINGS IT MAY NOT DO.
 *
 * «المظهر ما بيغيّر ترتيب شي رتّبه إنسان» and «الزينة بتقعد عند باب، أو على
 * حالة فاضية، أو على ترويسة قسم، أو على كرت ترحيب — أبداً مش ورا رقم ولا سعر
 * ولا مبلغ». Both are rulings about every look in this system, and a
 * stylesheet is exactly where they get broken quietly: one `order: -1` in a
 * family rule and the seller's arrangement is somebody else's, on one of
 * three looks, on the pages that take the money.
 *
 * So they are read off the stylesheet itself. The rules below are not about
 * taste — nothing here says a family must be beautiful — they are the two
 * properties a family must not have, plus «it must actually be three
 * different looks» so the guard cannot be satisfied by shipping nothing.
 *
 * COMMENTS ARE STRIPPED FIRST. The section's own documentation names every
 * property it forbids, which is the whole point of writing it down, and a
 * guard that reads its own prose fails on itself.
 */

/** The stylesheet with its comments blanked, line count preserved. */
const css = () => stripComments(BLOCK_CSS);

/**
 * THE FOUR, SINCE «علامة» WAS DRAWN.
 *
 * This was the three of `AUDIT.md` §7.2, with the note that the owner's
 * fourth family was «not the whole list» and the test below holding that
 * an undrawn id must be an unreachable one. The storefront branch then
 * shipped `alama` as a template and gave `brand` a look in this
 * stylesheet, so the list is four and the bargain is kept the other way
 * round: every id a template can reach is an id with a look.
 */
const DRAWN: SellingFamily[] = ['clinic', 'herbal', 'trend', 'brand'];

/**
 * Every rule whose selector mentions a family, as `[selector, body]`.
 *
 * Split on `}` and taken pairwise rather than parsed: this file reads one
 * stylesheet it ships beside, not arbitrary CSS, and a dependency on a CSS
 * parser for six blocks of rules would be a dependency to keep current.
 */
function familyRules(): { selector: string; body: string }[] {
  const out: { selector: string; body: string }[] = [];
  for (const chunk of css().split('}')) {
    const at = chunk.indexOf('{');
    if (at < 0) continue;
    const selector = chunk.slice(0, at).trim();
    if (!selector.includes('[data-family=')) continue;
    out.push({ selector, body: chunk.slice(at + 1) });
  }
  return out;
}

describe('the three families', () => {
  /**
   * A FAMILY WITH NO RULES IS A NAME IN A LIST — the exact failure
   * `layout-slots.ts` documents at length for the thirteen dead variants:
   * «a name with nothing behind it renders the default and tells nobody».
   */
  it('each have a look in the stylesheet', () => {
    const rules = familyRules();
    for (const family of DRAWN) {
      const mine = rules.filter((r) => r.selector.includes(`[data-family='${family}']`));
      expect(mine.length, `العائلة «${family}» اسم بلا مظهر`).toBeGreaterThan(2);
    }
  });

  /**
   * AND A FAMILY THIS STAGE HAS NOT DRAWN IS ONE IT CANNOT SELECT.
   *
   * The rule, unchanged, and now satisfied from the other side: an id
   * WITHOUT a look must be an id `familyOf` can never return — the same
   * bargain `layout-slots.ts` strikes with a retired variant: never
   * silent, and never a name a shop can be wearing with nothing behind
   * it.
   *
   * When this was written «علامة» was the undrawn one and no template
   * reached it. The storefront branch drew it and mapped `alama` to it,
   * so today there is no undrawn family at all — and the assertion is
   * kept rather than deleted, because it is the one that fails the day
   * somebody adds a fifth id to `LANDING_FAMILIES` and a template that
   * reaches it.
   */
  it('and a family this stage has not drawn is one it cannot select', () => {
    const undrawn = SELLING_FAMILIES.filter((f) => !DRAWN.includes(f));
    expect(undrawn, 'عائلةٌ بلا مظهرٍ وبلا سببٍ مكتوب').toEqual([]);
    for (const family of undrawn) {
      const reachable = Object.values(FAMILY_OF_TEMPLATE).includes(family);
      expect(reachable, `قالبٌ بيوصل لعائلة «${family}» وما إلها مظهر`).toBe(false);
    }
  });

  /**
   * AND THEY ARE THREE LOOKS, NOT ONE LOOK WITH THREE NAMES.
   *
   * The failure this guards against is the one §5 of the audit measured on
   * the ten skins: «why the ten skins look alike — the measured answer».
   * Three families that differ in nothing a shopper can see would be that
   * finding, repeated, on the blocks that sell.
   */
  it('and no two of them are the same set of declarations', () => {
    const shape = (family: string) =>
      familyRules()
        .filter((r) => r.selector.includes(`[data-family='${family}']`))
        .map((r) => r.body.replace(/\s+/g, ''))
        .sort()
        .join('|');
    const shapes = DRAWN.map(shape);
    expect(new Set(shapes).size, 'عائلتان بنفس المظهر').toBe(DRAWN.length);
  });

  /**
   * THE FIRST RULING: A LOOK NEVER MOVES ANYTHING ANYBODY ARRANGED.
   *
   * `order` and the reverse directions move elements; `direction` mirrors
   * the whole page and belongs to the shop's language (`directionOf`) and
   * to nothing else; `grid-template-areas` re-seats named cells. Any of
   * them inside a family rule is a look rearranging a seller's page.
   */
  it('move nothing: no order, no reverse, no direction, no re-seating', () => {
    const forbidden = /(^|[;{\s])(order\s*:|flex-flow\s*:|direction\s*:|grid-template-areas\s*:)|row-reverse|column-reverse|wrap-reverse/;
    const offenders = familyRules()
      .filter((r) => forbidden.test(r.body))
      .map((r) => r.selector);
    expect(offenders, 'مظهرٌ بيحرّك ترتيب الأقسام').toEqual([]);
  });

  /**
   * THE SECOND RULING: NO DECORATION BEHIND A FIGURE.
   *
   * Ornament may sit at a door, on an empty state, on a section header or
   * on a welcome card. A price, a saving, a remaining count and a clock are
   * none of those: a shopper reads them to decide, and anything drawn
   * through or behind them is in the way of the one thing on the page that
   * has to be unambiguous.
   *
   * A FLAT SURFACE COLOUR IS NOT DECORATION. `background: var(--store-accent)`
   * under a clock is a surface; `background-image`, `content`, a mask, a
   * filter, a shadow on the glyphs or a transparency is a picture to read
   * the number through. The list below is the second kind.
   */
  it('put no ornament behind a price, a count or a clock', () => {
    const FIGURES = ['.lp-price', '.lp-offer-price', '.lp-countdown', '.lp-stock', '.lp-sticky b', '.lp-offer-unit'];
    const ORNAMENT = /(^|[;{\s])(content\s*:|background-image\s*:|mask[\w-]*\s*:|filter\s*:|backdrop-filter\s*:|text-shadow\s*:|opacity\s*:)/;
    const offenders: string[] = [];
    for (const rule of familyRules()) {
      if (!FIGURES.some((f) => rule.selector.includes(f))) continue;
      if (ORNAMENT.test(rule.body)) offenders.push(rule.selector);
    }
    expect(offenders, 'زينة ورا رقم أو سعر أو مبلغ').toEqual([]);
  });

  /**
   * AND NO FAMILY NAMES A TYPEFACE.
   *
   * §7.2 gives each family two faces and they are not in this repository.
   * A `font-family` written here would either name a face nobody serves —
   * so the browser falls back and the family silently loses half its
   * identity — or send the build to fetch one, which the house rule
   * forbids. Weight, size and rhythm are this stage's; the faces land with
   * the font work.
   */
  it('and name no typeface they cannot serve', () => {
    const offenders = familyRules()
      .filter((r) => /font-family\s*:/.test(r.body))
      .map((r) => r.selector);
    expect(offenders, 'عائلة بتسمّي خطّاً مش موجوداً بالريبو').toEqual([]);
  });

  /**
   * THE DEFAULT IS DRAWN TOO.
   *
   * A shop that wore no template is the commonest shop on this system, and
   * `familyOf` answers `DEFAULT_FAMILY` for it. If that family happened to
   * be the one with no rules, every hand-painted shop would get the look
   * nobody wrote.
   */
  it('and the one a shop with no template wears is among them', () => {
    expect(DRAWN).toContain(DEFAULT_FAMILY);
  });
});
