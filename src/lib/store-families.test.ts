import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FAMILY,
  FAMILY_IDS,
  SKIN_FAMILY,
  STORE_FAMILIES,
  familyById,
  familyNoteAr,
  familyOfSkin,
  isGalleryVoice,
  voicesOf,
} from './store-families';
import { STORE_TEMPLATES, templateById } from './store-templates';
import { LAYOUT_SLOTS } from './layout-slots';
import { TEMPLATE_FONT_KEYS } from './store-skin';
import { DEFAULT_STORE_THEME, familyOf, layoutOf, parseStoreTheme } from './store-theme';
import { repoFile, stripComments } from './guard-source';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * FOUR FAMILIES, AND A SHOPPER CAN TELL THEM APART.
 *
 * `AUDIT.md` §5 measured the ten templates and found one shop in ten
 * palettes: the same header, the same first screen, the same card. §7.2
 * answered with three families — «عيادة» · «عطّار» · «ترند» — and the
 * owner added a fourth, «علامة», on 15/10.
 *
 * What this file holds is the half that can be checked without a browser:
 * that the four really differ in the engine's own vocabulary, that every
 * one of the ten skins has exactly one home, that the four hidden ones are
 * hidden and not deleted and not silent, and that a family reaches a page
 * at all.
 *
 * THE LOOK-NOT-ARRANGEMENT RULING has its own file —
 * `store-family-arrangement.test.ts` — because it is a different claim
 * about a different thing, and a promise checked in two places is a
 * promise that gets edited in one of them.
 * ═══════════════════════════════════════════════════════════════════════
 */

describe('the four families', () => {
  it('are four, and each one says who it is for', () => {
    expect(STORE_FAMILIES.length, 'العائلات صارت غير أربع').toBe(4);
    expect(STORE_FAMILIES.map((f) => f.id)).toEqual([...FAMILY_IDS]);
    for (const f of STORE_FAMILIES) {
      expect(f.name.length, f.id).toBeGreaterThan(2);
      // The one line a seller reads under the name in the gallery. A
      // family with no sentence is a heading with nothing behind it.
      expect(f.line.length, `${f.id}: بلا سطر`).toBeGreaterThan(20);
      expect(f.suggestedFor.length, f.id).toBeGreaterThan(5);
      expect(f.imagery.length, `${f.id}: بلا دليل تصوير`).toBeGreaterThan(10);
    }
  });

  /**
   * «ثلاث مظاهر يقدر الزبون يفرّق بينها بنظرة — مش تبديل ألوان». The
   * measurable form of that: no two families may choose the same header,
   * the same first screen AND the same card. It is the rule
   * `store-templates.test.ts` already holds for the ten skins, one level
   * up — and up here it matters more, because the family is what a
   * seller is actually choosing between.
   */
  it('no two of them are the same shop in different colours', () => {
    const shapes = STORE_FAMILIES.map((f) => `${f.layout.header}/${f.layout.hero}/${f.layout.productCard}`);
    expect(new Set(shapes).size, shapes.join(' | ')).toBe(shapes.length);
  });

  it('and not one of them shares a first screen with another', () => {
    const heroes = STORE_FAMILIES.map((f) => f.layout.hero);
    expect(new Set(heroes).size, heroes.join('، ')).toBe(heroes.length);
  });

  it('every part each one names is a part the engine has', () => {
    for (const f of STORE_FAMILIES) {
      for (const [slot, variant] of Object.entries(f.layout)) {
        expect(
          LAYOUT_SLOTS[slot as keyof typeof LAYOUT_SLOTS] as readonly string[],
          `${f.id}.${slot} = ${variant} — ليس من كتالوج القطع`
        ).toContain(variant);
      }
    }
  });

  it('and every face it names is one we may publish', () => {
    for (const f of STORE_FAMILIES) {
      expect(TEMPLATE_FONT_KEYS, `${f.id} heading`).toContain(f.type.heading);
      expect(TEMPLATE_FONT_KEYS, `${f.id} body`).toContain(f.type.body);
    }
  });

  /**
   * THE FONTS THE OWNER NAMED FOR «علامة» ARE NOT ALL IN THE REPOSITORY.
   *
   * §٨ asks for El Messiri, IBM Plex Sans Arabic and Cinzel, «كلّها جوّا
   * الريبو، مش من Google وقت البناء». Only the middle one is here —
   * `src/app/(system)/fonts/plex-arabic-*.woff2`, with its OFL licence —
   * and downloading a font file is the owner's decision, not an agent's.
   *
   * So this pins what the family actually ships on TODAY and why, rather
   * than pretending. The day the two display faces and their licences
   * land, this test is what says where to change the one line.
   */
  it('and «علامة» ships on the face that is really in the repository', () => {
    const brand = familyById('brand')!;
    expect(brand.type.body, 'عائلة «علامة» غيّرت خطها بلا ما الخطوط توصل').toBe('ibm');
    expect(brand.type.heading).toBe('ibm');
    // The file it is really served from, in this repository, with its licence.
    expect(existsSync(join(process.cwd(), 'src/app/(system)/fonts/plex-arabic-400.woff2'))).toBe(true);
    expect(existsSync(join(process.cwd(), 'src/app/(system)/fonts/OFL.txt'))).toBe(true);
    // And the open item is written down where the owner will read it.
    const doc = repoFile('docs/storefront/FAMILIES.md');
    expect(doc, 'الوثيقة لا تذكر الخطّين الناقصين').toMatch(/El Messiri/);
    expect(doc).toMatch(/Cinzel/);
  });
});

