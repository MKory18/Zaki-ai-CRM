/**
 * ═══════════════════════════════════════════════════════════════════════
 * THE SHOP SHIPPED THE WHOLE LANDING-PAGE STYLESHEET FOR THIRTEEN CLASSES.
 *
 * `SHOP_SHEET` is `BLOCK_CSS + STOREFRONT_CSS`, and measured on a built
 * page that is **47,831 bytes, of which 23,947 — almost exactly half — is
 * `BLOCK_CSS`**: the rules for the landing-page BLOCKS, the thirty-odd
 * sections a seller assembles in the page editor.
 *
 * A storefront page draws eighteen of those classes. Eighteen:
 *
 *     lp-root · lp-section · lp-hero · lp-h2 · lp-sub · lp-cta ·
 *     lp-trust · lp-catalog · lp-catalog-cats · lp-faq-item ·
 *     lp-form-section · lp-footer · lp-footer-phone ·
 *     lp-quiz-options · lp-quiz-option · lp-timeline · lp-timeline-what · lp-timeline-when
 *
 * Everything else in those 24 KB is a block a SHOP page has no way to
 * render — and every shopper on every product page was paying for all of
 * it, on a phone, before the first photograph.
 *
 * ── THIS IS THE RULE THE FILE NEXT DOOR ALREADY STATES ──
 *
 * `styles.ts` says it above `FAMILY_CSS`: «الشريحة تتبع الصفحة اللي
 * بترسمها» — the slice follows the page that draws it. Four families'
 * palettes are already split that way, and so is «علامة»'s product page.
 * The landing blocks were the one layer still shipping whole, and they
 * were the biggest.
 *
 * ── WHAT IS KEPT, AND WHY THE RULE IS WRITTEN THIS WAY ──
 *
 * A rule is kept when its selector names one of the thirteen, **or when it
 * names no `lp-` class at all**. The second half is the safety: a rule
 * like `:root { … }`, an element rule, a keyframe or a `@media` wrapper
 * carries no class to match on, and dropping those would take the
 * variables and the resets the kept rules stand on.
 *
 * A DESCENDANT of a kept class is kept with it — `.lp-hero .lp-badge`
 * mentions `lp-hero`, so it survives even though `lp-badge` is not in the
 * list. That is deliberate: the shop renders the container, and whatever
 * that container's own markup puts inside it must still be dressed.
 *
 * ⚠️ AND THE LIST IS NOT A GUESS. `a-shop-does-not-wear-the-whole-wardrobe
 * .test.ts` sweeps every storefront source for `lp-` class names and fails
 * if one is not covered here. Add a landing class to a shop component and
 * CI tells you to add it to this list — rather than the shopper finding an
 * unstyled section. «A guard that is a list is incomplete the day it is
 * written» is true of the list; it is not true of the sweep that checks it.
 * ═══════════════════════════════════════════════════════════════════════
 */

import { minifyCss } from '@/lib/css-minify';

/** The landing-page classes a storefront page can actually draw. */
export const SHOP_BLOCK_CLASSES = [
  'lp-root',
  'lp-section',
  'lp-hero',
  'lp-h2',
  'lp-sub',
  'lp-cta',
  'lp-trust',
  'lp-catalog',
  'lp-catalog-cats',
  'lp-faq-item',
  'lp-form-section',
  'lp-footer',
  'lp-footer-phone',
  /*
   * ── AND THE FOUR THE SWEEP CAUGHT, WHICH IS THE POINT OF IT ──
   *
   * «علامة»'s storefront sections draw the quiz and the timeline — blocks
   * written for the landing editor and reused by a shop page. Nobody
   * remembered to add them; the sweep in
   * `a-shop-does-not-wear-the-whole-wardrobe.test.ts` named all four
   * before a shopper could find them unstyled. That is why the list is
   * safe to write down: it is checked, not trusted.
   */
  'lp-quiz-options',
  'lp-quiz-option',
  'lp-timeline',
  'lp-timeline-what',
  'lp-timeline-when',
] as const;

/** Does this selector name a landing class the shop cannot draw? */
function selectorIsForeign(selector: string, keep: readonly string[]): boolean {
  const mentioned = selector.match(/\blp-[a-z0-9-]+/g);
  // No landing class at all — a `:root`, an element rule, a reset. Kept.
  if (!mentioned) return false;
  return !mentioned.some((cls) => keep.includes(cls));
}

/**
 * The part of a block stylesheet a shop page needs.
 *
 * A small depth-aware walk rather than a regex: an `@media` body holds
 * rules of its own, and a regex over braces mis-reads the first nested
 * one. An at-rule is kept only when something survived inside it, so an
 * empty `@media { }` never reaches the page.
 */
export function shopBlockSlice(css: string, keep: readonly string[] = SHOP_BLOCK_CLASSES): string {
  /*
   * ⚠️ COMMENTS COME OUT FIRST, AND BY THE PROJECT'S OWN MINIFIER.
   *
   * This is not a precaution; it is two bugs, found one after the other.
   *
   * The walk counts braces, and a comment in this stylesheet explains its
   * rules in prose — prose that contains braces. So every block after such
   * a comment was read at the wrong depth and whole runs of rules vanished
   * from the slice in silence.
   *
   * The obvious fix — a `/\*[\s\S]*?\*\/` of my own — was the second bug.
   * It left the tail of one comment behind and took the selector after it
   * with the rest: `.lp-quiz` became `e quiz -- three questions`, and the
   * quiz reached a shop page with no styling at all, five hundred lines
   * below the comment that caused it.
   *
   * `minifyCss` is this repository's one minifier, it already runs over
   * this very stylesheet on every page, and it gets this file right. Two
   * readers of the same CSS is how one of them is wrong about it — so
   * there is one. Running it twice costs nothing and is idempotent.
   */
  const source = minifyCss(css);
  const out: string[] = [];
  let i = 0;

  while (i < source.length) {
    const open = source.indexOf('{', i);
    if (open === -1) break;

    const head = source.slice(i, open).trim();

    // Find this block's matching close, counting nested braces.
    let depth = 1;
    let j = open + 1;
    while (j < source.length && depth > 0) {
      if (source[j] === '{') depth++;
      else if (source[j] === '}') depth--;
      j++;
    }
    const body = source.slice(open + 1, j - 1);
    i = j;

    if (head.startsWith('@')) {
      // `@keyframes` bodies are percentages, not selectors — they carry no
      // class and would all be read as foreign by the walk below, so they
      // are kept whole or not at all, on the at-rule's own name.
      if (/^@(keyframes|font-face|supports|layer|property)/.test(head)) {
        if (!selectorIsForeign(head, keep)) out.push(`${head}{${body}}`);
        continue;
      }
      const inner = shopBlockSlice(body, keep);
      if (inner.trim()) out.push(`${head}{${inner}}`);
      continue;
    }

    // A plain rule. Its head may list several selectors; keep the ones the
    // shop can reach rather than the whole list or none of it.
    const kept = head
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s && !selectorIsForeign(s, keep));
    if (kept.length) out.push(`${kept.join(',')}{${body}}`);
  }

  return out.join('\n');
}
