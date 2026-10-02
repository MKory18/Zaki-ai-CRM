import { describe, expect, it } from 'vitest';
import {
  MAX_SYNONYMS,
  RANK,
  SUGGESTION_LIMIT,
  expandQuery,
  parseSynonyms,
  searchProducts,
  suggestProducts,
  typoBudget,
  withinDistance,
} from './store-search';
import { repoFile, stripComments } from './guard-source';

/**
 * WHAT A SHOPPER MEANT, NOT WHAT THEY TYPED.
 *
 * The customer this shop sells to is often older, on a mid-range Android,
 * and typing Arabic on a phone keyboard. They will not scroll past noise to
 * find the thing they asked for, and they will not try a second spelling.
 */

const P = (name: string, over: Record<string, unknown> = {}) => ({
  id: name,
  name,
  sku: null,
  ...over,
});

const names = (hits: { product: { name: string } }[]) => hits.map((h) => h.product.name);

describe('the spelling rule is not written here', () => {
  /**
   * `normalizeArabic` already unifies أ/إ/آ/ٱ → ا, ة → ه, ى → ي and strips
   * the diacritics and the tatweel — the brief's whole list, and six places
   * in this system already ask it. A copy here would be a second answer to
   * «هل «اذن» هي «الأُذُن»؟».
   */
  it('asks the one that exists', () => {
    expect(stripComments(repoFile('src/lib/store-search.ts'))).toMatch(
      /import \{ normalizeArabic \} from '\.\/order-parser'/
    );
  });

  /**
   * Written as a letter OR as an escape. Measured: a guard that looked only
   * for the literal letter missed `replace(/ة/g, 'ه')` — which is
   * how somebody actually types a rule like this in a source file.
   */
  it('and writes no letter rule of its own', () => {
    const src = stripComments(repoFile('src/lib/store-search.ts'));
    expect(src, 'قاعدة إملاء ثانية').not.toMatch(
      /replace\([^)]*(?:[؀-ۿ]|\\u06[0-9a-fA-F]{2})/
    );
  });

  it.each([
    ['اذن', 'كريم الأُذُن'],
    ['فطريه', 'كريم الفطرية'],
    ['مرهم', 'مــرهم'],
  ])('so «%s» finds «%s»', (query, name) => {
    expect(names(searchProducts([P(name)], query))).toEqual([name]);
  });
});

describe('the shop’s own words', () => {
  const syn = [{ from: 'طنين', to: 'صفير الأذن' }];

  it('finds what the seller says is the same thing', () => {
    expect(names(searchProducts([P('قطرة صفير الأذن')], 'طنين', { synonyms: syn }))).toEqual([
      'قطرة صفير الأذن',
    ]);
  });

  it('and in the other direction too — a shopper may type either side', () => {
    expect(names(searchProducts([P('علاج طنين')], 'صفير الأذن', { synonyms: syn }))).toEqual([
      'علاج طنين',
    ]);
  });

  /** The shopper's own words win a tie: what they typed outranks what we decided. */
  it('puts what was actually typed first', () => {
    const products = [P('قطرة صفير الأذن'), P('علاج طنين')];
    expect(names(searchProducts(products, 'طنين', { synonyms: syn }))).toEqual([
      'علاج طنين',
      'قطرة صفير الأذن',
    ]);
  });

  it('expands to the query itself first, always', () => {
    expect(expandQuery('طنين', syn)[0]).toBe('طنين');
  });

  /** The negative control: no synonyms, no expansion. */
  it('invents nothing when the shop said nothing', () => {
    expect(expandQuery('طنين', [])).toEqual(['طنين']);
    expect(searchProducts([P('قطرة صفير الأذن')], 'طنين')).toEqual([]);
  });
});

