import { describe, expect, it } from 'vitest';
import { repoFile, shopperFiles, stripComments, stripTemplates } from './guard-source';

/**
 * A SHOP READS IN THE DIRECTION ITS SELLER CHOSE.
 *
 * `StorefrontShell` renders `dir={store.dir}`, and `store.dir` is
 * `directionOf(store.language)` — so a shop selling in English is a
 * left-to-right page drawn by exactly the same components as an Arabic
 * one. Nothing in an Arabic preview will ever show a rule that breaks
 * there, which is why this is a guard and not a screenshot.
 *
 * The defect it was written for: the city search in `OrderForm` placed its
 * icon with `right-3` and reserved the room with `pr-9`. Both are correct
 * in Arabic and both are wrong in English — the icon lands on top of what
 * the shopper is typing — and the list of cities directly beneath it had
 * used `text-start` since the day it was written. One line was missed, and
 * no Arabic test could have found it.
 *
 * WHAT IS FORBIDDEN IS THE PHYSICAL FORM, NOT THE SIDE. `start`/`end`,
 * `ms`/`me`, `ps`/`pe`, `text-start`/`text-end`, `inset-inline-*` and
 * `margin-inline-*` all say which side relative to the reader, and they are
 * what these files should say.
 */

/** Tailwind utilities that name a side of the SCREEN rather than of the text. */
const PHYSICAL_UTILITY =
  /(?:^|["'\s`])(?:-?(?:m|p)(?:l|r)-[\w.[\]/-]+|-?(?:left|right)-[\w.[\]/-]+|text-(?:left|right)|float-(?:left|right)|border-(?:l|r)(?:-[\w.[\]/-]+)?|rounded-(?:l|r|tl|tr|bl|br)(?:-[\w.[\]/-]+)?)(?=["'\s`}]|$)/g;

/** The same mistake written as CSS, for the files that carry a stylesheet. */
const PHYSICAL_PROPERTY =
  /(?:^|[\s;{])(?:margin|padding|border)-(?:left|right)\s*:|(?:^|[\s;{])(?:left|right)\s*:|text-align\s*:\s*(?:left|right)|float\s*:\s*(?:left|right)/g;

/**
 * The one place a physical side is the RIGHT answer.
 *
 * `left: 50%` with `translateX(-50%)` centres an absolutely-positioned
 * element, and it does so identically in both directions — the logical
 * spelling would push it off-centre in one of them. It is centring, not
 * siding, and the comment above it in the source says so.
 */
const CENTRING = /left\s*:\s*50%/g;

const lines = (src: string, re: RegExp): string[] => {
  const out: string[] = [];
  src.split('\n').forEach((line, i) => {
    const hits = line.match(re);
    if (hits) out.push(`${i + 1}: ${hits.join(' ')} — ${line.trim().slice(0, 80)}`);
  });
  return out;
};

describe('a shopper’s page reads in both directions', () => {
  const files = shopperFiles('both');

  it('reads enough files to be worth believing', () => {
    // A walker that silently returns nothing is a guard that passes on an
    // empty set — which is how three guards in this repo stayed green
    // through the change that broke them.
    expect(files.length).toBeGreaterThan(20);
    expect(files.some((f) => f.rel.includes('/components/landing/OrderForm.tsx'))).toBe(true);
    expect(files.some((f) => f.rel.includes('/components/storefront/'))).toBe(true);
  });

  it('leaves the seller’s editor out — it is Arabic for everyone', () => {
    expect(files.some((f) => f.rel.includes('BlockBuilder.tsx'))).toBe(false);
  });

  it('names no side of the screen in a class a shopper’s page draws', () => {
    const offenders: string[] = [];
    for (const f of files) {
      const src = stripTemplates(stripComments(f.src));
      for (const hit of lines(src, PHYSICAL_UTILITY)) offenders.push(`${f.rel} ${hit}`);
    }
    expect(offenders).toEqual([]);
  });

  /**
   * ONLY THE FILES THAT ARE A STYLESHEET.
   *
   * `left` is also an ordinary word in JavaScript — `rect.left`,
   * `{ top, left }` from `getBoundingClientRect` — and a CSS rule read out
   * of a component file reports those as offences. The shop's CSS lives in
   * `styles.ts` modules, and that is the file this rule is about.
   */
  const sheets = files.filter((f) => /styles\.ts$|\.css$/.test(f.rel));

  it('finds the stylesheets it is supposed to read', () => {
    expect(sheets.length).toBeGreaterThan(0);
    expect(sheets.some((f) => f.rel.includes('/components/storefront/styles.ts'))).toBe(true);
  });

  it('nor in a stylesheet it ships, except to centre', () => {
    const offenders: string[] = [];
    for (const f of sheets) {
      const src = stripComments(f.src).replace(CENTRING, '');
      for (const hit of lines(src, PHYSICAL_PROPERTY)) offenders.push(`${f.rel} ${hit}`);
    }
    expect(offenders).toEqual([]);
  });

  /**
   * THE ORDER FORM TAKES ITS DIRECTION FROM ITS PAGE.
   *
   * Classes alone do not finish this: `OrderForm` set `dir="rtl"` on its
   * own root, so a shop that mirrored everywhere else had one block in the
   * middle of the product page still reading the other way — and no rule
   * about utilities could see it.
   *
   * The default stays `rtl` because every landing page that exists relies
   * on it. It is the SHOP that has to say which way it reads.
   */
  it('lets the page it is on say which way the order form reads', () => {
    const form = stripComments(repoFile('src/components/landing/OrderForm.tsx'));
    expect(form).toContain("dir = 'rtl'");
    expect(form).toContain('dir={dir}');
    // The thing it replaced must be gone, not merely outvoted.
    expect(form).not.toContain('dir="rtl"');
  });

  it('and the shop says it, rather than taking the landing page’s default', () => {
    const page = stripComments(repoFile('src/app/s/[store]/p/[sku]/page.tsx'));
    expect(page).toContain('dir={store.dir}');
  });

  it('the 404 is drawn inside the shop’s direction, and declares none itself', () => {
    const layout = stripComments(repoFile('src/app/s/[store]/layout.tsx'));
    // `store` is non-null below the `notFound()` guard, so there is no `?.`
    // here any more — the direction is the shop's, unconditionally.
    expect(layout).toContain('dir={store.dir}');
    expect(layout).toContain('lang={store.language}');
    // A box here would be a layout change hidden inside a direction fix.
    expect(layout).toContain("display: 'contents'");
    expect(stripComments(repoFile('src/components/storefront/ShopNotFound.tsx')))
      .not.toContain('dir="rtl"');
  });

  /**
   * The guard has to be able to SEE the thing it forbids, or every line
   * above is a test that an empty set is empty.
   */
  it('would have caught the line it was written for', () => {
    const was = '<Search className="absolute right-3 top-1/2 h-4 w-4" />';
    const now = '<Search className="absolute start-3 top-1/2 h-4 w-4" />';
    expect(was.match(PHYSICAL_UTILITY)).not.toBeNull();
    expect(now.match(PHYSICAL_UTILITY)).toBeNull();

    expect('className="px-4 py-3 pr-9 text-sm"'.match(PHYSICAL_UTILITY)).not.toBeNull();
    expect('className="px-4 py-3 ps-9 text-sm"'.match(PHYSICAL_UTILITY)).toBeNull();
  });

  it('and sees each physical form, not just the two that were found', () => {
    for (const bad of [
      'class="ml-2"', 'class="mr-2"', 'class="pl-4"', 'class="-ml-1"',
      'class="left-0"', 'class="right-4"', 'class="text-left"', 'class="text-right"',
      'class="float-left"', 'class="border-l"', 'class="border-r-2"',
      'class="rounded-l-lg"', 'class="rounded-tr-xl"',
    ]) {
      expect(bad.match(PHYSICAL_UTILITY), bad).not.toBeNull();
    }
  });

  it('and leaves every logical form alone', () => {
    for (const fine of [
      'class="ms-2"', 'class="me-2"', 'class="ps-4"', 'class="pe-4"',
      'class="start-0"', 'class="end-4"', 'class="text-start"', 'class="text-end"',
      'class="border-s"', 'class="rounded-s-lg"', 'class="rounded-e-xl"',
      // Words that merely CONTAIN a forbidden one.
      'class="scroll-pl"', 'class="overflow-x-auto"', 'class="translate-x-1"',
      'class="inset-inline-start"', 'class="grid-cols-2"',
    ]) {
      expect(fine.match(PHYSICAL_UTILITY), fine).toBeNull();
    }
  });

  it('reads the CSS form too, and lets a centring rule through', () => {
    expect('  margin-left: 4px;'.match(PHYSICAL_PROPERTY)).not.toBeNull();
    expect('  text-align: right;'.match(PHYSICAL_PROPERTY)).not.toBeNull();
    expect('  left: 0;'.match(PHYSICAL_PROPERTY)).not.toBeNull();
    expect('  margin-inline-start: 4px;'.match(PHYSICAL_PROPERTY)).toBeNull();
    expect('  text-align: center;'.match(PHYSICAL_PROPERTY)).toBeNull();
    expect('  left: 50%;'.replace(CENTRING, '').match(PHYSICAL_PROPERTY)).toBeNull();
    // And the exemption is for CENTRING, not for percentages. A rule
    // widened to any percentage lets `left: 25%` through, and no file
    // today contains one — so without this line the widening is invisible
    // until the day somebody writes the thing it was meant to forbid.
    expect('  left: 25%;'.replace(CENTRING, '').match(PHYSICAL_PROPERTY)).not.toBeNull();
    expect('  left: 0;'.replace(CENTRING, '').match(PHYSICAL_PROPERTY)).not.toBeNull();
  });
});
