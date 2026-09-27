import { describe, expect, it } from 'vitest';
import { repoFile, stripComments } from './guard-source';

/**
 * A PRODUCT WITH NO SHELF.
 *
 * Measured before this: 114 products, and not one of them carried a
 * category. The picker existed and could even name a new shelf on the spot;
 * the field was simply optional, and an optional field is an empty one.
 *
 * The emptiness is not cosmetic. Permissions can be scoped to categories —
 * «this person sees only the skincare line» — and the service enforces that
 * correctly against a list that was always empty. Every report that groups
 * by category grouped everything into one heap. And the assistant cannot
 * answer «أيُّ صنفٍ يبيع أكثر» about goods that are all in no category.
 *
 * So it is demanded on the way IN, where it costs one click. The products
 * already here are not held hostage: editing one does not demand a category
 * it never had — blocking an edit until somebody files 114 products is how a
 * rule gets worked around rather than followed. Instead the screen counts
 * them and filters to exactly them, so the backlog is a sitting's work
 * rather than an invisible debt.
 */

const door = () => stripComments(repoFile('src/app/api/products/route.ts'));
const screen = () => stripComments(repoFile('src/components/screens/ProductsScreen.tsx'));
const picker = () => stripComments(repoFile('src/components/products/CategoryPicker.tsx'));

describe('a new product must be filed', () => {
  it('the door refuses one with no category', () => {
    const src = door();
    expect(src, 'حارس التصنيف معطَّل').toMatch(/if \(!categoryId\) \{/);
    expect(src).toContain('CATEGORY_REQUIRED');
  });

  /** A refusal that does not say how to satisfy it is a wall. */
  it('and says why, and where to make one', () => {
    const src = door();
    expect(src).toContain('اختر تصنيف المنتج');
    expect(src).toContain('يمكنك إنشاء تصنيفٍ جديدٍ من المنتقي نفسه');
    // And the picker really can, or that sentence is a lie.
    expect(picker()).toMatch(/method: 'POST'/);
  });

  /**
   * A category id from a request body is a foreign key somebody can type. A
   * product filed under another tenant's shelf would be visible to
   * permissions scoped to it.
   */
  it('and still checks the shelf belongs to this company', () => {
    const src = door();
    expect(src).toMatch(/where: \{ id: categoryId, companyId \}/);
    expect(src).toContain('لا تصنيف بهذا المعرّف');
    // No path left where it resolves to null.
    expect(src, 'ما زال يقبل السقوط إلى بلا تصنيف').not.toContain(
      'let resolvedCategoryId: string | null = null'
    );
  });
});

describe('and the ones already here are visible, not blocked', () => {
  it('the list counts the unfiled over the same scope it lists', () => {
    const src = door();
    expect(src).toContain('const uncategorised = await db.product.count({ where: { ...where, categoryId: null } })');
    expect(src).toContain('uncategorised });');
  });

  /** Rendering nothing made 114 unfiled products look like 114 filed ones. */
  it('and the row says «بلا تصنيف» rather than nothing at all', () => {
    const src = screen();
    // THE ROW'S OWN BRANCH. «بلا تصنيف» is also the switch's label further
    // down, so looking for the words passed with the row left rendering
    // nothing — which is the bug this guards.
    expect(src, 'الصفّ يرسم فراغاً مكان التصنيف الناقص').toMatch(
      /p\.category\?\.name \? \([\s\S]{0,240}\) : \([\s\S]{0,160}بلا تصنيف/
    );
    expect(src, 'الصفّ عاد إلى null').not.toMatch(/p\.category\?\.name \? \([\s\S]{0,240}\) : null\}/);
  });

  it('with one switch that filters to exactly them', () => {
    const src = screen();
    expect(src).toMatch(/setOnlyUnfiled\(\(v\) => !v\)/);
    expect(src, 'المفتاح لا يُصفّي شيئاً').toMatch(/if \(onlyUnfiled && p\.categoryId\) return false;/);
    expect(src).toContain('منتجاً بلا تصنيف');
  });

  /** Nothing to say when there is nothing owing. */
  it('and says nothing when every product is filed', () => {
    expect(screen()).toMatch(/\{uncategorised > 0 && \(/);
  });

  it('and explains what a category is for, where the backlog is shown', () => {
    expect(screen()).toContain('التصنيف يحدّد من يرى المنتج');
  });

  /**
   * EDITING IS NOT BLOCKED. The rule applies on the way in; a product that
   * predates it can still be corrected, renamed and repriced.
   */
  it('while editing an old product is left alone', () => {
    const src = door();
    const put = src.slice(src.indexOf('export async function PUT'));
    if (put) expect(put, 'التعديل صار مرهوناً بالتصنيف').not.toContain('CATEGORY_REQUIRED');
  });
});
