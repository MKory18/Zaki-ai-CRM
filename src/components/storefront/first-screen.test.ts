import { describe, expect, it } from 'vitest';
import { LAYOUT_SLOTS } from '@/lib/store-skin';
import { repoFile, stripComments } from '@/lib/guard-source';

/**
 * THE FIRST SCREEN, AND THE WAY IN.
 *
 * The brief opens with four things this storefront got wrong, and two of
 * them were on one screen: «اسم المتجر مكرر ثلاث مرات بأول شاشة؛ البطل
 * ضايع على الاسم» and «أول شاشة ما فيها منتج ولا عرض ولا فئة».
 *
 * Measured: the front page's hero was `<h1>{store.tagline || store.name}</h1>`
 * — the shop's name, alone, under a header already carrying the name and
 * the tagline, with the name in the tab title too. Three tellings, and
 * nothing to buy above the fold.
 */

const front = () => stripComments(repoFile('src/app/s/[store]/page.tsx'));
const shell = () => stripComments(repoFile('src/components/storefront/StorefrontShell.tsx'));
const nav = () => stripComments(repoFile('src/components/storefront/CategoryNav.tsx'));
const css = () => repoFile('src/components/storefront/styles.ts');

describe('the first screen is not the shop’s name', () => {
  /**
   * The tagline stays when there IS one — it says what the shop sells,
   * which a name usually does not. The bare name never does.
   */
  it('never falls back to the bare name', () => {
    expect(front(), 'البطل يعرض اسم المتجر وحده').not.toMatch(/store\.tagline \|\| store\.name/);
    expect(front()).toMatch(/\{store\.tagline && \(/);
  });

  it('and leads with a way into the products', () => {
    expect(front()).toMatch(/<CategoryNav/);
    expect(front()).toMatch(/<ProductCard/);
  });

  /** The header already says the name once. A second telling sells nothing. */
  it('leaves the naming to the header', () => {
    expect(shell()).toMatch(/<strong>\{store\.name\}<\/strong>/);
  });
});

describe('the way in is one component', () => {
  it('the shelf writes no chips of its own', () => {
    const shelf = stripComments(repoFile('src/app/s/[store]/shop/page.tsx'));
    expect(shelf).toMatch(/<CategoryNav/);
    expect(shelf, 'شارات فئات مكتوبة بيدها').not.toMatch(/aria-label="الفئات"/);
  });

  /**
   * A shop whose products are all of a kind has nothing to narrow, and a
   * row with «الكل» and one chip beside it is a control that cannot
   * change anything.
   */
  it('draws nothing for a single category', () => {
    expect(nav()).toMatch(/if \(categories\.length < 2\) return null;/);
  });

  /**
   * LINKS, NEVER A CONTROL. Choosing a category is a page — bookmarkable,
   * sendable, behind the back button — and nothing waits for a script.
   * Even «dropdown» is a list styled to look like one; a real `<select>`
   * needs a script to navigate.
   */
  it('is links even where it looks like a menu', () => {
    expect(nav()).not.toMatch(/<select|useState|'use client'/);
    expect(css()).toMatch(/\.sf-cats\[data-nav='dropdown'\]/);
  });

  it.each(LAYOUT_SLOTS.categoryNav)('has an arrangement called «%s»', (variant) => {
    if (variant === 'chips') {
      // The plain one is the base rule, not an override.
      expect(css()).toMatch(/\.sf-cats \{/);
      return;
    }
    expect(css(), variant).toContain(`data-nav='${variant}'`);
  });

  it('and no arrangement hides the category’s name', () => {
    expect(css()).not.toMatch(/data-nav[^{]*\.sf-cat-name[^}]*display:\s*none/);
  });

  it('falls back to a letter when a category has no picture', () => {
    expect(nav()).toMatch(/\(c\.name \?\? ''\)\.trim\(\)\.charAt\(0\) \|\| '—'/);
  });
});

describe('the floating WhatsApp', () => {
  it('is there, and it is a button', () => {
    expect(shell()).toMatch(/className="sf-float-wa"/);
    expect(shell()).toMatch(/aria-label="تواصل عبر واتساب"/);
  });

  /**
   * «ما بيغطي الشريط السفلي». The offset is one variable both the button
   * and any bottom bar read, so the two cannot drift into each other — a
   * button covering «إتمام الطلب» costs a sale to save a tap.
   */
  it('sits clear of the bottom bar, by one shared measure', () => {
    const rule = css().slice(css().indexOf('.sf-float-wa {'), css().indexOf('}', css().indexOf('.sf-float-wa {')));
    expect(rule).toMatch(/var\(--store-bottom-bar\)/);
    expect(rule).toMatch(/env\(safe-area-inset-bottom/);
    expect(rule, 'مثبّت بالقاع بلا إزاحة').not.toMatch(/inset-block-end:\s*\d+px;/);
  });

  it('and the measure has a default, so nothing floats off the screen', () => {
    expect(css()).toMatch(/--store-bottom-bar:\s*0px/);
  });

  /**
   * It opens the shop's own link, built in the one place that builds it.
   *
   * Scoped to THIS element: the header has a WhatsApp link too, so a
   * guard that searched the whole file stayed green while the floating
   * one pointed at «#».
   */
  it('opens the link the header opens', () => {
    const body = shell();
    const at = body.indexOf('className="sf-float-wa"');
    expect(at).toBeGreaterThan(0);
    const element = body.slice(at, body.indexOf('/>', at));
    expect(element, 'الزرّ العائم يبني رابطه بنفسه').toMatch(/href=\{contact\.whatsapp\}/);
  });
});