describe('the ten skins, placed', () => {
  it('every shipped template has exactly one placement', () => {
    for (const t of STORE_TEMPLATES) {
      expect(SKIN_FAMILY[t.id], `${t.id}: بلا عائلة`).toBeTruthy();
      expect(SKIN_FAMILY[t.id].why.length, `${t.id}: بلا سبب`).toBeGreaterThan(10);
    }
  });

  it('and no placement names a template that does not ship', () => {
    // The other direction, which is how a list goes stale: a skin renamed
    // and a placement left behind reads as live policy for nothing.
    for (const id of Object.keys(SKIN_FAMILY)) {
      expect(templateById(id), `«${id}» له عائلة ولا قالب`).toBeTruthy();
    }
  });

  it('every family has at least one voice a seller can choose', () => {
    for (const f of STORE_FAMILIES) {
      expect(voicesOf(f.id).length, `عائلة «${f.name}» بلا صوت — عنوان فوق لا شيء`).toBeGreaterThan(0);
    }
  });

  it('and exactly one of them is its reference', () => {
    for (const f of STORE_FAMILIES) {
      const refs = Object.entries(SKIN_FAMILY).filter(
        ([, p]) => p.family === f.id && p.state === 'reference'
      );
      expect(refs.length, `${f.id}: ${refs.length} مرجع`).toBe(1);
      // And the reference is the first voice the gallery draws.
      expect(voicesOf(f.id)[0]).toBe(refs[0][0]);
    }
  });

  /**
   * MERGED AND RETIRED: HIDDEN, NOT DELETED, NOT SILENT.
   *
   * The same three rules `layout-slots.ts` applies to a retired variant,
   * and for the same reason — a shop's theme already holds the name, and
   * deleting it would make that theme fail to parse. A seller's
   * storefront must not go blank because of a decision about a list.
   */
  it('a merged skin is hidden from the gallery', () => {
    const merged = Object.entries(SKIN_FAMILY).filter(([, p]) => p.state === 'merged');
    // Four, as §7.3 lists them: «نقاء»→«مختبر», «تراث»→«أعشاب»,
    // «عنبر»→«طقس», «سوق»→«نبض». Six live voices and four hidden.
    expect(merged.length, 'عدد القوالب المدموجة تغيّر عن §7.3').toBe(4);
    for (const [id] of merged) expect(isGalleryVoice(id), id).toBe(false);
  });

  it('and still ships, so a shop wearing it keeps its look', () => {
    for (const [id, p] of Object.entries(SKIN_FAMILY)) {
      if (p.state === 'reference' || p.state === 'voice') continue;
      expect(templateById(id), `«${id}» انحذف`).toBeTruthy();
      // Its stored theme still parses, which is the thing that was at risk.
      const theme = parseStoreTheme(JSON.stringify({ ...DEFAULT_STORE_THEME, template: id }));
      expect(theme.template, id).toBe(id);
    }
  });

  it('and the seller is told, in Arabic, naming what happened', () => {
    const note = familyNoteAr('pure');
    expect(note, 'بلا ملاحظة').toBeTruthy();
    expect(note, 'الملاحظة لا تقول لوين انضمّ').toContain('lab');
    // And the half a seller actually worries about: did my shop change?
    expect(note, 'الملاحظة لا تطمّن البائع إنّ شكل متجره ما تغيّر').toMatch(/ما تغيّر|زي ما هو/);
    // A live voice gets no note at all.
    expect(familyNoteAr('lab'), 'ملاحظة على قالب حيّ').toBeNull();
    // The retired one says it is not offered any more, without claiming a
    // replacement it does not have.
    expect(familyNoteAr('pearl')).toBeTruthy();
    expect(familyOfSkin('pearl'), '«لؤلؤ» رجع لعائلة').toBeNull();
  });

  it('and the gallery is the thing that hides them', () => {
    const src = stripComments(repoFile('src/components/store/SkinGallery.tsx'));
    expect(src, 'المعرض ما زال يعرض كل القوالب').toMatch(/isGalleryVoice\(s\.key\)/);
    // Except the one this shop is wearing, which must stay reachable.
    expect(src).toMatch(/s\.key === installed/);
  });
});

