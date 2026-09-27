import { describe, expect, it } from 'vitest';
import { repoFile, stripComments } from './guard-source';
import { DEFAULT_STORE_THEME, parseStoreTheme, storeHeaderSchema } from './store-theme';

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
    // Only when serving AS a store front — /lp/… keeps its own clothes.
    expect(src, 'كل صفحة هبوط تلبس ترويسة المتجر').toMatch(/const asFront = 'frontPageId' in target;/);
    expect(src).toMatch(/asFront &&[\s\S]{0,160}onFrontPage !== false/);
    // The switch is read from the STORE's template, never the page's
    // palette: a page may not decide whether it wears the shop.
    expect(src).toMatch(/parseStoreTheme\(lp\.store\?\.theme\)\.header\?\.onFrontPage/);
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
