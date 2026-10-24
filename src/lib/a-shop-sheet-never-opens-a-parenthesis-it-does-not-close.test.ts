import { describe, expect, it } from 'vitest';
import { SHOP_SHEET } from '@/components/storefront/styles';
import { BLOCK_CSS } from '@/components/landing/blocks/styles';
import { shopBlockSlice } from '@/components/storefront/shop-block-slice';

/**
 * A SELECTOR WITH A `(` THAT NEVER CLOSES EATS THE REST OF THE STYLESHEET.
 *
 * The slice that trims the landing-block CSS for a shop split every rule head at EVERY comma, including the
 * ones inside `:is(.lp-cta, .lp-btn, .lp-sticky)`. It kept the pieces that named a class the shop draws and
 * glued them back: `html .lp-root :is(.lp-cta,.lp-btn{ … }`. A browser reads the open parenthesis as «the
 * selector goes on», so everything after it was ONE broken rule — the shop's own `.sf-*` sheet, appended
 * after the blocks, never applied. Measured on a built page: 62 rules parsed out of a 31,972-byte sheet, and
 * `.sf-header-inner { display: flex }` among the ones lost: the header, the cards and the grid drew unstyled.
 *
 * A test that greps for a selector cannot see this (the text IS there); the claim is that every rule head in
 * the sheet CLOSES what it opens.
 */

/** Every rule head in a stylesheet (the text before each `{`), at any depth. */
function heads(css: string): string[] {
  const out: string[] = [];
  let from = 0;
  for (let i = 0; i < css.length; i++) {
    if (css[i] === '{') {
      out.push(css.slice(from, i).trim());
      from = i + 1;
    } else if (css[i] === '}' || css[i] === ';') {
      from = i + 1;
    }
  }
  return out;
}

const balanced = (s: string) => {
  let paren = 0;
  let square = 0;
  for (const c of s) {
    if (c === '(') paren++;
    else if (c === ')') paren--;
    else if (c === '[') square++;
    else if (c === ']') square--;
    if (paren < 0 || square < 0) return false;
  }
  return paren === 0 && square === 0;
};

describe('the sheet a shop page is sent', () => {
  it('has no rule head with an unclosed parenthesis or bracket', () => {
    const broken = heads(SHOP_SHEET).filter((h) => !balanced(h));
    expect(broken.slice(0, 3), 'selector لا يُغلق ما فتحه').toEqual([]);
  });

  it('still carries the shop’s own header rule, after the landing blocks', () => {
    expect(SHOP_SHEET).toContain('.sf-header-inner');
    expect(SHOP_SHEET.indexOf('.sf-header-inner')).toBeGreaterThan(SHOP_SHEET.indexOf('.lp-root'));
  });
});

describe('the slice, on a selector list inside a function', () => {
  it('keeps `:is(.lp-cta, .lp-btn, .lp-sticky)` whole — the commas inside it are not separators', () => {
    const css = 'html .lp-root :is(.lp-cta, .lp-btn, .lp-sticky) { color: red; }';
    const out = shopBlockSlice(css, ['lp-root', 'lp-cta']);
    expect(out).toContain(':is(.lp-cta, .lp-btn, .lp-sticky)');
    expect(balanced(out)).toBe(true);
  });

  it('still splits a real selector list and keeps only the part the shop can reach', () => {
    const css = '.lp-hero, .lp-quiz-thing, .lp-cta { color: red; }';
    const out = shopBlockSlice(css, ['lp-hero', 'lp-cta']);
    expect(out.replace(/\s+/g, '')).toBe('.lp-hero,.lp-cta{color:red;}');
  });

  it('a list inside `:is()` with no class the shop draws is dropped, not left half-open', () => {
    const css = '.lp-reviews :is(.lp-a, .lp-b) { color: red; }';
    expect(shopBlockSlice(css, ['lp-cta'])).toBe('');
  });

  it('and `[attr="a,b"]` is one piece too', () => {
    const css = '.lp-cta[data-x="a,b"], .lp-hero { color: red; }';
    const out = shopBlockSlice(css, ['lp-cta']);
    expect(out).toContain('[data-x="a,b"]');
    expect(balanced(out)).toBe(true);
  });

  it('the source stylesheet itself has the rule that used to be cut', () => {
    // If this ever stops being true the guard above is guarding nothing.
    expect(BLOCK_CSS).toMatch(/:is\(\.lp-cta,\s*\.lp-btn,\s*\.lp-sticky\)/);
  });
});
