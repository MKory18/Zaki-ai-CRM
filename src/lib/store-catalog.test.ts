import { describe, expect, it } from 'vitest';
import { newSection, parseSections, SECTION_LABEL, SECTION_HINT, landingSectionsSchema } from './landing-sections';
import { repoFile, stripComments } from './guard-source';

/**
 * THE SHOP, WITH ITS OWN THINGS IN IT.
 *
 * Measured before any of this was built: the only live store on this
 * installation is Single Product, holds four landing pages, and had never
 * picked a front page. Its address rendered a bare product grid; the four
 * pages the seller had actually built — the ones with the offers and the
 * photos on them — were reachable only by their own links. And the design
 * screen refused the store outright for its type, so there was no way in
 * at all.
 *
 * What these hold down is the shape of the answer: ONE block library, ONE
 * builder, and a catalogue whose contents are read at render time rather
 * than copied into a section.
 */

describe('the catalog block', () => {
  it('is in the one library, with a name and a hint like every other block', () => {
    expect(SECTION_LABEL.catalog).toBeTruthy();
    expect(SECTION_HINT.catalog).toBeTruthy();
  });

  it('opens with pages, not products', () => {
    const s = newSection('catalog');
    expect(s.type).toBe('catalog');
    // A landing page is the one the seller built on purpose; it sells
    // better than a bare product card, so it is what a fresh block shows.
    expect(s).toMatchObject({ source: 'pages', columns: 3, cardSize: 'md' });
  });

  /**
   * THE ARRANGEMENT, NOT THE CONTENTS.
   *
   * No field here may hold ids. A list of pages ticked in the builder
   * would be a second place deciding what is in the shop, and it would be
   * wrong the first time a page was unpublished or a product paused.
   */
  it('carries no list of what to show', () => {
    const keys = Object.keys(newSection('catalog'));
    for (const banned of ['pageIds', 'productIds', 'items', 'ids']) {
      expect(keys, `الكتلة تحمل «${banned}»`).not.toContain(banned);
    }
  });

  it('refuses a column count nobody can read', () => {
    const bad = landingSectionsSchema.safeParse([{ ...newSection('catalog'), columns: 97 }]);
    expect(bad.success).toBe(false);
    const alsoBad = landingSectionsSchema.safeParse([{ ...newSection('catalog'), columns: 1 }]);
    expect(alsoBad.success).toBe(false);
  });

  /** A page live for a year must keep selling after a block is added. */
  it('and a stored page that predates it still parses', () => {
    const old = JSON.stringify([{ id: 'h', type: 'hero', enabled: true, headline: 'x', subheadline: '', image: '', showPrice: true, ctaText: 'اطلب' }]);
    expect(parseSections(old)).toHaveLength(1);
  });
});

