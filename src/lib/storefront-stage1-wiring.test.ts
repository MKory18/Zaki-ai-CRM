import { describe, expect, it } from 'vitest';
import { repoFile, stripComments } from './guard-source';

/**
 * STAGE 1 WIRING — READ, NEVER STORED.
 *
 * The catalogue rule itself is proved behaviourally in
 * storefront-stage1.test.ts. What is proved here is that the wires the
 * rule needs actually exist: the product page rendering its shown page,
 * the old address redirecting, the shared bar on every screen, and the
 * defaults that feed the rule.
 */

describe('the product page shows its shown page', () => {
  const src = () => stripComments(repoFile('src/app/s/[store]/p/[sku]/page.tsx'));

  it('renders the shown published page inside the store shell', () => {
    expect(src()).toMatch(/showInStore: true,[\s\S]{0,120}isPublished: true/);
    expect(src()).toMatch(/frontPageId: shownPage\.id, storeId: store\.id/);
    expect(src()).toContain('<LandingPageView');
    expect(src()).toContain('<StorefrontShell');
    /*
     * AND SAYS SO, so the page does not draw a second one. Counted as real
     * markup in `src/app/s/in-store-page-chrome.test.tsx`; what is held
     * here is that the word is on the wire at all.
     */
    expect(src(), 'الصفحة ما بتعرف إنّ القشرة مرسومة فوقها').toContain('inStore: true');
  });

  it('carries the ?c= attribution into the page', () => {
    expect(src()).toMatch(/campaign.*sp\.c|sp\.c.*campaign/);
  });

  it('keeps the old product rendering for products with no shown page', () => {
    expect(src()).toContain('sf-product');
    expect(src()).toContain('OrderForm');
  });
});

describe('the old single-product address', () => {
  it('redirects permanently to /store', () => {
    const src = stripComments(repoFile('next.config.ts'));
    expect(src).toMatch(/source: '\/store\/single-product', destination: '\/store', permanent: true/);
  });

  it('and the product page mounts nothing on it anymore', () => {
    const src = stripComments(repoFile('src/app/s/[store]/p/[sku]/page.tsx'));
    expect(src).not.toContain('/store/single-product');
  });
});

describe('every storefront screen names its store', () => {
  it('the store layout carries the one shared bar', () => {
    const src = stripComments(repoFile('src/app/(system)/(shell)/store/layout.tsx'));
    expect(src).toContain('<EditingStoreBar');
  });

  it('and the settings panel carries it too', () => {
    expect(stripComments(repoFile('src/components/settings/StorefrontSettings.tsx'))).toContain(
      '<EditingStoreBar'
    );
  });

  it('the bar switches through /api/context and reloads', () => {
    const src = stripComments(repoFile('src/components/shell/EditingStoreBar.tsx'));
    expect(src).toMatch(/apiJson\('\/api\/context', \{[\s\S]{0,200}storeId: id/);
    expect(src).toContain('window.location.reload()');
    expect(src).toContain('عم تعدّل:');
  });
});

describe('the defaults that feed the rule', () => {
  /**
   * THIS USED TO PIN THE BUG.
   *
   * It read «a new page with a product is shown; without one it is not»
   * and held down `showInStore: !!productId` — which is exactly the hole
   * in the owner's rule ①: the first new page with a product switched the
   * whole store with no press, and the shop came back showing one thing.
   * A guard can be green about a defect; this one was.
   *
   * What replaces it is behavioural, in
   * `only-the-press-switches-the-store.test.ts`, which asks the route for
   * both answers. What stays here is the wire that press needs.
   */
  it('and the one press is a single update, so the shop is never empty between', () => {
    const src = stripComments(repoFile('src/app/api/landing-pages/show-all/route.ts'));
    expect(src).toMatch(/updateMany\(\{/);
    expect(src).toMatch(/where: \{ companyId, storeId, isPublished: true, showInStore: false \}/);
    expect(src).toMatch(/data: \{ showInStore: true \}/);
  });

  it('the registry opens with /store and drops the redirected address', () => {
    const src = stripComments(repoFile('src/lib/route-registry.ts'));
    expect(src).toContain("r('/store', 'المتجر'");
    expect(src).not.toContain('/store/single-product');
  });

  it('new stores are multi-product, with no single-product option', () => {
    const src = stripComments(repoFile('src/components/screens/GeoSettingsScreen.tsx'));
    expect(src).not.toContain('SINGLE_PRODUCT');
  });

  it('the settings panel edits nothing twice — one link to /store', () => {
    const src = stripComments(repoFile('src/components/settings/StorefrontSettings.tsx'));
    expect(src).not.toMatch(/storefrontEnabled: enabled/);
    expect(src).not.toContain('نوع المتجر');
    expect(src).toContain('href="/store"');
  });
});
