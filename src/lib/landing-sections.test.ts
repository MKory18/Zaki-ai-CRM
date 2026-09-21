import { describe, expect, it } from 'vitest';
import {
  parseSections, newSection, starterSections, ensureForm, landingSectionsSchema,
} from './landing-sections';

/**
 * A page that has been live for a year must keep selling after the schema
 * moves under it. So the two failure modes that matter are: a bad block
 * taking the whole page down with it, and a page losing the form that is
 * the only reason it exists.
 */

describe('stored sections', () => {
  it('drops a block that no longer validates instead of failing the page', () => {
    const good = newSection('hero');
    const parsed = parseSections(JSON.stringify([
      good,
      { id: 'x', type: 'not-a-block' },
      { id: 'y', type: 'hero', headline: 12345 }, // wrong shape
    ]));
    expect(parsed).toHaveLength(1);
    expect(parsed[0].type).toBe('hero');
  });

  it('reads a stored JSON string and a parsed array the same way', () => {
    const sections = starterSections();
    expect(parseSections(JSON.stringify(sections))).toEqual(parseSections(sections));
  });

  it('returns nothing rather than throwing on broken JSON', () => {
    expect(parseSections('{not json')).toEqual([]);
    expect(parseSections(null)).toEqual([]);
    expect(parseSections('"a string"')).toEqual([]);
  });

  it('refuses to keep two blocks with the same id', () => {
    // Duplicate ids would make React key them together and the editor edit
    // the wrong one.
    const s = newSection('benefits');
    expect(parseSections([s, { ...s }])).toHaveLength(1);
  });

  it('gives a new page a real page, not an empty canvas', () => {
    const starter = starterSections();
    expect(starter.length).toBeGreaterThan(4);
    expect(starter.some((s) => s.type === 'hero')).toBe(true);
    expect(starter.some((s) => s.type === 'form')).toBe(true);
    // And it round-trips through the server's own validation.
    expect(landingSectionsSchema.safeParse(starter).success).toBe(true);
  });
});

describe('the order form', () => {
  it('is added back when a page has none', () => {
    const withForm = ensureForm([newSection('hero')]);
    expect(withForm.some((s) => s.type === 'form' && s.enabled)).toBe(true);
  });

  it('is re-enabled rather than duplicated when it was only hidden', () => {
    const form = { ...newSection('form'), enabled: false };
    const fixed = ensureForm([newSection('hero'), form]);
    expect(fixed.filter((s) => s.type === 'form')).toHaveLength(1);
    expect(fixed.find((s) => s.type === 'form')!.enabled).toBe(true);
  });

  it('is left where it is when it is already there', () => {
    const sections = starterSections();
    expect(ensureForm(sections)).toEqual(sections);
  });
});

describe('what a block may contain', () => {
  it('refuses a block longer than the column can hold', () => {
    const s = { ...newSection('text'), body: 'x'.repeat(5000) };
    expect(landingSectionsSchema.safeParse([s]).success).toBe(false);
  });

  it('refuses a countdown longer than a day', () => {
    const s = { ...newSection('urgency'), minutes: 99999 };
    expect(landingSectionsSchema.safeParse([s]).success).toBe(false);
  });

  it('caps how many blocks one page can carry', () => {
    const many = Array.from({ length: 41 }, () => newSection('benefits'));
    expect(landingSectionsSchema.safeParse(many).success).toBe(false);
  });

  it('refuses a footer link that would run code on a public page', () => {
    const withUrl = (url: string) => {
      const s = newSection('footer') as Extract<ReturnType<typeof newSection>, { type: 'footer' }>;
      return { ...s, columns: [{ title: 'ت', links: [{ label: 'رابط', url }] }] };
    };
    for (const bad of ['javascript:alert(1)', 'data:text/html,<script>', 'vbscript:x', '//evil.com']) {
      expect(landingSectionsSchema.safeParse([withUrl(bad)]).success, bad).toBe(false);
    }
    for (const good of ['https://example.com/policy', 'http://example.com', '/terms', 'mailto:a@b.co', 'tel:+962700', '']) {
      expect(landingSectionsSchema.safeParse([withUrl(good)]).success, good).toBe(true);
    }
  });

  it('does not let an offers block carry a price', () => {
    // Money has one source. A price typed into a section would be a second.
    const s = newSection('offers');
    expect(Object.keys(s)).not.toContain('price');
  });
});
