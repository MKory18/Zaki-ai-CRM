import { describe, expect, it } from 'vitest';
import { DEFAULT_STORE_THEME } from './store-theme';
import {
  TEMPLATE_FILE_KIND,
  TEMPLATE_FILE_VERSION,
  exportTemplate,
  importTemplate,
  stripImages,
  templateDisposition,
  templateFileName,
} from './store-template-file';

/**
 * A TEMPLATE CARRIES A SHAPE, NEVER ANOTHER COMPANY'S FILES.
 *
 * An image path belongs to the company that uploaded it, and the public
 * media route serves it only for that company's pages. Carried across, it
 * either breaks for every visitor or reaches for somebody else's file — so
 * it is stripped on the way out AND on the way in, because a file edited by
 * hand is a file nobody vouched for.
 */

const HERO = {
  id: 'h1', type: 'hero', enabled: true, headline: 'عنوان', subheadline: '',
  showPrice: false, ctaText: 'اطلب', image: '/api/media/companies/c1/products/p1/x.webp',
};

describe('images never travel', () => {
  it('is stripped from a block on the way out', () => {
    const file = exportTemplate({ name: 'صحة', theme: DEFAULT_STORE_THEME, sections: [HERO] as never });
    expect(JSON.stringify(file)).not.toContain('/api/media/');
    expect((file.sections[0] as unknown as { image: string }).image).toBe('');
  });

  it('is stripped at any depth — a slider hides them inside its items', () => {
    const nested = {
      id: 'g1', type: 'gallery', enabled: true, title: '',
      images: ['/api/media/a.webp', '/api/media/b.webp'],
      items: [{ image: '/api/media/c.webp', label: 'x' }],
      look: { background: { kind: 'image', image: '/api/media/d.webp' } },
    };
    const stripped = stripImages(nested);
    expect(JSON.stringify(stripped)).not.toContain('/api/media/');
  });

  it('keeps the SHAPE of the field, so a block does not meet an undefined', () => {
    const stripped = stripImages({ image: '/api/media/a.webp', images: ['/api/media/b.webp'] });
    expect(stripped.image).toBe('');
    expect(stripped.images).toEqual([]);
  });

  it('and again on the way in, for a file that was edited by hand', () => {
    const smuggled = {
      kind: TEMPLATE_FILE_KIND,
      version: 1,
      name: 'x',
      theme: { ...DEFAULT_STORE_THEME },
      sections: [HERO],
    };
    const result = importTemplate(smuggled);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(JSON.stringify(result.sections)).not.toContain('/api/media/');
  });

  it('leaves the words and the shape alone', () => {
    const file = exportTemplate({ name: 'صحة', theme: DEFAULT_STORE_THEME, sections: [HERO] as never });
    expect((file.sections[0] as unknown as { headline: string }).headline).toBe('عنوان');
    expect(file.sections[0].type).toBe('hero');
  });
});

describe('a file off a disk is a stranger', () => {
  it.each([
    ['not json at all'],
    ['{"kind":"something-else","version":1}'],
    ['{}'],
    ['[]'],
    ['null'],
  ])('%s is refused', (raw) => {
    const result = importTemplate(raw);
    expect(result.ok).toBe(false);
  });

  it('a newer version says so rather than guessing', () => {
    const result = importTemplate({
      kind: TEMPLATE_FILE_KIND, version: TEMPLATE_FILE_VERSION + 1,
      name: '', theme: DEFAULT_STORE_THEME, sections: [],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('أحدث');
  });

  it('a wrong kind is named as such', () => {
    const result = importTemplate({ kind: 'zaki.something-else', version: 1 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('ليس ملف قالب متجر');
  });

  it('refuses a block type the system does not have — rather than half-applying', () => {
    const result = importTemplate({
      kind: TEMPLATE_FILE_KIND, version: 1, name: 'x',
      theme: DEFAULT_STORE_THEME,
      sections: [{ id: 'x', type: 'run-my-code', enabled: true }],
    });
    expect(result.ok).toBe(false);
  });

  it('refuses a theme with a colour that is not one', () => {
    const result = importTemplate({
      kind: TEMPLATE_FILE_KIND, version: 1, name: 'x',
      theme: { ...DEFAULT_STORE_THEME, accent: 'javascript:alert(1)' },
      sections: [],
    });
    expect(result.ok).toBe(false);
  });

  it('accepts one this system wrote', () => {
    const file = exportTemplate({ name: 'صحة بلس', theme: DEFAULT_STORE_THEME, sections: [HERO] as never });
    const back = importTemplate(JSON.parse(JSON.stringify(file)));
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(back.name).toBe('صحة بلس');
    expect(back.sections).toHaveLength(1);
  });
});

describe('the file a seller downloads', () => {
  it('says what it is and when it was made', () => {
    const file = exportTemplate({ name: 'x', theme: DEFAULT_STORE_THEME, sections: [] });
    expect(file.kind).toBe(TEMPLATE_FILE_KIND);
    expect(file.version).toBe(TEMPLATE_FILE_VERSION);
    expect(Number.isNaN(Date.parse(file.exportedAt))).toBe(false);
  });

  it('has a name the seller will recognise a week later', () => {
    const name = templateFileName('صحة بلس');
    expect(name).toContain('صحة بلس');
    expect(name.endsWith('.zaki-template.json')).toBe(true);
  });

  it('cannot be given a filename that escapes its folder', () => {
    expect(templateFileName('../../etc/passwd')).not.toContain('/');
    expect(templateFileName('a"b;rm -rf')).not.toMatch(/["';]/);
  });

  it('survives an Arabic shop name in the header, which is every shop', () => {
    // An HTTP header value is latin-1. Putting «صحة بلس» in one throws, and
    // that took the whole export down rather than one shop's.
    const header = templateDisposition('صحة بلس');
    expect(() => new Headers({ 'Content-Disposition': header })).not.toThrow();
    // The real name still travels, percent-encoded, beside an ASCII fallback.
    expect(header).toContain("filename*=UTF-8''");
    expect(header).toContain(encodeURIComponent('صحة بلس'));
    expect(header).toMatch(/^attachment; filename="[\x20-\x7E]*"/);
  });

  it('still has a usable fallback when the name is entirely non-latin', () => {
    const header = templateDisposition('متجر');
    const ascii = /filename="([^"]*)"/.exec(header)![1];
    expect(ascii.length).toBeGreaterThan(0);
    expect(() => new Headers({ 'Content-Disposition': header })).not.toThrow();
  });
});
