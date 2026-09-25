import { describe, expect, it } from 'vitest';
import {
  PAGE_SEEDS,
  REQUIRED_FOR_ADS,
  missingForAds,
  pageSlugSchema,
  paragraphsOf,
  seedPagesFor,
  storePageCreateSchema,
} from './store-pages';

describe('the pages a store is born with', () => {
  it('are exactly the three an ad review asks for', () => {
    expect(PAGE_SEEDS.map((s) => s.kind).sort()).toEqual([...REQUIRED_FOR_ADS].sort());
  });

  it('carry the shop’s own name, with no placeholder left behind', () => {
    for (const page of seedPagesFor('صحة بلس')) {
      expect(page.body, page.kind).toContain('صحة بلس');
      expect(page.body, page.kind).not.toContain('{{store}}');
    }
  });

  it('are drafts — publishing a policy nobody has read puts words in the seller’s mouth', () => {
    for (const page of seedPagesFor('متجر')) expect(page.isPublished, page.kind).toBe(false);
  });

  it('say out loud that they are a skeleton to be reviewed', () => {
    // A default policy that reads as finished is worse than none: it is a
    // promise the shop never made, in the shop's name.
    for (const page of seedPagesFor('متجر')) expect(page.body, page.kind).toContain('راجع هذا النصّ');
  });

  it('do not collide: one slug each', () => {
    const slugs = PAGE_SEEDS.map((s) => s.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) expect(pageSlugSchema.safeParse(slug).success, slug).toBe(true);
  });
});

describe('what is still missing for an ad review', () => {
  it('names every one of the three that is not published', () => {
    expect(missingForAds([])).toEqual([...REQUIRED_FOR_ADS]);
  });

  it('a draft does not count as having one', () => {
    const pages = REQUIRED_FOR_ADS.map((kind) => ({ kind, isPublished: false }));
    expect(missingForAds(pages)).toEqual([...REQUIRED_FOR_ADS]);
  });

  it('is empty once all three are published', () => {
    const pages = REQUIRED_FOR_ADS.map((kind) => ({ kind, isPublished: true }));
    expect(missingForAds(pages)).toEqual([]);
  });

  it('is not satisfied by some other page being published', () => {
    expect(missingForAds([{ kind: 'ABOUT', isPublished: true }, { kind: 'CUSTOM', isPublished: true }]))
      .toEqual([...REQUIRED_FOR_ADS]);
  });
});

describe('a page is words, not markup', () => {
  it('splits on blank lines and nothing else', () => {
    expect(paragraphsOf('أولى\nسطر ثانٍ\n\nفقرة ثانية')).toEqual(['أولى\nسطر ثانٍ', 'فقرة ثانية']);
  });

  it('drops empty paragraphs rather than rendering blank space', () => {
    expect(paragraphsOf('\n\n\nنصّ\n\n\n\n')).toEqual(['نصّ']);
    expect(paragraphsOf('')).toEqual([]);
  });

  it('keeps any tags as the literal text they are — the renderer prints, never parses', () => {
    // The body reaches the page through React's text node, so this string is
    // shown, not executed. The test pins that it survives as text here too.
    expect(paragraphsOf('<script>alert(1)</script>')).toEqual(['<script>alert(1)</script>']);
  });
});

describe('what a page may be called', () => {
  it.each([['a b'], ['-x'], ['x-'], ['x_y'], [''], ['ا-ب'], ['a'.repeat(41)]])('%s is refused', (slug) => {
    expect(pageSlugSchema.safeParse(slug).success, slug).toBe(false);
  });

  it('is lower-cased rather than refused: an address has one spelling', () => {
    expect(pageSlugSchema.parse('About-Us')).toBe('about-us');
  });

  it('defaults a new page to CUSTOM and unpublished', () => {
    const parsed = storePageCreateSchema.parse({ slug: 'x-1', title: 'عنوان' });
    expect(parsed.kind).toBe('CUSTOM');
    expect(parsed.isPublished).toBe(false);
  });
});