describe('which family a shop wears', () => {
  it('a shop that chose nothing wears the default', () => {
    expect(familyOf(DEFAULT_STORE_THEME)).toBe(DEFAULT_FAMILY);
  });

  it('a shop that installed a voice wears that voice’s family, unasked', () => {
    for (const t of STORE_TEMPLATES) {
      const theme = parseStoreTheme(JSON.stringify({ ...DEFAULT_STORE_THEME, template: t.id }));
      const expected = familyOfSkin(t.id) ?? DEFAULT_FAMILY;
      expect(familyOf(theme), t.id).toBe(expected);
    }
  });

  it('and a shop may name one outright', () => {
    const theme = parseStoreTheme(JSON.stringify({ ...DEFAULT_STORE_THEME, family: 'brand' }));
    expect(familyOf(theme)).toBe('brand');
  });

  it('but never one nobody built', () => {
    const theme = parseStoreTheme(JSON.stringify({ ...DEFAULT_STORE_THEME, family: 'neon' }));
    expect(theme.family, 'عائلة مش موجودة انحفظت').toBeUndefined();
    expect(familyOf(theme)).toBe(DEFAULT_FAMILY);
  });

  /**
   * AND THE FAMILY REALLY REACHES THE PAGE.
   *
   * The failure this whole stage exists to answer is a setting a seller
   * can see, preview and save — and never get (`AUDIT-2a-delta.md` §2).
   * So: a shop that names a family and stores no layout of its own draws
   * that family's parts.
   */
  it('a shop that names a family draws that family’s parts', () => {
    for (const f of STORE_FAMILIES) {
      const theme = parseStoreTheme(JSON.stringify({ ...DEFAULT_STORE_THEME, family: f.id }));
      expect(layoutOf(theme, 'hero'), `${f.id}: البطل`).toBe(f.layout.hero);
      expect(layoutOf(theme, 'header'), `${f.id}: الترويسة`).toBe(f.layout.header);
      expect(layoutOf(theme, 'productCard'), `${f.id}: البطاقة`).toBe(f.layout.productCard);
    }
  });

  /**
   * AND A SHOP THAT NAMED NOTHING IS NOT REPAINTED BY THIS.
   *
   * Reading the default family for an unset slot would have changed the
   * header, the first screen and the card of every shop that never chose
   * anything — live shops, as a side effect of adding a word to a type.
   * «A store wearing one keeps its look until the owner changes it» cuts
   * both ways, and this is the half that is easy to break.
   */
  it('and a shop that named nothing keeps exactly what it drew before', () => {
    const bare = parseStoreTheme(JSON.stringify({ ...DEFAULT_STORE_THEME, layout: {} }));
    expect(bare.family, 'المتجر الفاضي صار بعائلة').toBeUndefined();
    expect(layoutOf(bare, 'hero')).toBe('productFirst');
    expect(layoutOf(bare, 'header')).toBe('minimal');
    expect(layoutOf(bare, 'productCard')).toBe('portrait');
  });

  it('and the seller’s own stored slot still beats the family', () => {
    // The order is: what the shop stored, then its family, then the
    // house default. A family that overrode a seller's own choice would
    // be a template undoing their work.
    const theme = parseStoreTheme(
      JSON.stringify({ ...DEFAULT_STORE_THEME, family: 'brand', layout: { hero: 'slider' } })
    );
    expect(layoutOf(theme, 'hero')).toBe('slider');
    expect(layoutOf(theme, 'productCard')).toBe('world');
  });

  it('and the shell says which family it is wearing, so the sheet can read it', () => {
    const shell = stripComments(repoFile('src/components/storefront/StorefrontShell.tsx'));
    expect(shell, 'القشرة ما بتسأل عن العائلة').toMatch(/familyOf\(store\.theme\)/);
    expect(shell, 'العائلة ما بتوصل الصفحة').toMatch(/data-family=\{family\}/);
    // And it ships that family's slice, not all four.
    expect(shell).toMatch(/FAMILY_SHEET\[family\]/);
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════
 * D9 — A PAGE KEEPS ITS OWN IDENTITY INSIDE THE SHOP, IN A THIN FRAME.
 *
 * «صفحة المنتج بتضلّ بهويّتها — عائلتها — جوّا المتجر كمان، بإطار متجر
 * رقيق بس: شعار · كل المنتجات · السلة. و/lp/<slug> بتضلّ بهويّتها بلا
 * إطار».
 * ═══════════════════════════════════════════════════════════════════════
 */
describe('a page inside the shop keeps its own identity', () => {
  const shell = () => stripComments(repoFile('src/components/storefront/StorefrontShell.tsx'));
  const product = () => stripComments(repoFile('src/app/s/[store]/p/[sku]/page.tsx'));

  it('the in-store product page asks for the thin frame', () => {
    expect(product(), 'صفحة المنتج جوّا المتجر ما بتطلب الإطار الرقيق').toMatch(
      /<StorefrontShell store=\{store\} back=\{back\} thin>/
    );
  });

  it('and the thin frame carries the logo, the way back and the basket', () => {
    const src = shell();
    // The three D9 names, each still rendered when `thin` is true: the
    // brand link, the back nav and the cart.
    expect(src).toMatch(/className="sf-brand"/);
    expect(src).toMatch(/\{back && \(/);
    expect(src).toMatch(/cartBarApplies\(store\.type\) && <CartLink/);
  });

  it('and nothing else — the search, the menu and the assurance line stand down', () => {
    const src = shell();
    for (const [what, pattern] of [
      ['البحث', /\{!thin && \(\s*<form className="sf-search"/],
      ['القائمة', /\{!thin && headerMenu\.length > 0/],
      ['سطر الطمأنة', /\{!thin && \(\s*<p className="sf-assure">/],
    ] as const) {
      expect(src, `${what} ما بتنزاح بالإطار الرقيق`).toMatch(pattern);
    }
  });

  /**
   * AND THE LOCKED CORE IS NOT BEING SUBTRACTED, WHICH IS A DIFFERENT
   * CLAIM FROM THE ONE ABOVE.
   *
   * «أي تخصيص بيخرب عنصر منهم بينرفض مع السبب» is about a SELLER's
   * customisation of the shop's own pages — `header-core.test.tsx` holds
   * it, and every shop page still carries all three. The thin frame is a
   * different surface, asked for by name by the one route that knows a
   * page with its own identity is inside it. So: no CSS rule may hide
   * any of them, which is how a seller's template could have done it.
   */
  it('and no stylesheet rule hides them, which is the other way to lose them', () => {
    const css = repoFile('src/components/storefront/styles.ts');
    for (const part of ['sf-search', 'sf-cart', 'sf-assure']) {
      expect(css, part).not.toMatch(new RegExp(`\\.${part}[^{]*\\{[^}]*display:\\s*none`));
    }
  });

  it('and a standalone /lp page is still framed by nobody', () => {
    // `wearsShopChrome` answers false for `inStore`, and the standalone
    // page is not `asFront` either — so it wears its own clothes, which
    // is the second half of D9.
    const theme = stripComments(repoFile('src/lib/store-theme.ts'));
    expect(theme).toMatch(/if \(opts\.inStore\) return false;/);
    expect(theme).toMatch(/if \(!opts\.asFront \|\| !opts\.hasSlug\) return false;/);
  });
});