describe('what fills it is read, never stored', () => {
  const lib = () => stripComments(repoFile('src/lib/storefront.ts'));

  it('a page is shown only if it says so AND is published', () => {
    // Two different things. Publishing is what makes a page exist for the
    // public; a campaign page is published and deliberately NOT in the
    // shop window. Either one alone must not put it there.
    expect(lib()).toMatch(/where: \{ companyId, storeId, showInStore: true, isPublished: true \}/);
  });

  it('and only this store’s things', () => {
    const src = lib();
    // The whole point of «كل متجر معزول». A query that forgot storeId
    // would put another shop's products in this shop's window.
    expect(src).toMatch(/storefrontCatalog\([\s\S]{0,400}storeId: string/);
    expect(src).toMatch(/storefrontProducts\(companyId, storeId\)/);
  });

  /**
   * THE CATEGORIES ARE DERIVED, NOT A SECOND TABLE.
   *
   * `Category` is already company-wide and already hangs off the product.
   * A store-scoped copy would be two tables answering «what kind of thing
   * is this», and they would disagree. A store shows the categories ITS
   * OWN products carry — which is «كل متجر وتصنيفاته» without a fork.
   */
  it('and the categories are the ones this store’s products carry', () => {
    const src = lib();
    expect(src).toMatch(/status: 'ACTIVE', categoryId: \{ not: null \}/);
    // No new model: the schema must not have grown a store-scoped one.
    const schema = repoFile('prisma/schema.prisma');
    expect(schema, 'ظهر جدولُ تصنيفاتٍ ثانٍ').not.toMatch(/model StoreCategory \{/);
  });

  it('and a shopper’s pictures are public ones', () => {
    // A shopper has no session; a privately-linked upload renders blank.
    expect(lib()).toMatch(/items: publicizeMedia\(items\)/);
  });
});

describe('the store front', () => {
  const front = () => stripComments(repoFile('src/app/s/[store]/page.tsx'));

  it('asks for the catalogue only when a block wants one', () => {
    // A home of a hero and a footer must not pay for two queries it never
    // renders.
    expect(front()).toMatch(/const wantsCatalog = home\.some\(\(b\) => b\.type === 'catalog'\)/);
    expect(front()).toMatch(/wantsCatalog\s*\?\s*await storefrontCatalog\(/);
  });

  /**
   * A PUBLISHED HOME WINS OVER A SINGLE-PRODUCT FRONT PAGE.
   *
   * Read before the single-product branch, because a seller who published
   * a shop home has said what their address should open. Until they
   * publish one, nothing changes — which is the promise that made this
   * safe to do at all.
   */
  it('prefers a published home, and only a published one', () => {
    const src = front();
    expect(src).toMatch(/const home = parseSections\(store\.homeLive\)/);
    expect(src, 'المسودّةُ تصل إلى الزبون').not.toMatch(/parseSections\(store\.homeDraft\)/);
    expect(src).toMatch(/store\.type === 'SINGLE_PRODUCT' && home\.length === 0/);
  });

  it('and the category a shopper picked is one this store has', () => {
    // Straight from the query string into a filter would let any string
    // through; it is checked against the derived list first.
    expect(front()).toMatch(/catalogue\?\.categories\.some\(\(c\) => c\.id === cat\)/);
  });
});

describe('the way in', () => {
  it('«صمّم الواجهة» opens the store’s own designer, not a landing page’s', () => {
    const src = stripComments(repoFile('src/components/screens/StorefrontsScreen.tsx'));
    // THE BUTTON THAT CARRIES THE LABEL, not any link to the designer:
    // the card has a second, plain-text one further down, and matching
    // that passed while the button itself had gone back to opening a
    // landing page's editor — the exact bug being fixed.
    expect(src).toMatch(
      /onClick=\{\(\) => onOpen\('\/store\/design'\)\}[\s\S]{0,400}صمّم واجهة المتجر\s*<\/button>/
    );
    // And it is no longer hidden behind having picked a front page —
    // which is why it was missing on every store here.
    const button = src.slice(src.indexOf('صمّم واجهة المتجر') - 700, src.indexOf('صمّم واجهة المتجر'));
    expect(button.length).toBeGreaterThan(200);
    expect(button, 'الزرُّ ما زال مشروطاً بوجود صفحة واجهة').not.toMatch(/\{shop\.frontPage && \($/m);
  });

  it('and the designer no longer turns a single-product store away', () => {
    for (const f of ['src/app/api/store/design/route.ts', 'src/components/screens/StoreDesignScreen.tsx']) {
      expect(stripComments(repoFile(f)), `${f} ما زال يرفض`).not.toMatch(/code: 'SINGLE_PRODUCT'/);
    }
    expect(stripComments(repoFile('src/components/screens/StoreDesignScreen.tsx'))).not.toMatch(
      /if \(data\.store\.singleProduct\) \{\s*return/
    );
  });

  it('and a landing page can be put in the shop window from its own row', () => {
    const src = stripComments(repoFile('src/components/screens/LandingPagesScreen.tsx'));
    expect(src).toMatch(/JSON\.stringify\(\{ showInStore: !lp\.showInStore \}\)/);
    expect(src).toMatch(/onClick=\{\(\) => toggleInStore\(lp\)\}/);
    // And the server takes it.
    expect(stripComments(repoFile('src/app/api/landing-pages/[id]/route.ts'))).toMatch(
      /if \(parsed\.data\.showInStore !== undefined\) data\.showInStore = parsed\.data\.showInStore;/
    );
  });
});
