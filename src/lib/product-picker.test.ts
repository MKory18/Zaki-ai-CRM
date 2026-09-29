import { describe, expect, it } from 'vitest';
import { matchProducts, PICKER_LIMIT, type PickableProduct } from '@/components/ui/ProductPicker';
import { repoFile, stripComments } from './guard-source';

/**
 * FINDING ONE PRODUCT OUT OF A HUNDRED.
 *
 * It was a native `<select>` holding every product in the company —
 * measured at the time: 114 of them — so choosing one meant scrolling a
 * dropdown on a phone. Reported twice, from two screens: «لما أضيف منتج
 * بخانة طلب جديد ما بطلع بحث» and «لما أضيف منتج في طلب مرتجع ما بطلع
 * بحث». Both come through one editor, so both are one fix.
 */

const P = (id: string, name: string, sku?: string): PickableProduct => ({ id, name, sku });

const CATALOGUE: PickableProduct[] = [
  P('1', 'قطرة طنين الأذن Cliarden 20 مل', 'EAR-20'),
  P('2', 'كريم البواسير 50 مل', 'HEM-50'),
  P('3', 'كريم بركة لآلام المفاصل 50 مل', 'JNT-50'),
  P('4', 'الصابونة الإفريقية African Black Soap', 'SOAP-100'),
];

describe('the search a hundred products need', () => {
  /**
   * THE WHOLE POINT, AND THE ONE THAT WOULD SILENTLY REGRESS.
   *
   * Arabic is written with and without hamza, and a shopper or an agent
   * types whichever is on the keyboard. `normalizeArabic` — the one the
   * rest of the system already uses — folds أ إ آ into ا, ة into ه and ى
   * into ي, so all three spellings of the same word are the same query.
   */
  it('finds the same product however the hamza is written', () => {
    for (const q of ['الأذن', 'الاذن', 'اذن', 'أذن']) {
      expect(matchProducts(CATALOGUE, q).map((p) => p.id), q).toEqual(['1']);
    }
  });

  it('and ignores the diacritics somebody typed', () => {
    expect(matchProducts(CATALOGUE, 'الأُذُن').map((p) => p.id)).toEqual(['1']);
  });

  it('matches the code too — a warehouse reads the code, not the name', () => {
    expect(matchProducts(CATALOGUE, 'hem-50').map((p) => p.id)).toEqual(['2']);
  });

  it('returns every match, not the first', () => {
    expect(matchProducts(CATALOGUE, 'كريم').map((p) => p.id)).toEqual(['2', '3']);
  });

  it('an empty query opens on the catalogue rather than on nothing', () => {
    expect(matchProducts(CATALOGUE, '')).toHaveLength(CATALOGUE.length);
    expect(matchProducts(CATALOGUE, '   ')).toHaveLength(CATALOGUE.length);
  });

  it('and never draws more than a screenful', () => {
    const many = Array.from({ length: 300 }, (_, i) => P(String(i), `منتج ${i}`));
    expect(matchProducts(many, '').length).toBe(PICKER_LIMIT);
    expect(matchProducts(many, 'منتج').length).toBe(PICKER_LIMIT);
  });

  it('says so when nothing matches, rather than looking broken', () => {
    expect(matchProducts(CATALOGUE, 'zzzz')).toEqual([]);
  });
});

describe('the one editor both screens go through', () => {
  it('uses the picker, not a dropdown of everything', () => {
    const src = stripComments(repoFile('src/components/orders/ProductLinesEditor.tsx'));
    expect(src).toMatch(/<ProductPicker/);
    // The `<select>` that listed all 114 is gone. The offer select below
    // it is a different thing and stays, so this looks for the product one.
    expect(src, 'ما زال يسرد كلَّ المنتجات في قائمة').not.toMatch(
      /<option value="">— اختر المنتج —<\/option>/
    );
  });

  it('and the spelling rule is the system’s one, not a second copy', () => {
    const src = stripComments(repoFile('src/components/ui/ProductPicker.tsx'));
    expect(src).toMatch(/import \{ normalizeArabic \} from '@\/lib\/order-parser'/);
    // A second set of replace() calls here would be a second answer to
    // «how is أذن spelled», and the two would drift.
    expect(src, 'قاعدةُ إملاءٍ ثانية').not.toMatch(/replace\(\/\[أإآ/);
  });
});
