import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * A FONT'S NAME RAN AS A SCRIPT ON OUR OWN ORIGIN.
 *
 * The family name comes from the `name` table of a file a seller uploads —
 * which is to say from anywhere. The @font-face rules escaped it; the line
 * that maps `u:<key>` to the family did not (`JSON.stringify`, which keeps
 * `<` and `>`). That line goes into every landing page's <style>, written
 * raw by the server render, so a family called `x</style><script>…` closed
 * the stylesheet and ran — on the visitor's page, and in the owner's
 * preview with the owner's session.
 *
 * Found by the landing-pages audit; checked against React's server renderer,
 * which writes a <style>'s inner HTML as it is.
 */

const { findMany } = vi.hoisted(() => ({ findMany: vi.fn() }));
vi.mock('@/lib/db', () => ({ db: { storeFont: { findMany } } }));

import { groupFamilies, loadStoreFonts } from './load-store-fonts';
import { describeFont } from './store-fonts';
import { cssString } from './css-string';

const EVIL = 'x</style><script>alert(document.cookie)</script>';
const row = (family: string) => ({
  key: 'evil', label: family, family, weight: 400, italic: false, format: 'woff2', restricted: false, attestedAt: new Date(),
});

beforeEach(() => findMany.mockReset());

describe('the name in the stylesheet', () => {
  it('the family stack carries no markup, and still names the same font', () => {
    const [fam] = groupFamilies([row(EVIL)]);
    expect(fam.stack).not.toMatch(/[<>]/);
    expect(fam.stack.startsWith(cssString(EVIL))).toBe(true);
  });

  it('the page’s stylesheet cannot be closed by a family name', async () => {
    findMany.mockResolvedValue([row(EVIL)]);
    const { css } = await loadStoreFonts('s1');
    expect(css).not.toContain('</style');
    expect(css).not.toContain('<script');
    // The custom property is still there, pointing at the escaped name.
    expect(css).toContain('--store-uf-evil:');
  });

  it('an ordinary Arabic name comes through exactly as before', () => {
    const [fam] = groupFamilies([row('خط الكوكب')]);
    expect(fam.stack).toBe(`${JSON.stringify('خط الكوكب')}, system-ui, sans-serif`);
  });
});

describe('the name as it is stored', () => {
  it('markup and control characters are taken off at upload — the second guard', () => {
    const kawkab = readFileSync(join(process.cwd(), 'public', 'fonts', 'kawkab-300.woff2'));
    // A woff2 takes its family from the file name.
    const f = describeFont(kawkab, '<img src=x onerror=alert(1)>.woff2');
    expect(f.family).not.toMatch(/[<>]/);
    expect(f.label).not.toMatch(/[<>]/);
  });
});
