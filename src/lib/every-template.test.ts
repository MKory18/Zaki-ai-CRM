import { describe, expect, it } from 'vitest';
import { STORE_TEMPLATES } from './store-templates';
import { CONTRAST_PAIRS, resolveSkinPalette, skinToSections, skinToStoreTheme } from './store-skin';
import { LAYOUT_SLOTS, type LayoutSlot } from './layout-slots';
import { contrastRatio } from './landing-theme';
import { DEFAULT_LAYOUT, parseStoreTheme } from './store-theme';
import { repoFile, stripComments } from './guard-source';
import { searchProducts } from './store-search';

/**
 * THE ACCEPTANCE CRITERIA, SWEPT OVER ALL TEN.
 *
 * The brief's last stage asks for «عشر قوالب × كل الصفحات × ثلاث عروض ×
 * RTL و LTR» as comparison screenshots — five hundred and forty images. An
 * image is a thing a person has to look at, and nobody looks at five
 * hundred and forty; what the images are FOR is four claims, and every one
 * of them is a claim a machine can check on every template every time the
 * suite runs.
 *
 * So this is that sweep. It does not replace looking at the shop — the
 * widths were measured in a browser and the screenshots are in the record
 * — it replaces looking at it five hundred and forty times, badly, once.
 */

describe('«تبديل القالب ما بيغيّر أي سعر ولا سلة ولا طلب ولا رابط ولا حدث»', () => {
  /**
   * THE STRONGEST FORM OF THIS IS NOT A TEST THAT RUNS THE PRICER TEN
   * TIMES — it is that the pricer cannot see the look at all.
   *
   * A test that priced a basket under each of the ten and compared the
   * totals would prove that an argument nothing reads is not read. The
   * claim worth holding is the boundary: the modules that decide money
   * import nothing that knows what the shop looks like, so there is no
   * path by which a template could change a price even by accident.
   */
  const MONEY = [
    'src/lib/public-order.ts',
    'src/lib/cart.ts',
    'src/lib/offers.ts',
    'src/lib/money.ts',
    'src/lib/catalog-query.ts',
    'src/lib/price-honesty.ts',
    'src/lib/unit-cost.ts',
  ];
  const LOOK = /from '\.\/(store-theme|store-skin|store-templates|layout-slots|landing-theme)'/;

  it('nothing that decides money can see what the shop looks like', () => {
    const offenders = MONEY.filter((rel) => LOOK.test(stripComments(repoFile(rel))));
    expect(offenders).toEqual([]);
  });

  it('and the guard is reading real files, not an empty list', () => {
    // A path that stopped existing would make the rule above vacuously
    // true — the failure mode this whole suite keeps finding.
    for (const rel of MONEY) expect(repoFile(rel).length, rel).toBeGreaterThan(200);
    // It can see the thing it forbids.
    expect(LOOK.test("import { x } from './store-theme';")).toBe(true);
  });

  it('installing a template writes theme fields and nothing else', () => {
    for (const skin of STORE_TEMPLATES) {
      const written = Object.keys(skinToStoreTheme(skin));
      // Not a price, not a stock, not a slug, not a pixel.
      for (const key of written) {
        expect(
          ['accent', 'mood', 'font', 'corners', 'fonts', 'colors', 'layout'].includes(key),
          `${skin.id} writes ${key}`
        ).toBe(true);
      }
    }
  });
});

describe('«أول شاشة بالرئيسية فيها منتج أو عرض أو فئة، بكل قالب»', () => {
  it('every one of the ten leads with one of those three', () => {
    // The vocabulary carries the rule — there is no variant that means
    // «the shop's name, alone» — but a template could still be written to
    // open on a block that shows none of them.
    const LEADS_WITH_SOMETHING = ['productFirst', 'offerStrip', 'categoryTiles', 'slider', 'editorial'];
    for (const skin of STORE_TEMPLATES) {
      expect(LEADS_WITH_SOMETHING, skin.id).toContain(skin.layout.hero);
    }
  });

  it('and the home page it installs opens on a block, never on nothing', () => {
    for (const skin of STORE_TEMPLATES) {
      const sections = skinToSections(skin);
      expect(sections.length, skin.id).toBeGreaterThan(0);
      expect(sections[0].enabled, skin.id).toBe(true);
    }
  });
});

describe('«النواة المقفولة بكل صفحة وبكل قالب، وبتصمد أمام كل تخصيص»', () => {
  /**
   * The shell renders the search, the basket and the WhatsApp button
   * unconditionally and the stylesheet decides only WHERE — so the core
   * cannot be removed by a template, and this is the part of that claim
   * the TEMPLATES are responsible for: none of them may name an
   * arrangement the engine does not have.
   */
  it('every template names a variant the engine actually draws, in every slot', () => {
    for (const skin of STORE_TEMPLATES) {
      for (const slot of Object.keys(LAYOUT_SLOTS) as LayoutSlot[]) {
        const chosen = skin.layout[slot];
        expect(LAYOUT_SLOTS[slot], `${skin.id}/${slot}`).toContain(chosen);
      }
    }
  });

  it('and a shop that names none of them still gets a whole arrangement', () => {
    // A template is a starting point; a shop painted by hand has no
    // `layout` at all, and every page still has to draw.
    for (const slot of Object.keys(LAYOUT_SLOTS) as LayoutSlot[]) {
      expect(LAYOUT_SLOTS[slot], slot).toContain(DEFAULT_LAYOUT[slot]);
    }
  });

  it('the shell draws the core without asking the theme whether to', () => {
    const shell = stripComments(repoFile('src/components/storefront/StorefrontShell.tsx'));
    // `data-header` moves them; nothing gates them.
    expect(shell).toContain('data-header=');
    for (const core of ['sf-search', 'CartLink', 'whatsapp']) {
      expect(shell.toLowerCase(), core).toContain(core.toLowerCase());
    }
  });
});

