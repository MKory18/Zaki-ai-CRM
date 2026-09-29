import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * THE FACES TRAVEL WITH THE PACKAGE.
 *
 * The studio runs on the owner's laptop and is expected to work with the
 * internet off. A stylesheet that reaches Google Fonts renders that
 * promise false on exactly the day it matters, and it fails in the most
 * confusing way available: the layout is right, the text is readable, and
 * the letterforms are simply somebody else's.
 *
 * These tests do not re-run the builder — it reads `.next`, which is a
 * build artefact and not always present. They check the shipped result.
 */

const PKG = join(process.cwd(), 'packages', 'zaki-ui');
const css = () => readFileSync(join(PKG, 'fonts.css'), 'utf8');

describe('the packaged fonts', () => {
  it('reaches no network at all', () => {
    const src = css();
    expect(src.length).toBeGreaterThan(500);
    for (const forbidden of ['http://', 'https://fonts.', '//fonts.googleapis', '@import']) {
      // The licence URL in the header comment is the one allowed mention,
      // so the check is on the `src:` lines rather than the whole file.
      const srcLines = src.split('\n').filter((l) => l.includes('src:'));
      expect(srcLines.join('\n'), forbidden).not.toContain(forbidden);
    }
    expect(src).toMatch(/src: url\('\.\/fonts\/[^']+\.woff2'\) format\('woff2'\);/);
  });

  it('every face it declares is a file that is actually here', () => {
    const files = [...css().matchAll(/url\('\.\/([^']+)'\)/g)].map((m) => m[1]);
    expect(files.length).toBeGreaterThanOrEqual(4);
    for (const f of files) {
      const p = join(PKG, f);
      expect(existsSync(p), f).toBe(true);
      expect(statSync(p).size, f).toBeGreaterThan(1000);
    }
  });

  /**
   * THE RANGE IS THE FILE'S OWN, NOT A BLOCK COPIED OFF A WEBSITE.
   *
   * A wrong `unicode-range` is the worst font bug there is: the browser
   * downloads the file, decides it covers nothing it needs, and falls back
   * silently. The Arabic cut must claim Arabic, and the Latin cut must not.
   */
  it('claims the codepoints each file really carries', () => {
    const faces = [...css().matchAll(/url\('\.\/fonts\/([^']+)'\)[\s\S]*?unicode-range: ([^;]+);/g)];
    expect(faces.length).toBeGreaterThanOrEqual(4);
    for (const [, file, range] of faces) {
      expect(range.length, file).toBeGreaterThan(20);
      const arabic = /U\+06[0-9A-F]{2}/.test(range);
      // The SUFFIX, not `includes`: every file here is called
      // «ibm-plex-sans-arabic-…», so the latin cut contains «-arabic» too.
      // The first version of this test read that and failed, correctly.
      if (/-arabic\.woff2$/.test(file)) expect(arabic, `${file} لا يدّعي العربيّة`).toBe(true);
      if (/-latin\.woff2$/.test(file)) expect(arabic, `${file} يدّعي العربيّة وهو لاتينيّ`).toBe(false);
    }
  });

  it('carries the two weights that were asked for, and no others', () => {
    const weights = [...css().matchAll(/font-weight: (\d+);/g)].map((m) => Number(m[1]));
    expect([...new Set(weights)].sort()).toEqual([400, 600]);
  });

  /**
   * AND IT SAYS WHAT IS MISSING BEFORE THIS MAY BE SHIPPED.
   *
   * Both licences require their full text to travel with the files, and no
   * copy of either is on this machine. Writing one from memory is not a
   * licence, so the gap is recorded instead of papered over.
   */
  it('states its licences, and that their text is not here yet', () => {
    const fonts = readFileSync(join(PKG, 'fonts', 'LICENSE.md'), 'utf8');
    expect(fonts).toContain('scripts.sil.org/OFL');
    expect(fonts).toContain('OFL.txt');

    const all = readFileSync(join(PKG, 'LICENSES.md'), 'utf8');
    // The first discovery table said Apache 2.0. The package declares
    // otherwise, and the correction is part of the record.
    expect(all).toContain('Remix Icon License 1.0');
    expect(all).toContain('Apache');
    expect(all).toContain('لا للنشر');
  });
});
