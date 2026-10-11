import { describe, expect, it } from 'vitest';
import { repoFile, stripComments } from './guard-source';
import { DEFAULT_STORE_THEME, parseStoreTheme, storeHeaderSchema, wearsShopChrome } from './store-theme';

/**
 * A SINGLE PRODUCT STORE'S FRONT PAGE IS THE SHOP, SO IT WEARS THE SHOP.
 *
 * Such a store's address renders its landing page, and it rendered it bare:
 * no logo, no shop name, no header, no menus, no footer. Everything the
 * seller set under «القوالب», and the logo they set under «البلدان
 * والمتاجر», appeared on no page they had — which is why the whole store
 * section read as dead to them («مش مربوط بتبويب المتجر و التصاميم ويت
 * البانر و الأيقونة»).
 *
 * The fix is the shop's own shell around the page, not a second builder:
 * the page is still designed in the landing editor, and the chrome is
 * still set in «القوالب». These guards hold that shape.
 */

describe('the shop’s chrome reaches its front page', () => {
  it('and it is a setting, on by default', () => {
    expect(storeHeaderSchema.parse({}).onFrontPage).toBe(true);
    expect(DEFAULT_STORE_THEME.header?.onFrontPage).toBe(true);
    // A seller who turns it off keeps it off through a save and a reload.
    const off = parseStoreTheme(JSON.stringify({ ...DEFAULT_STORE_THEME, header: { ...DEFAULT_STORE_THEME.header, onFrontPage: false } }));
    expect(off.header?.onFrontPage).toBe(false);
  });

  it('and the public renderer wraps the page in the real shell', () => {
    const src = stripComments(repoFile('src/components/landing/LandingPageView.tsx'));
    // The shop's own component, not a second header drawn here.
    expect(src).toMatch(/<StorefrontShell\s+store=\{shop\}/);
    expect(src).toMatch(/from '@\/components\/storefront\/StorefrontShell'/);
    /*
     * ASKED THROUGH THE ONE FUNCTION.
     *
     * This used to pin the condition as a spelling — `asFront && …
     * onFrontPage !== false` written out at the call site. The question
     * then grew a third answer (a page rendered INSIDE a shop screen that
     * has already drawn the shell) and a spelling cannot be given one. So
     * what is held down now is that the view asks `wearsShopChrome` and
     * hands it the four facts, each from the right place: the store's
     * template for the theme, and the TARGET for whether a shell is
     * already on the screen.
     */
    expect(src, 'العرضُ يقرّر بنفسه بدل أن يسأل').toMatch(/const wearsChrome = wearsShopChrome\(\{/);
    expect(src).toMatch(/asFront: 'frontPageId' in target/);
    expect(src).toMatch(/inStore: target\.inStore === true/);
    // The switch is read from the STORE's template, never the page's
    // palette: a page may not decide whether it wears the shop.
    expect(src).toMatch(/theme: parseStoreTheme\(lp\.store\?\.theme\)/);
  });

  /**
   * THE DECISION ITSELF, WITH NO FILE AROUND IT.
   *
   * Three situations, three answers, and the middle one is the only one
   * that was ever right by accident: the in-store case inherited `true`
   * from a default meant for front pages, which is how a product page
   * came to carry two headers.
   */
  it('and the rule has one answer for each of the three situations', () => {
    const theme = DEFAULT_STORE_THEME;

    // /lp/<slug> — an advert of its own. Its own clothes.
    expect(
      wearsShopChrome({ asFront: false, inStore: false, hasSlug: true, theme }),
      'صفحة الهبوط العامّة تلبس ترويسة المتجر'
    ).toBe(false);

    // A Single Product store's front — the store IS this page.
    expect(
      wearsShopChrome({ asFront: true, inStore: false, hasSlug: true, theme }),
      'واجهة المتجر رجعت عارية'
    ).toBe(true);

    // Inside a shop screen that already drew the shell.
    expect(
      wearsShopChrome({ asFront: true, inStore: true, hasSlug: true, theme }),
      'قشرة ثانية جوّا المتجر'
    ).toBe(false);
  });

  it('and «inside the shop» beats the seller’s front-page switch, both ways', () => {
    const on = DEFAULT_STORE_THEME;
    const off = parseStoreTheme(
      JSON.stringify({ ...DEFAULT_STORE_THEME, header: { ...DEFAULT_STORE_THEME.header, onFrontPage: false } })
    );
    /*
     * The flag answers «how should MY FRONT PAGE look». It is not an answer
     * about a page served inside a shop screen, and before `inStore` existed
     * the only way to get one header there was for the seller to strip their
     * own front page. Whether a shell is already on the screen is the
     * caller's fact; a setting must not be able to contradict it.
     */
    for (const theme of [on, off]) {
      expect(wearsShopChrome({ asFront: true, inStore: true, hasSlug: true, theme })).toBe(false);
    }
    // And the switch still decides the front page, which is its own job.
    expect(wearsShopChrome({ asFront: true, inStore: false, hasSlug: true, theme: off })).toBe(false);
  });

  it('and a store with no public address wears nothing — there is no shop to wear', () => {
    expect(
      wearsShopChrome({ asFront: true, inStore: false, hasSlug: false, theme: DEFAULT_STORE_THEME })
    ).toBe(false);
  });

  /**
   * AND NEVER TWO FOOTERS. A landing page carries a footer block of its
   * own in eleven of the fifteen templates; the shell's footer is left out
   * when the page already ends with one.
   */
  it('and the page’s own footer wins over the shop’s', () => {
    const view = stripComments(repoFile('src/components/landing/LandingPageView.tsx'));
    expect(view).toMatch(/footer=\{!sections\.some\(\(s\) => s\.type === 'footer'\)\}/);

    const shell = stripComments(repoFile('src/components/storefront/StorefrontShell.tsx'));
    // The shell honours it rather than always drawing.
    expect(shell).toMatch(/footer: showFooter = true/);
    expect(shell).toMatch(/\{showFooter && \(/);
  });

  it('and the seller can turn it off where the header is set', () => {
    const screen = stripComments(repoFile('src/components/screens/StoreThemeScreen.tsx'));
    expect(screen).toMatch(/onFrontPage: e\.target\.checked/);
    // Asked only of the store type that has the question at all.
    expect(screen).toMatch(/store\?\.type === 'SINGLE_PRODUCT' &&[\s\S]{0,400}onFrontPage/);
  });
});
