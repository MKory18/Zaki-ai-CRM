import { describe, expect, it } from 'vitest';
import {
  FILTERABLE_KINDS,
  MAX_FIELDS,
  facetsFor,
  matchesAttributes,
  parseCategoryAttributes,
  parseProductAttributes,
} from './product-attributes';

/**
 * THE QUESTIONS BELONG TO THE CATEGORY, THE ANSWERS TO THE PRODUCT.
 *
 * And the filter's options belong to neither: they are read off the
 * products a shopper is actually looking at, because an option no product
 * carries is a dead end somebody walks into once and then stops trusting
 * the rest.
 */

const field = (over: Record<string, unknown> = {}) => ({
  key: 'size',
  label: 'المقاس',
  kind: 'select',
  options: ['صغير', 'وسط', 'كبير'],
  unit: '',
  ...over,
});

const fields = (...f: unknown[]) => parseCategoryAttributes(JSON.stringify(f));

describe('a category’s questions', () => {
  it('reads what was written', () => {
    expect(fields(field())).toEqual([field()]);
  });

  it.each([['nothing', null], ['not JSON', '{{'], ['an object', '{"a":1}']])(
    'answers none for %s',
    (_why, raw) => {
      expect(parseCategoryAttributes(raw as string | null)).toEqual([]);
    }
  );

  /**
   * A category whose schema stopped loading should lose one question, not
   * all of them.
   */
  it('keeps the questions it can read', () => {
    expect(fields(field(), { key: 'BROKEN KEY' }, field({ key: 'colour', label: 'اللون' })))
      .toHaveLength(2);
  });

  it('refuses a choice field with nothing to choose', () => {
    expect(fields(field({ options: [] }))).toEqual([]);
  });

  it('refuses two options that are one option after normalising', () => {
    expect(fields(field({ options: ['الأذن', 'الاذن'] }))).toEqual([]);
  });

  it('refuses the same key twice — one field, one key', () => {
    expect(fields(field(), field({ label: 'آخر' }))).toHaveLength(1);
  });

  it('will not hold more questions than fit a sheet', () => {
    const many = Array.from({ length: MAX_FIELDS + 4 }, (_, i) =>
      field({ key: `f${i}`, label: `حقل ${i}` })
    );
    expect(fields(...many)).toHaveLength(MAX_FIELDS);
  });

  /** Prose is shown and searched, never faceted — see the note on kinds. */
  it('does not let a shopper narrow by a paragraph', () => {
    expect(FILTERABLE_KINDS).not.toContain('text');
  });
});

describe('a product’s answers, against those questions', () => {
  const schema = fields(
    field(),
    field({ key: 'uses', label: 'مناسب لـ', kind: 'multi', options: ['الأطفال', 'الكبار'] }),
    field({ key: 'ml', label: 'الحجم', kind: 'number', options: [], unit: 'مل' }),
    field({ key: 'made', label: 'المكوّنات', kind: 'text', options: [] })
  );
  const answers = (v: unknown) => parseProductAttributes(JSON.stringify(v), schema);

  it('keeps an answer that fits', () => {
    expect(answers({ size: 'وسط', uses: ['الأطفال'], ml: 250, made: 'ماء وجلسرين' })).toEqual({
      size: 'وسط',
      uses: ['الأطفال'],
      ml: 250,
      made: 'ماء وجلسرين',
    });
  });

  /** A seller who renames a field loses an answer, not a product page. */
  it('drops an answer to a question nobody asks any more', () => {
    expect(answers({ colour: 'أحمر', size: 'وسط' })).toEqual({ size: 'وسط' });
  });

  it('drops an option that was removed from the list', () => {
    expect(answers({ size: 'عملاق' })).toEqual({});
  });

  it('matches an option however it was spelled', () => {
    expect(parseProductAttributes(
      JSON.stringify({ uses: ['الاطفال'] }),
      schema
    )).toEqual({ uses: ['الأطفال'] });
  });

  it('reads a number that arrived as text, and drops one that is not a number', () => {
    expect(answers({ ml: '250' })).toEqual({ ml: 250 });
    expect(answers({ ml: 'كبير' })).toEqual({});
  });

  it('takes one answer for a single-choice field, not a list', () => {
    expect(answers({ size: ['وسط', 'كبير'] })).toEqual({});
  });

  it('counts a repeated pick once', () => {
    expect(answers({ uses: ['الأطفال', 'الأطفال'] })).toEqual({ uses: ['الأطفال'] });
  });

  it('answers nothing for junk, and does not throw', () => {
    expect(parseProductAttributes('{{', schema)).toEqual({});
    expect(parseProductAttributes(null, schema)).toEqual({});
    expect(parseProductAttributes('[]', schema)).toEqual({});
  });
});