describe('a typo is a fallback, never a widener', () => {
  it.each([
    ['جل', 0],
    ['كريم', 1],
    ['مرهم', 1],
    ['مضادحيوي', 2],
  ])('gives «%s» a budget of %i', (token, budget) => {
    expect(typoBudget(token)).toBe(budget);
  });

  it('forgives one wrong letter in an ordinary word', () => {
    expect(names(searchProducts([P('كريم مرطب')], 'كريم مرطپ'))).toEqual(['كريم مرطب']);
  });

  /**
   * THE RULE THAT MATTERS. A shopper who typed a real word and got eleven
   * near-misses mixed into their four real results has been given a worse
   * answer, not a kinder one.
   */
  it('stays out of the way when the search already worked', () => {
    const products = [P('كريم مرطب'), P('كريم مرطم')];
    // «كريم مرطب» matches the first exactly; the second is one edit away
    // and must NOT be dragged in beside it.
    expect(names(searchProducts(products, 'كريم مرطب'))).toEqual(['كريم مرطب']);
  });

  it('and ranks a rescued search behind every real match', () => {
    expect(searchProducts([P('كريم مرطب')], 'كريم مرطپ')[0].rank).toBe(RANK.typo);
  });

  it('refuses to forgive a short word — «جل» is not «حل»', () => {
    expect(searchProducts([P('حل')], 'جل')).toEqual([]);
  });
});

describe('measuring how wrong a word is', () => {
  it('says nothing is wrong with the same word', () => {
    expect(withinDistance('كريم', 'كريم', 0)).toBe(true);
  });

  it.each([
    ['كريم', 'كريب', 1, true],
    ['كريم', 'كريب', 0, false],
    ['كريم', 'مرهم', 1, false],
    ['كريم', 'كريمات', 2, true],
  ])('%s vs %s within %i → %s', (a, b, max, expected) => {
    expect(withinDistance(a as string, b as string, max as number)).toBe(expected);
  });

  /** The early exit must not change the answer, only the work. */
  it('gives up early without getting it wrong', () => {
    expect(withinDistance('اااااااااا', 'بببببببببب', 2)).toBe(false);
    expect(withinDistance('اااااااااا', 'ااااااااا', 2)).toBe(true);
  });
});

describe('the order they are shown in', () => {
  const products = [
    P('مرطب للبشرة'),
    P('كريم مرطب'),
    P('واقٍ شمسي', { sku: 'MRTB-9' }),
    P('غسول', { category: { name: 'مرطبات' } }),
  ];

  it('starts-with, then contains, then the code, then the category', () => {
    expect(names(searchProducts(products, 'مرطب'))).toEqual([
      'مرطب للبشرة',
      'كريم مرطب',
      'غسول',
    ]);
    // The SKU is Latin; it answers a Latin query.
    expect(names(searchProducts(products, 'mrtb'))).toEqual(['واقٍ شمسي']);
  });

  it('gives each reason its own rank', () => {
    expect(searchProducts(products, 'مرطب')[0].rank).toBe(RANK.nameStarts);
    expect(searchProducts(products, 'مرطب')[1].rank).toBe(RANK.nameContains);
    expect(searchProducts(products, 'mrtb')[0].rank).toBe(RANK.skuContains);
  });

  it('counts a product once, however many ways it matched', () => {
    const one = [P('مرطب', { sku: 'MRTB', category: { name: 'مرطبات' } })];
    expect(searchProducts(one, 'مرطب')).toHaveLength(1);
  });

  it('answers a blank with nothing, not with the catalogue', () => {
    expect(searchProducts(products, '')).toEqual([]);
    expect(searchProducts(products, '   ')).toEqual([]);
  });

  it('keeps a suggestion list short enough to sit under a field', () => {
    const many = Array.from({ length: 30 }, (_, i) => P(`مرطب ${i}`));
    expect(suggestProducts(many, 'مرطب')).toHaveLength(SUGGESTION_LIMIT);
  });

  it('and honours a limit that was asked for', () => {
    const many = Array.from({ length: 30 }, (_, i) => P(`مرطب ${i}`));
    expect(searchProducts(many, 'مرطب', { limit: 3 })).toHaveLength(3);
  });
});

/**
 * THE SHOPPER TYPES THE COMPLAINT, NOT THE PRODUCT.
 *
 * Nobody's product is called «بثور». It is what the category asked about
 * under «مناسب لـ», and the seller answered it on the غسول — so a shop that
 * filled in its answers and could not be searched by them was asking its
 * sellers to describe products into a hole.
 */
