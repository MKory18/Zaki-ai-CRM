import { describe, expect, it } from 'vitest';
import { foldForMatch, matchProduct, normalizeArabic } from './order-parser';
import { resolveProductText } from './telegram/product-text';
import { matchProducts, type PickableProduct } from '@/components/ui/ProductPicker';
import { repoFile, stripComments } from './guard-source';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * A PRODUCT TYPED WITH ARABIC DIGITS IS THE PRODUCT WRITTEN WITH LATIN ONES — the stale branch's last unported claim (22/10).
 *
 * `d58aba4b` (20/10) carried five claims about a pasted order typed on an Arabic keypad; four of them are on main through #81, and the
 * fifth — «the product name keeps every digit it had» — was not: a catalogue name has Latin digits («صوبة القدس 4 شعلات») or Arabic-Indic
 * ones («فيتامين د ٥٠٠٠»), the person types whichever their keyboard has, and the matchers compared them as letters only.
 *
 * MEASURED with this catalogue's own two names, query «صوبة القدس ٤ شعلات»: it scored 36 against BOTH stoves — a one-digit token is
 * under the matcher's three-letter floor, and the exact-substring signal (+60) never fired — so the one that came first in the list won
 * (the 2-burner, when it came first). Typed with a Latin 4 it scores 96 against the right one in either order.
 *
 * Three matchers an agent types into, one comparison form (`foldForMatch`): the scorer the AI intake and the import share
 * (`matchProduct`), the order form's search box (`matchProducts`), and the Telegram door (`resolveProductText`) — which creates its
 * order without a person looking at it.
 * ═══════════════════════════════════════════════════════════════════════
 */

const TWO = { id: 'two', name: 'صوبة القدس 2 شعلات', sku: 'LEG-21' };
const FOUR = { id: 'four', name: 'صوبة القدس 4 شعلات', sku: 'LEG-11' };
const VIT = { id: 'vit', name: 'فيتامين د ٥٠٠٠', sku: 'SUP-03' };
const CREAM = { id: 'cream', name: 'كريم مرطّب للوجه', sku: 'SKIN-01' };
const BOTH_ORDERS = [
  ['two first', [TWO, FOUR, VIT, CREAM]],
  ['four first', [FOUR, TWO, VIT, CREAM]],
] as const;

describe('the comparison form', () => {
  it('— makes Arabic-Indic digits Latin, and folds the spelling the way it always did', () => {
    expect(foldForMatch('صوبة القدس ٤ شعلات')).toBe('صوبه القدس 4 شعلات');
    expect(foldForMatch('فيتامين د ٥٠٠٠')).toBe('فيتامين د 5000');
  });

  it('— makes Persian digits Latin too', () => {
    expect(foldForMatch('صوبة القدس ۴ شعلات')).toBe('صوبه القدس 4 شعلات');
  });

  it('— leaves Latin digits and everything else exactly as `normalizeArabic` left them', () => {
    for (const text of ['صوبة القدس 4 شعلات', 'كريم مرطّب للوجه', 'SPF 50 sunscreen', 'LEG-11', '']) {
      expect(foldForMatch(text)).toBe(normalizeArabic(text));
    }
  });

  it('— and `normalizeArabic` itself still does not touch digits: slugs and the shop’s search are built from it, and are not this change’s to rewrite', () => {
    expect(normalizeArabic('٤')).toBe('٤');
    expect(normalizeArabic('صوبة ٤')).toBe('صوبه ٤');
  });
});

