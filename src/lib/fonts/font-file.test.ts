import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { readFontFacts, detectFontFormat, looksRestricted } from './font-file';
import { describeFont, fontKey, weightFromFileName, familyFromFileName, fontFaceCss, MAX_FONT_BYTES } from './store-fonts';

/**
 * Read against real files where there are real files to read.
 *
 * Kawkab ships in this repository, so the OFL path is tested against an
 * actual font rather than a fixture somebody wrote to match the code. The
 * restricted families are licensed for one machine and are not in git, so
 * those cases are skipped when absent rather than faked — a test that
 * passes on a stand-in of your own making proves nothing about a real file.
 */

const KAWKAB = join(process.cwd(), 'public', 'fonts', 'kawkab-300.woff2');
const LOCAL = join(process.cwd(), 'fonts-local');

describe('what a file is', () => {
  it('reads the format from the first four bytes, not the extension', () => {
    expect(detectFontFormat(readFileSync(KAWKAB))).toBe('woff2');
  });

  it('refuses anything that is not a font', () => {
    expect(detectFontFormat(Buffer.from('PK\u0003\u0004 a zip, renamed'))).toBeNull();
    expect(detectFontFormat(Buffer.from('<!doctype html>'))).toBeNull();
    expect(detectFontFormat(Buffer.alloc(0))).toBeNull();
    expect(detectFontFormat(Buffer.from([0x89, 0x50, 0x4e, 0x47]))).toBeNull(); // png
  });

  it('never throws on a truncated or hostile file', () => {
    const real = readFileSync(KAWKAB);
    for (const cut of [4, 8, 64, 512, real.length - 1]) {
      expect(() => readFontFacts(real.subarray(0, cut))).not.toThrow();
    }
    // A directory claiming thousands of tables, and offsets past the end.
    const lying = Buffer.alloc(64);
    lying.writeUInt32BE(0x00010000, 0);
    lying.writeUInt16BE(0xffff, 4);
    expect(() => readFontFacts(lying)).not.toThrow();
  });
});

describe('describing an upload', () => {
  it('rejects a file that is not a font, in words the seller can act on', () => {
    expect(() => describeFont(Buffer.from('not a font at all'), 'x.woff2')).toThrow(/ليس خطاً/);
  });

  it('rejects an empty file and one over the cap', () => {
    expect(() => describeFont(Buffer.alloc(0), 'x.woff2')).toThrow(/فارغ/);
    const huge = Buffer.alloc(MAX_FONT_BYTES + 1);
    huge.writeUInt32BE(0x774f4632, 0);
    expect(() => describeFont(huge, 'x.woff2')).toThrow(/الحد المسموح/);
  });

  it('falls back to the filename for a woff2, whose tables are compressed', () => {
    const f = describeFont(readFileSync(KAWKAB), 'kawkab-light.woff2');
    expect(f.format).toBe('woff2');
    // The name comes from the file's own name, tidied and with the weight
    // taken off — a file is a face, and the seller is picking a family.
    expect(f.label).toBe('kawkab');
    expect(f.weight).toBe(300);
  });

  it('reads family, weight and licence out of an uncompressed file', () => {
    // Any otf/ttf in fonts-local will do; skip when the folder is empty.
    if (!existsSync(LOCAL)) return;
    const { readdirSync } = require('node:fs') as typeof import('node:fs');
    const file = readdirSync(LOCAL).find((n) => /\.(otf|ttf)$/i.test(n));
    if (!file) return;
    const f = describeFont(readFileSync(join(LOCAL, file)), file);
    expect(f.family.length).toBeGreaterThan(0);
    expect(f.weight).toBeGreaterThanOrEqual(100);
    expect(f.weight).toBeLessThanOrEqual(900);
  });
});

describe('weights', () => {
  it('reads the weight a filename implies', () => {
    expect(weightFromFileName('Font-Light.woff2')).toBe(300);
    expect(weightFromFileName('Font-Bold.woff2')).toBe(700);
    expect(weightFromFileName('Font-Black.woff2')).toBe(900);
    expect(weightFromFileName('Font-Medium.woff2')).toBe(500);
    expect(weightFromFileName('Font-900.woff2')).toBe(900);
    expect(weightFromFileName('Font.woff2')).toBeNull();
  });

  it('does not read "extra bold" as "bold"', () => {
    expect(weightFromFileName('Font-ExtraBold.woff2')).toBe(800);
    expect(weightFromFileName('Font-ExtraLight.woff2')).toBe(200);
    expect(weightFromFileName('Font-SemiBold.woff2')).toBe(600);
  });
});

describe('keys', () => {
  it('slugs a latin family name', () => {
    expect(fontKey('thmanyah sans', 'x.woff2')).toBe('thmanyah-sans');
    expect(fontKey('IBM Plex Sans Arabic', 'x')).toBe('ibm-plex-sans-arabic');
  });

  it('gives an Arabic-named family a stable key of its own', () => {
    // An Arabic name slugs to nothing. Two different names must still get
    // two different keys — a shared constant would have the second upload
    // overwrite the first.
    const a = fontKey('خمسة', 'a.otf');
    const b = fontKey('ثمانية', 'b.otf');
    expect(a).toMatch(/^f-[0-9a-f]{10}$/);
    expect(a).not.toBe(b);
    expect(fontKey('خمسة', 'anything-else.otf')).toBe(a); // stable
  });

  it('produces something usable in a URL and a CSS identifier', () => {
    for (const name of ['خمسة', 'Font/../..', 'a b c', '!!!', 'Ω']) {
      expect(fontKey(name, 'f.otf')).toMatch(/^[a-z0-9-]{1,43}$/);
    }
  });
});

