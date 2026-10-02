import { describe, expect, it } from 'vitest';
import { minifyCss } from './css-minify';
import { BLOCK_CSS } from '@/components/landing/blocks/styles';
import { STOREFRONT_CSS } from '@/components/storefront/styles';

/**
 * A STRIPPER THAT CANNOT TELL A COMMENT FROM A STRING DELETES LIVE CSS.
 *
 * The regex version of this was written first, and a check of its own
 * assumption killed it before it shipped: sixteen strings in the shop's
 * stylesheet contain the characters `/*`. Most are inside prose — an
 * apostrophe in English text pairs with the next one and swallows whatever
 * sits between them — but a stripper has no way to know that, and the one
 * that is real is enough.
 */

describe('what the shopper does not need to download', () => {
  it('removes a comment', () => {
    expect(minifyCss('.a { color: red; } /* why red */ .b { color: blue; }'))
      .toBe('.a { color: red; } .b { color: blue; }');
  });

  it('leaves a space where the comment was — `a/**/b` is two tokens', () => {
    expect(minifyCss('a/* x */b')).toBe('a b');
  });

  it('collapses indentation to one space, and never to none', () => {
    expect(minifyCss('.a\n  .b {\n    color : red;\n}')).toBe('.a .b { color : red; }');
  });

  it('keeps a comment opener that is inside a string', () => {
    expect(minifyCss(`.a::after { content: '/* not a comment */'; }`))
      .toBe(`.a::after { content: '/* not a comment */'; }`);
  });

  it('keeps an apostrophe-heavy sentence from eating the rule after it', () => {
    // This is the shape that actually occurs: prose with two apostrophes,
    // and a real rule between them.
    const css = `/* the shop's own colour, the seller's choice */\n.a { color: red; }`;
    expect(minifyCss(css)).toBe('.a { color: red; }');
  });

  it('keeps a brace inside a string', () => {
    expect(minifyCss(`.a::before { content: "}"; } .b { color: red; }`))
      .toBe(`.a::before { content: "}"; } .b { color: red; }`);
  });

  it('keeps an escaped quote inside a string', () => {
    expect(minifyCss(`.a::before { content: "a\\"b"; }`)).toBe(`.a::before { content: "a\\"b"; }`);
  });

  it('keeps an unquoted url intact, whitespace and all', () => {
    expect(minifyCss(`.a { background: url(/a/b c.png); }`))
      .toBe(`.a { background: url(/a/b c.png); }`);
  });

  it('rewrites no selector and drops no semicolon', () => {
    const css = '.a > .b , .c:hover { color : red ; }';
    const out = minifyCss(css);
    expect(out).toContain('>');
    expect(out).toContain(';');
    expect(out).toBe('.a > .b , .c:hover { color : red ; }');
  });

  it('leaves an unterminated comment swallowing the rest, as a browser does', () => {
    expect(minifyCss('.a { color: red; } /* oops')).toBe('.a { color: red; }');
  });

  it('is idempotent — running it twice changes nothing more', () => {
    const once = minifyCss(BLOCK_CSS);
    expect(minifyCss(once)).toBe(once);
  });
});

describe('what it does to the shop’s real stylesheet', () => {
  const full = BLOCK_CSS + STOREFRONT_CSS;
  const small = minifyCss(full);
  const kb = (s: string) => Buffer.byteLength(s, 'utf8') / 1024;

  it('brings the shop under the budget it is held to', () => {
    // «CSS أقل من 50 كيلوبايت». It was 51.7 as written.
    expect(kb(full)).toBeGreaterThan(50);
    expect(kb(small)).toBeLessThan(50);
  });

  it('and the saving is the prose, not a rule', () => {
    // Every selector and every declaration that was there is still there.
    const braces = (s: string) => (s.match(/\{/g) ?? []).length;
    const semis = (s: string) => (s.match(/;/g) ?? []).length;
    expect(braces(small)).toBe(braces(full.replace(/\/\*[\s\S]*?\*\//g, '')));
    expect(semis(small)).toBe(semis(full.replace(/\/\*[\s\S]*?\*\//g, '')));
  });

  it('keeps the rules a shop cannot open without', () => {
    // Whitespace was collapsed rather than deleted, so both sides are
    // compared with it taken out — a presence check, nothing cleverer.
    const bare = (s: string) => s.replace(/\s+/g, '');
    const flat = bare(small);
    for (const must of [
      '.lp-root', '.lp-footer', '.lp-section', '.lp-h2', '.lp-sub',
      '.sf-card-img', '.sf-header', '@font-face', 'aspect-ratio:',
      'font-display:swap', '--store-accent',
    ]) {
      expect(flat.includes(bare(must)), must).toBe(true);
    }
  });

  it('declares no comment to a shopper at all', () => {
    expect(small).not.toContain('/*');
    expect(small).not.toContain('*/');
  });
});