describe('the narrowings a page can actually offer', () => {
  const schema = fields(
    field(),
    field({ key: 'ml', label: 'الحجم', kind: 'number', options: [], unit: 'مل' }),
    field({ key: 'made', label: 'المكوّنات', kind: 'text', options: [] })
  );
  const P = (attributes: Record<string, unknown>) => ({ attributes: attributes as never });

  it('offers only the options some product carries', () => {
    const facets = facetsFor(schema, [P({ size: 'صغير' }), P({ size: 'كبير' })]);
    expect(facets[0].options.map((o) => o.value)).toEqual(['صغير', 'كبير']);
  });

  it('counts how many lead somewhere', () => {
    const facets = facetsFor(schema, [P({ size: 'صغير' }), P({ size: 'صغير' }), P({ size: 'كبير' })]);
    expect(facets[0].options).toEqual([
      { value: 'صغير', count: 2 },
      { value: 'كبير', count: 1 },
    ]);
  });

  /** A field every product answers the same way narrows nothing. */
  it('drops a narrowing that narrows nothing', () => {
    expect(facetsFor(schema, [P({ size: 'صغير' }), P({ size: 'صغير' })])).toEqual([]);
  });

  it('keeps the seller’s order, so sizes read S · M · L', () => {
    const facets = facetsFor(schema, [P({ size: 'كبير' }), P({ size: 'صغير' })]);
    expect(facets[0].options.map((o) => o.value)).toEqual(['صغير', 'كبير']);
  });

  it('gives a number the range its products actually span', () => {
    const facets = facetsFor(schema, [P({ ml: 100 }), P({ ml: 500 })]);
    expect(facets.find((f) => f.key === 'ml')?.range).toEqual({ min: 100, max: 500 });
  });

  it('drops a slider with nothing to slide between', () => {
    expect(facetsFor(schema, [P({ ml: 100 }), P({ ml: 100 })])).toEqual([]);
  });

  it('never offers prose as a narrowing', () => {
    expect(facetsFor(schema, [P({ made: 'ماء' }), P({ made: 'زيت' })])).toEqual([]);
  });
});

describe('what a narrowing lets through', () => {
  const p = { size: 'وسط', uses: ['الأطفال', 'الكبار'] };

  it('lets anything through when nothing was ticked', () => {
    expect(matchesAttributes(p, {})).toBe(true);
    expect(matchesAttributes(p, { size: [] })).toBe(true);
  });

  /** One field is «or»: somebody who ticked two sizes wants either. */
  it('takes any of the options ticked on one field', () => {
    expect(matchesAttributes(p, { size: ['صغير', 'وسط'] })).toBe(true);
    expect(matchesAttributes(p, { size: ['صغير', 'كبير'] })).toBe(false);
  });

  /** Two fields are «and»: they narrowed twice on purpose. */
  it('requires every field that was narrowed', () => {
    expect(matchesAttributes(p, { size: ['وسط'], uses: ['الأطفال'] })).toBe(true);
    expect(matchesAttributes(p, { size: ['وسط'], uses: ['الرضّع'] })).toBe(false);
  });

  it('refuses a product that answered nothing at all', () => {
    expect(matchesAttributes({}, { size: ['وسط'] })).toBe(false);
  });
});
