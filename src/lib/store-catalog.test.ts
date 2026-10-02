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

/**
 * HOW THE SHOP LOOKS, where looking wrong is a thing that can happen in
 * silence. Not every pixel — the rules a later edit could quietly undo.
 */
describe('the shop’s face', () => {
  const sheet = () => repoFile('src/components/storefront/styles.ts');
  const blocks = () => repoFile('src/components/landing/blocks/styles.ts');

  // A backtick inside either stylesheet ends its template literal and the
  // build stops — it happened twice writing this. No guard for it: `tsc`
  // says so immediately and unambiguously, and a second check that only
  // repeats the compiler is noise that can itself be wrong. The first
  // version of it was.

  /**
   * A shop's language is the seller's choice, and half of them read left
   * to right. `inset-inline-start: 50%` with a positive translateX centres
   * in RTL and pushes off-centre in LTR — the underline under every
   * section heading floated to one side in every English shop.
   */
  it('centring is physical, so it centres in both directions', () => {
    expect(sheet()).not.toMatch(/inset-inline-start: 50%;[\s\S]{0,80}translateX\(50%\)/);
  });

  it('the catalogue card and the plain grid card are the same object', () => {
    // The plain grid is what a shop shows before its seller builds a home
    // page — most shops, most of the time. Left behind while the block
    // was restyled, one product would have had two shops.
    for (const [name, sel] of [['catalogue', blocks()], ['grid', sheet()]] as const) {
      expect(sel, `${name}: بلا ارتفاعٍ عند اللمس`).toMatch(/transform: translateY\(-4px\)/);
      expect(sel, `${name}: بلا إطارٍ رفيع`).toMatch(/0 0 0 1px color-mix/);
      expect(sel, `${name}: الصورةُ لا تقترب`).toMatch(/transform: scale\(1\.055\)/);
    }
  });

  /**
   * A NEW SHOP HAS NO PHOTOGRAPHS. Measured: one of this store's twenty
   * products had one. Twenty flat grey squares was the whole page, and it
   * read as broken rather than as new.
   */
  it('a product with no picture gets its initial, not a grey square', () => {
    expect(blocks()).toMatch(/content: attr\(data-letter\)/);
    expect(sheet()).toMatch(/content: attr\(data-letter\)/);
    const page = stripComments(repoFile('src/components/landing/blocks/PageBlocks.tsx'));
    // `?? ''` and not a bare `.trim()`: one row with a null name took the
    // whole shop page down with «Cannot read properties of undefined».
    expect(page).toMatch(/data-letter=\{\(it\.name \?\? ''\)\.trim\(\)\.charAt\(0\)/);
    /**
     * The storefront's card moved into `ProductCard` — it was written by
     * hand in four places and three of them had already lost something.
     * The rule did not move: the initial, and the `?? ''` under it.
     */
    const card = stripComments(repoFile('src/components/storefront/ProductCard.tsx'));
    expect(card).toMatch(/data-letter=\{letter\}/);
    expect(card).toMatch(/\(product\.name \?\? ''\)\.trim\(\)\.charAt\(0\)/);

    /** And no page draws one of its own beside it. */
    for (const page of [
      'src/app/s/[store]/page.tsx',
      'src/app/s/[store]/shop/page.tsx',
      'src/components/storefront/RecentlyViewed.tsx',
    ]) {
      expect(stripComments(repoFile(page)), page).not.toMatch(/className="sf-card"/);
    }
  });

  it('and a shop with no logo still has a mark', () => {
    const shell = stripComments(repoFile('src/components/storefront/StorefrontShell.tsx'));
    expect(shell).toMatch(/<span className="sf-mark" aria-hidden>\{store\.name\.trim\(\)\.charAt\(0\)\}<\/span>/);
    expect(sheet()).toMatch(/\.sf-mark \{/);
  });

  /** A shop is not an article: 760px is three cramped columns. */
  it('the goods get more width than a page of prose', () => {
    expect(sheet()).toMatch(/:has\(> \.lp-catalog\)[\s\S]{0,200}max-width: 1180px/);
  });

  it('and the shop’s own colour paints all of it — no hex is written here', () => {
    // One colour picker restyles the whole shop. A literal would be the
    // one thing that did not move with it.
    const css = sheet();
    const hexes = css.match(/#[0-9a-fA-F]{3,8}/g) ?? [];
    // `#fff` as a fallback for accent-text is the only one allowed: it is
    // what a colour lands on, not a colour of the shop's.
    expect(hexes.filter((h) => h.toLowerCase() !== '#fff')).toEqual([]);
    /**
     * AND THE EXPRESSION ACTUALLY MATCHES SOMETHING.
     *
     * This line once ended in a word-boundary escape that the shell
     * heredoc writing it turned into a literal backspace byte. The regex
     * then demanded a backspace after every colour, matched nothing at
     * all, and the guard passed happily on a stylesheet with a hex in it.
     * A filter over an empty list is always empty; only the mutation run
     * found it.
     */
    expect(hexes.length, 'التعبير لا يلتقط شيئاً — الحارسُ فارغ').toBeGreaterThan(0);
  });
});

describe('a price of zero is not a price', () => {
  /**
   * A landing page whose product carries no base price rendered «0 USD»
   * under its card, which reads as free. Nothing is the honest answer,
   * and `!== null` alone never said so.
   */
  it('shows nothing rather than a zero', () => {
    const src = stripComments(repoFile('src/components/landing/blocks/PageBlocks.tsx'));
    expect(src).toMatch(/s\.showPrice && it\.price !== null && it\.price > 0 &&/);
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
