import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * THE SPRITE IS THE PRODUCT'S OWN GLYPHS, RENDERED — NOT COPIED.
 *
 * The studio is plain JavaScript with no bundler, so it cannot import a
 * React icon package. A second icon set would mean the two products
 * disagree about what «delete» looks like, which is the thing this package
 * exists to prevent.
 *
 * So each symbol is rendered from the very component operations draws, and
 * this re-runs that build and fails if the file on disk differs. Path data
 * copied by hand is wrong in one corner and unnoticed for a year.
 */

const PKG = join(process.cwd(), 'packages', 'zaki-ui');

function regenerate() {
  const before = readFileSync(join(PKG, 'icons.svg'), 'utf8');
  const beforeIndex = readFileSync(join(PKG, 'icons.json'), 'utf8');
  execFileSync(process.execPath, [join(PKG, 'scripts', 'build-icons.mjs')], { cwd: process.cwd(), stdio: 'pipe' });
  expect(readFileSync(join(PKG, 'icons.svg'), 'utf8')).toBe(before);
  expect(readFileSync(join(PKG, 'icons.json'), 'utf8')).toBe(beforeIndex);
  return { svg: before, index: JSON.parse(beforeIndex) };
}

describe('the icon sprite', () => {
  it('is generated, and re-running the build changes nothing', () => {
    const { svg, index } = regenerate();
    expect(svg.length).toBeGreaterThan(5000);
    expect(index.count).toBeGreaterThanOrEqual(40);
  });

  it('carries every icon the owner named, in its five groups', () => {
    const { index } = regenerate();
    const named: Record<string, string[]> = {
      state: ['check', 'close', 'error-warning', 'alert', 'information', 'loader', 'lock', 'lock-unlock'],
      nav: ['arrow-up', 'arrow-down', 'arrow-left', 'arrow-right', 'chevron-up', 'chevron-down', 'chevron-left', 'chevron-right', 'external-link', 'menu'],
      action: ['refresh', 'search', 'filter', 'settings', 'edit', 'delete', 'copy', 'download', 'upload', 'eye'],
      media: ['play', 'pause', 'stop', 'volume', 'mic', 'image', 'film', 'scissors', 'music'],
      subject: ['user', 'group', 'bar-chart', 'database', 'cloud', 'inbox', 'time', 'history', 'rocket'],
    };
    for (const [group, names] of Object.entries(named)) {
      const got = (index.groups[group] ?? []).map((i: { name: string }) => i.name);
      for (const n of names) expect(got, `${group}/${n}`).toContain(n);
    }
  });

  /**
   * AND NOTHING WAS INVENTED. An icon whose Remix name does not exist is
   * reported in `missing` and gets no symbol — a hand-drawn stand-in would
   * be the one glyph in the product that is nobody's design.
   */
  it('invents no glyph for a name the package does not have', () => {
    const { index } = regenerate();
    expect(index.missing).toEqual([]);
  });

  it('every symbol has a shape, a viewBox and a unique id', () => {
    const { svg } = regenerate();
    const symbols = [...svg.matchAll(/<symbol id="([^"]+)" viewBox="([^"]+)"[^>]*>([\s\S]*?)<\/symbol>/g)];
    expect(symbols.length).toBeGreaterThanOrEqual(40);
    const ids = new Set<string>();
    for (const [, id, viewBox, inner] of symbols) {
      expect(id.startsWith('zk-'), id).toBe(true);
      expect(viewBox, id).toBe('0 0 24 24');
      expect(inner.includes('<path'), `${id} بلا شكل`).toBe(true);
      expect(ids.has(id), `${id} مكرَّر`).toBe(false);
      ids.add(id);
    }
  });

  /**
   * ONE FILE FOR EVERY THEME. A symbol that painted a fixed colour would
   * need a second copy for the light palette, and the two would drift.
   */
  it('paints with currentColor, so one file serves every theme', () => {
    const { svg } = regenerate();
    expect(svg).toContain('fill="currentColor"');
    // No literal colour anywhere in the sprite.
    expect(svg, 'لونٌ مكتوبٌ داخل السبرايت').not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(svg).not.toMatch(/\b(?:rgb|hsl)a?\(/);
  });

  it('and says whose glyphs they are, in the file itself', () => {
    const { svg, index } = regenerate();
    expect(svg).toContain('@remixicon/react');
    expect(svg).toMatch(/Licence as the package declares it: .+\./);
    expect(index.licence).toBeTruthy();
    expect(index.fromVersion).toBeTruthy();
  });
});