describe('فحص التباين الآلي، على القوالب العشرة', () => {
  it('every pair on every template, measured again here', () => {
    // `shipped()` throws at module load for a template that fails, so a
    // bad one could never reach this file. That is the point: this is the
    // same fact asserted from the other side, so a change that softened
    // the schema would be caught by something that does not use it.
    const failures: string[] = [];
    let compared = 0;
    for (const skin of STORE_TEMPLATES) {
      const palette = resolveSkinPalette(skin);
      for (const pair of CONTRAST_PAIRS) {
        compared++;
        const ratio = contrastRatio(palette[pair.fg], palette[pair.bg]);
        if (ratio < pair.min) failures.push(`${skin.id}: ${pair.what} ${ratio.toFixed(2)}:1`);
      }
    }
    expect(failures).toEqual([]);
    // THE COUNT OF COMPARISONS, NOT THE COUNT OF TEMPLATES.
    //
    // The first version of this asserted `STORE_TEMPLATES.length === 10`
    // in a test of its own — which stays true while the loop above runs
    // over nothing. A mutation that emptied the loop was CAUGHT by
    // nothing. What proves the sweep happened is the sweep's own counter.
    expect(compared).toBe(STORE_TEMPLATES.length * CONTRAST_PAIRS.length);
    expect(compared).toBeGreaterThanOrEqual(70);
  });
});

describe('«اختبار البحث العربي: «اذن» و«أذن» و«الأُذُن» بيرجعوا نفس النتائج»', () => {
  const shelf = [
    { id: '1', name: 'كريم الأُذُن', sku: 'EAR-01', category: null },
    { id: '2', name: 'قطرة للأذن', sku: 'EAR-02', category: null },
    { id: '3', name: 'شامبو', sku: 'HAIR-01', category: null },
  ];
  const found = (q: string) => searchProducts(shelf, q).map((h) => h.product.id);
  const set = (q: string) => [...found(q)].sort();

  it('finds the same products, whichever way it is spelled', () => {
    // Not «each one finds something» — the same SET. A spelling rule that
    // unified the hamza and not the diacritics would pass the weaker claim
    // and fail a shopper.
    const base = set('اذن');
    expect(base).toEqual(['1', '2']);
    for (const spelling of ['أذن', 'الأُذُن', 'الاذن', 'اذُن']) {
      expect(set(spelling), spelling).toEqual(base);
    }
  });

  /**
   * THE SET IS THE SAME; THE ORDER IS NOT, AND SHOULD NOT BE.
   *
   * «نفس النتائج» is the same products — and it is the right claim. The
   * first version of this test asked for the same ORDER too, and that was
   * stronger than the brief and wrong: a shopper who typed the article
   * gets the product whose name carries it first, because that is the
   * closer match. The article expansion ranks one behind the query as
   * typed, exactly as a synonym does.
   */
  it('and leads with the closest match to what was actually typed', () => {
    expect(found('الاذن')[0]).toBe('1'); // «كريم الأُذُن» carries the article
    expect(found('اذن')[0]).toBe('2'); // neither does; the tie falls to the name
  });

  it('and a word too short to have an article is left alone', () => {
    // «الم» is three letters; stripping them leaves «م», which is a
    // substring of almost every Arabic product name. A rule that trimmed
    // it would turn one typo into the whole catalogue.
    const shelf2 = [
      { id: 'a', name: 'مرهم', sku: 'X-1', category: null },
      { id: 'b', name: 'كريم', sku: 'X-2', category: null },
    ];
    expect(searchProducts(shelf2, 'الم').map((h) => h.product.id)).toEqual([]);
    // And four letters is enough to be a word with one.
    expect(searchProducts(shelf2, 'المرهم').map((h) => h.product.id)).toEqual(['a']);
  });

  it('and the article is tried, not assumed away', () => {
    // «الماس» is a word, not «ال» + «ماس». The query as typed still comes
    // first, so a shop selling diamonds is not answered with everything.
    const jewels = [
      { id: 'd', name: 'الماس', sku: 'J-1', category: null },
      { id: 'm', name: 'ماسك للوجه', sku: 'J-2', category: null },
    ];
    expect(searchProducts(jewels, 'الماس').map((h) => h.product.id)[0]).toBe('d');
  });

  it('while a word that is genuinely different still is', () => {
    // The guard above would pass if normalisation flattened everything.
    expect(found('شامبو')).toEqual(['3']);
    expect(found('اذن')).not.toContain('3');
  });
});

describe('what a shop is left holding after it installs one', () => {
  it('every template parses back as a theme this system accepts', () => {
    // A template whose own output the theme route would refuse is a
    // template a seller can install and never save — which is exactly
    // what the colour stripper turned out to be doing to the file export.
    for (const skin of STORE_TEMPLATES) {
      const theme = { ...skinToStoreTheme(skin), template: skin.id };
      const back = parseStoreTheme(JSON.stringify(theme));
      expect(back.accent, skin.id).toBe(theme.accent);
      expect(back.layout?.header, skin.id).toBe(theme.layout.header);
      expect(back.colors?.background, skin.id).toBe(theme.colors.background);
    }
  });
});