describe('`matchProduct` — the scorer the AI intake and the import share', () => {
  for (const [order, list] of BOTH_ORDERS) {
    it(`— «٤ شعلات» is the 4-burner, not the first stove in the list (${order})`, () => {
      const hit = matchProduct('صوبة القدس ٤ شعلات', [...list]);
      expect(hit?.id).toBe('four');
      // The strong signal fired — it did not win by the luck of its place: 60 for the whole name inside the query, and the tokens on top.
      expect(hit?.score).toBeGreaterThanOrEqual(90);
    });

    it(`— and «٢ شعلات» is the 2-burner (${order})`, () => {
      const hit = matchProduct('صوبة القدس ٢ شعلات', [...list]);
      expect(hit?.id).toBe('two');
      expect(hit?.score).toBeGreaterThanOrEqual(90);
    });

    it(`— the Persian digit says the same (${order})`, () => {
      expect(matchProduct('صوبة القدس ۴ شعلات', [...list])?.id).toBe('four');
    });

    it(`— and the Latin one still does (${order})`, () => {
      expect(matchProduct('صوبة القدس 4 شعلات', [...list])?.id).toBe('four');
      expect(matchProduct('صوبة القدس 2 شعلات', [...list])?.id).toBe('two');
    });
  }

  it('— a catalogue name written with Arabic-Indic digits is found by the same name typed with Latin ones, and by Arabic ones', () => {
    expect(matchProduct('فيتامين د 5000', [TWO, FOUR, VIT, CREAM])).toMatchObject({ id: 'vit' });
    expect(matchProduct('فيتامين د ٥٠٠٠', [TWO, FOUR, VIT, CREAM])).toMatchObject({ id: 'vit' });
    expect(matchProduct('فيتامين د 5000', [TWO, FOUR, VIT, CREAM])?.score).toBeGreaterThanOrEqual(60);
  });

  it('— a SKU typed with Arabic digits is the SKU written with Latin ones', () => {
    // Nothing but the SKU is in the query, so only the SKU signal (+50) can find it.
    expect(matchProduct('LEG-١١', [TWO, FOUR])).toMatchObject({ id: 'four' });
    expect(matchProduct('LEG-٢١', [FOUR, TWO])).toMatchObject({ id: 'two' });
  });

  it('— and a query with no digit at all matches exactly as before', () => {
    expect(matchProduct('كريم مرطب للوجه', [TWO, FOUR, VIT, CREAM])).toMatchObject({ id: 'cream' });
    expect(matchProduct('', [TWO, FOUR])).toBeNull();
    expect(matchProduct('شي لا وجود له بالكتالوج', [TWO, FOUR, VIT, CREAM])).toBeNull();
  });
});

describe('`matchProducts` — the order form’s search box', () => {
  const P = (id: string, name: string, sku?: string): PickableProduct => ({ id, name, sku });
  const LIST = [
    P('1', 'صوبة القدس 4 شعلات', 'LEG-11'),
    P('2', 'فيتامين د ٥٠٠٠', 'SUP-03'),
    P('3', 'الصابونة الإفريقية', 'SOAP-100'),
    // A SKU somebody typed on an Arabic keypad when they made the product.
    P('4', 'منتج برمز عربيّ الأرقام', 'SKU-٢٠٠'),
  ];

  it('— finds a Latin-digit name from an Arabic-digit query, and the other way round', () => {
    expect(matchProducts(LIST, '٤ شعلات').map((p) => p.id)).toEqual(['1']);
    expect(matchProducts(LIST, '4 شعلات').map((p) => p.id)).toEqual(['1']);
    expect(matchProducts(LIST, '5000').map((p) => p.id)).toEqual(['2']);
    expect(matchProducts(LIST, '٥٠٠٠').map((p) => p.id)).toEqual(['2']);
  });

  it('— and a SKU typed with Arabic digits — and one the CATALOGUE holds in Arabic digits, found by a Latin query', () => {
    expect(matchProducts(LIST, 'soap-١٠٠').map((p) => p.id)).toEqual(['3']);
    expect(matchProducts(LIST, 'sku-200').map((p) => p.id)).toEqual(['4']);
    expect(matchProducts(LIST, 'SKU-٢٠٠').map((p) => p.id)).toEqual(['4']);
  });

  it('— an empty query is still «everything», and a query with no digit is unchanged', () => {
    expect(matchProducts(LIST, '   ')).toHaveLength(4);
    expect(matchProducts(LIST, 'الصابونة').map((p) => p.id)).toEqual(['3']);
  });
});