describe('the stylesheet we write from an uploaded name', () => {
  // These values arrive from the `name` table of a file a seller uploaded,
  // which is to say from anywhere. The rule is written into a <style> tag,
  // so there are two ways out of it and both have to be shut.
  const build = (family: string, url = '/api/store-fonts/s/k-400n.woff2') =>
    fontFaceCss([{ family, key: 'k', weight: 400, italic: false, format: 'woff2' }], () => url);

  it('cannot be escaped by ending the CSS string', () => {
    const css = build('x"; } body { display:none } @font-face { font-family: "y');
    // The quote is escaped, so what looks like the end of the string is not.
    expect(css).toContain('\\"');
    // And the rule still opens exactly once.
    expect(css.match(/@font-face\{/g)).toHaveLength(1);
  });

  it('cannot be escaped by ending the style TAG, which the CSS never stops', () => {
    // The real way out: a family name is a valid CSS string and still ends
    // the element the moment the HTML parser reads `</style`.
    const css = build('</style><img src=x onerror=alert(1)>');
    expect(css.toLowerCase()).not.toContain('</style');
    expect(css).not.toContain('<img');
    expect(css).toContain('\\3c ');
  });

  it('shuts the same door on the url', () => {
    const css = build('F', '</style><script>x</script>');
    expect(css.toLowerCase()).not.toContain('</style');
    expect(css.toLowerCase()).not.toContain('<script');
  });

  it('writes a number for the weight even if one arrives as text', () => {
    const css = fontFaceCss(
      [{ family: 'F', key: 'k', weight: '700; } body{}' as unknown as number, italic: false, format: 'woff2' }],
      () => '/f.woff2'
    );
    expect(css).toContain('font-weight:400;'); // unparseable falls back
    expect(css).not.toContain('body{}');
  });
});

describe('what the designer wrote', () => {
  it('treats an OFL notice as permitting exactly this', () => {
    expect(
      looksRestricted({
        copyright: 'Copyright (c) 2015, Someone, with Reserved Font Name X. All Rights Reserved.',
        licence: 'This Font Software is licensed under the SIL Open Font License, Version 1.1.',
        licenceUrl: 'http://scripts.sil.org/OFL',
        family: 'X', fullName: 'X', weight: 400, italic: false, format: 'ttf',
      })
    ).toBe(false);
  });

  it('flags a licence that limits use to one workstation', () => {
    expect(
      looksRestricted({
        copyright: 'Copyright (c) A Foundry, 2015. All rights reserved.',
        licence: 'your use of this software is limited to your workstation. You may not copy or distribute this software.',
        licenceUrl: '', family: 'X', fullName: 'X', weight: 400, italic: false, format: 'ttf',
      })
    ).toBe(true);
  });

  it('flags one that says personal use only', () => {
    expect(
      looksRestricted({
        copyright: '', licence: 'Free for personal use. Commercial use requires a licence.',
        licenceUrl: '', family: 'X', fullName: 'X', weight: 400, italic: false, format: 'ttf',
      })
    ).toBe(true);
  });

  it('says nothing about a file that says nothing', () => {
    // Silence is not permission, but it is not a warning either — claiming
    // otherwise would put an amber box on every woff2, which is every file
    // whose tables we cannot read, which would teach the seller to ignore it.
    expect(
      looksRestricted({
        copyright: '', licence: '', licenceUrl: '',
        family: '', fullName: '', weight: 400, italic: false, format: 'woff2',
      })
    ).toBe(false);
  });
});

/**
 * FIVE FILES ARE ONE FAMILY.
 *
 * A woff2 keeps its tables compressed, so the family name has to come from
 * the filename — and `thmanyah sans-Bold.woff2` names a face, not a family.
 * Leaving the weight on gave every file a family of its own: a seller
 * uploaded five weights and the picker offered five fonts, each stuck at one
 * weight, none of which could go bold.
 */
describe('the family a filename implies', () => {
  it('takes the weight off the end', () => {
    expect(familyFromFileName('thmanyah sans-Bold.woff2')).toBe('thmanyah sans');
    expect(familyFromFileName('kawkab-Light.woff2')).toBe('kawkab');
    expect(familyFromFileName('Cairo-ExtraBold.ttf')).toBe('Cairo');
    expect(familyFromFileName('Tajawal-900.woff2')).toBe('Tajawal');
    expect(familyFromFileName('X-Italic.otf')).toBe('X');
  });

  it('groups a whole family under one name', () => {
    const names = ['F-Light.woff2', 'F-Regular.woff2', 'F-Medium.woff2', 'F-Bold.woff2', 'F-Black.woff2'];
    expect(new Set(names.map(familyFromFileName)).size).toBe(1);
  });

  it('leaves a name that only looks like a weight alone', () => {
    // "Delight" contains "light" and is not a light weight. Without the word
    // boundary this returned "De".
    expect(familyFromFileName('Delight.woff2')).toBe('Delight');
    expect(familyFromFileName('Blackberry.woff2')).toBe('Blackberry');
    expect(familyFromFileName('Bookman.ttf')).toBe('Bookman');
  });

  it('keeps every weight of a family on one key', () => {
    const keys = ['F-Light.woff2', 'F-Bold.woff2', 'F-Black.woff2'].map((n) =>
      describeFont(readFileSync(KAWKAB), n).key
    );
    expect(new Set(keys).size).toBe(1);
  });

  it('still reads each file as its own weight', () => {
    const w = ['F-Light.woff2', 'F-Bold.woff2', 'F-Black.woff2'].map((n) =>
      describeFont(readFileSync(KAWKAB), n).weight
    );
    expect(w).toEqual([300, 700, 900]);
  });
});