describe('what the product answered', () => {
  const shelf = [
    P('غسول للبشرة الدهنية', { attributes: { need: ['حبوب'], skin: 'دهنية' } }),
    P('كريم مرطب', { attributes: { need: ['جفاف'], skin: 'جافة', ml: 50 } }),
    P('سيروم فيتامين سي', { attributes: { made: 'فيتامين سي ١٥٪، حمض الفيروليك' } }),
  ];

  it('finds a product by a choice it was given', () => {
    expect(names(searchProducts(shelf, 'حبوب'))).toEqual(['غسول للبشرة الدهنية']);
  });

  it('and by prose nobody would put in a name', () => {
    expect(names(searchProducts(shelf, 'الفيروليك'))).toEqual(['سيروم فيتامين سي']);
  });

  it('behind the name, the code and the category — an answer is not the thing named', () => {
    expect(searchProducts(shelf, 'حبوب')[0].rank).toBe(RANK.attributeContains);
    expect(RANK.attributeContains).toBeGreaterThan(RANK.categoryContains);
    expect(RANK.attributeContains).toBeLessThan(RANK.typo);
  });

  it('puts the product that is NAMED for it before the one that merely answered', () => {
    const both = [P('غسول', { attributes: { need: ['جفاف'] } }), P('كريم جفاف')];
    expect(names(searchProducts(both, 'جفاف'))).toEqual(['كريم جفاف', 'غسول']);
  });

  it('ignores a number — «50» is a price to the person typing it', () => {
    expect(searchProducts(shelf, '50')).toEqual([]);
  });

  it('spells an answer the way it spells everything else', () => {
    const one = [P('غسول', { attributes: { skin: 'البشره الحساسة' } })];
    expect(names(searchProducts(one, 'الحساسه'))).toEqual(['غسول']);
    // And the same for a «multi», which is a second branch and was once
    // the branch that did not normalise.
    const many = [P('كريم', { attributes: { need: ['تصبّغات', 'تجاعيد'] } })];
    expect(names(searchProducts(many, 'تصبغات'))).toEqual(['كريم']);
  });

  it('and a product that answered nothing is not broken by the question', () => {
    expect(searchProducts([P('غسول')], 'حبوب')).toEqual([]);
    expect(searchProducts([P('غسول', { attributes: null })], 'حبوب')).toEqual([]);
  });

  /**
   * The whole reason the synonym existed. «بثور» is the shopper's word,
   * «حبوب» is the seller's answer, and neither is in any product name.
   */
  it('reaches an answer through the shop’s own vocabulary', () => {
    const hits = searchProducts(shelf, 'بثور', { synonyms: [{ from: 'حبوب', to: 'بثور' }] });
    expect(names(hits)).toEqual(['غسول للبشرة الدهنية']);
  });
});

describe('reading the shop’s vocabulary out of the column', () => {
  it('reads a list that is a list', () => {
    expect(parseSynonyms('[{"from":"طنين","to":"صفير"}]')).toEqual([
      { from: 'طنين', to: 'صفير' },
    ]);
  });

  it.each([['nothing', null], ['not JSON', '{{{'], ['an object', '{"a":1}']])(
    'answers an empty vocabulary for %s',
    (_why, raw) => {
      expect(parseSynonyms(raw as string | null)).toEqual([]);
    }
  );

  /**
   * A shop whose vocabulary stopped loading should lose a synonym, not its
   * search. One bad pair is dropped; the rest still work.
   */
  it('keeps the pairs it can read and drops the one it cannot', () => {
    expect(parseSynonyms('[{"from":"طنين","to":"صفير"},{"from":"x"},{"from":"حبوب","to":"أقراص"}]'))
      .toEqual([
        { from: 'طنين', to: 'صفير' },
        { from: 'حبوب', to: 'أقراص' },
      ]);
  });

  it('refuses a pair that says nothing — both sides the same word', () => {
    expect(parseSynonyms('[{"from":"الأذن","to":"الاذن"}]')).toEqual([]);
  });

  it('will not hold more than a search can carry in one pass', () => {
    const many = JSON.stringify(
      Array.from({ length: MAX_SYNONYMS + 5 }, (_, i) => ({ from: `كلمه${i}`, to: `بديل${i}` }))
    );
    expect(parseSynonyms(many).length).toBeLessThanOrEqual(MAX_SYNONYMS);
  });
});