describe('`resolveProductText` — the Telegram door, which creates its order without a person looking', () => {
  const CAT = [
    { id: 'two', name: 'صوبة القدس 2 شعلات', nameEn: null, sku: 'LEG-21' },
    { id: 'four', name: 'صوبة القدس 4 شعلات', nameEn: 'Quds Heater 4', sku: 'LEG-11' },
    { id: 'vit', name: 'فيتامين د ٥٠٠٠', nameEn: null, sku: 'SUP-03' },
    // An English name and a SKU the catalogue holds with Arabic-Indic digits.
    { id: 'odd', name: 'منتج بأرقام عربيّة في اسمه الإنجليزيّ', nameEn: 'Heater ٤٠٠٠', sku: 'SKU-٢٠٠' },
  ];

  it('— the whole name, typed with an Arabic digit, is EXACT and is the 4-burner', () => {
    expect(resolveProductText('صوبة القدس ٤ شعلات', CAT)).toMatchObject({ kind: 'found', how: 'exact', product: { id: 'four' } });
    expect(resolveProductText('فيتامين د 5000', CAT)).toMatchObject({ kind: 'found', how: 'exact', product: { id: 'vit' } });
  });

  it('— the SKU and the English name are exact too, in either script — whichever script the CATALOGUE holds them in', () => {
    expect(resolveProductText('leg-١١', CAT)).toMatchObject({ kind: 'found', how: 'exact', product: { id: 'four' } });
    expect(resolveProductText('quds heater ٤', CAT)).toMatchObject({ kind: 'found', how: 'exact', product: { id: 'four' } });
    expect(resolveProductText('sku-200', CAT)).toMatchObject({ kind: 'found', how: 'exact', product: { id: 'odd' } });
    expect(resolveProductText('heater 4000', CAT)).toMatchObject({ kind: 'found', how: 'exact', product: { id: 'odd' } });
  });

  it('— a part of one name is CONTAINS, and the digit is what picks the product', () => {
    expect(resolveProductText('صوبة القدس ٤', CAT)).toMatchObject({ kind: 'found', how: 'contains', product: { id: 'four' } });
    expect(resolveProductText('صوبة القدس ٢', CAT)).toMatchObject({ kind: 'found', how: 'contains', product: { id: 'two' } });
  });

  it('— a message that holds the whole name is CONTAINS as well', () => {
    expect(resolveProductText('بدي صوبة القدس ٤ شعلات لو سمحت', CAT)).toMatchObject({ kind: 'found', how: 'contains', product: { id: 'four' } });
  });

  it('— two products fit and nothing says which: AMBIGUOUS, for a person — never a guess', () => {
    expect(resolveProductText('صوبة القدس', CAT)).toEqual({ kind: 'ambiguous' });
  });

  it('— a name close to one of them but in no way inside it is FUZZY, by the shared scorer', () => {
    expect(resolveProductText('قدس صوبة شعلات ٤', CAT)).toMatchObject({ kind: 'found', how: 'fuzzy' });
  });

  it('— and a product nobody has is NONE', () => {
    expect(resolveProductText('شي ما إله وجود', CAT)).toEqual({ kind: 'none' });
  });

  it('— the door asks it, and turns each answer into the review reason it always gave', () => {
    const door = stripComments(repoFile('src/lib/telegram/inbound.ts'));
    expect(door).toContain('const resolved = resolveProductText(productText, products);');
    expect(door).toMatch(/resolved\.kind === 'ambiguous'\) return review\('AMBIGUOUS_PRODUCT'\)/);
    expect(door).toMatch(/resolved\.kind === 'none'\) return review\('PRODUCT_NOT_FOUND'\)/);
    expect(door).toContain('const product = resolved.product;');
  });
});

describe('and no matcher keeps a second, letters-only comparison', () => {
  it('— the three files compare through `foldForMatch`, not through `normalizeArabic` directly', () => {
    for (const file of ['src/lib/telegram/product-text.ts', 'src/components/ui/ProductPicker.tsx']) {
      const src = stripComments(repoFile(file));
      expect(src, file).not.toMatch(/normalizeArabic\(/);
      expect(src, file).toContain('foldForMatch(');
    }
    const parser = stripComments(repoFile('src/lib/order-parser.ts'));
    const body = parser.slice(parser.indexOf('export function matchProduct('));
    expect(body, 'matchProduct').not.toMatch(/normalizeArabic\(/);
    expect(body, 'matchProduct').toContain('foldForMatch(');
  });
});
