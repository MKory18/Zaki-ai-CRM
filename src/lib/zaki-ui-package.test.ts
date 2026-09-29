import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * THE PROMISES THE PACKAGE MAKES ABOUT ITSELF.
 *
 * Every one of these is a promise a consumer cannot check on their own:
 * the studio will not discover that a colour was hard-coded, or that a
 * stylesheet reaches a CDN, until it is on a laptop with the internet off
 * in front of a customer. So they are checked here, on every run.
 */

const PKG = join(process.cwd(), 'packages', 'zaki-ui');
const read = (f: string) => readFileSync(join(PKG, f), 'utf8');

/**
 * A GUARD THAT READS ITS OWN SUBJECT'S PROSE FAILS ON THE PROSE.
 *
 * This has happened four times in this repository, and it happened again
 * on the first run of this file: `components.css` explains in a comment
 * that it must contain no `rgb(` and no bare `px`, and the guard found
 * both — in that sentence.
 *
 * Comments are blanked rather than deleted, so the line count survives and
 * any line number still points at the right line.
 */
const code = (f: string) =>
  read(f).replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));

/** Everything the package ships as text. */
const TEXT_FILES = ['tokens.css', 'fonts.css', 'components.css', 'shell.css', 'components.js', 'shell.js', 'demo.html'];

/** Only the token file may hold raw design values — that is what it is. */
const AUTHORED_CSS = ['components.css', 'shell.css'];

describe('no design value is written outside the tokens', () => {
  it('holds no hex, rgb or hsl colour', () => {
    for (const f of [...AUTHORED_CSS, 'components.js', 'shell.js']) {
      const src = code(f);
      expect(src.match(/#[0-9a-fA-F]{3,8}\b/g), `${f}: لونٌ مكتوب`).toBeNull();
      // `color-mix(in srgb, …)` names a colour SPACE, not a colour — its
      // arguments are tokens. The check is for a written colour value.
      expect(src.match(/(?<![a-z])(?:rgba?|hsla?)\(/g), `${f}: لونٌ مكتوب`).toBeNull();
    }
  });

  /**
   * AND NO PIXEL EXCEPT 0 AND 1.
   *
   * One pixel is the device hairline — a border, an outline, the one-pixel
   * dip a button makes when pressed. It is not a design token in any
   * system, and naming it would be naming the concept «a line». Every
   * other length comes from the scale.
   */
  it('holds no pixel length except 0 and 1', () => {
    for (const f of AUTHORED_CSS) {
      /*
       * BREAKPOINTS ARE EXEMPT, AND NOT AS A FAVOUR: a custom property is
       * INVALID inside a media query condition. `@media (max-width:
       * var(--zk-…))` works in no browser, so a breakpoint cannot be a
       * token however much one would like it to be.
       */
      const body = code(f).replace(/@media[^{]*\{/g, '@media {');
      const found = [...body.matchAll(/(?<![\w-])(\d+(?:\.\d+)?)px/g)].map((m) => m[1]);
      const bad = [...new Set(found.filter((v) => v !== '0' && v !== '1'))];
      expect(bad, `${f}: أطوالٌ بالبكسل خارج السلّم: ${bad.join(', ')}`).toEqual([]);
    }
  });

  it('and every --zk- it uses is one tokens.css defines', () => {
    const defined = new Set([...read('tokens.css').matchAll(/(--zk-[a-z0-9-]+)\s*:/g)].map((m) => m[1]));
    expect(defined.size).toBeGreaterThan(60);
    for (const f of [...AUTHORED_CSS, 'demo.html']) {
      const used = new Set([...read(f).matchAll(/var\((--zk-[a-z0-9-]+)/g)].map((m) => m[1]));
      const missing = [...used].filter((t) => !defined.has(t));
      expect(missing, `${f}: رموزٌ غيرُ معرَّفة: ${missing.join(', ')}`).toEqual([]);
    }
  });
});

describe('the package is self-contained', () => {
  it('names no token from the product', () => {
    for (const f of TEXT_FILES) expect(read(f), f).not.toContain('--sys-');
  });

  /**
   * AND REACHES NO NETWORK.
   *
   * The studio is expected to work with the internet off. The two allowed
   * mentions of a URL are both DATA rather than requests: the licence URL
   * read out of the font binaries, and the studio's own address shown in
   * the demo's app switcher — which is the thing being probed, not fetched
   * at load.
   */
  it('fetches nothing at load', () => {
    for (const f of TEXT_FILES) {
      const src = read(f);
      expect(src, `${f}: @import عبر الشبكة`).not.toMatch(/@import\s+url\(\s*['"]?https?:/);
      expect(src, `${f}: خطٌّ من Google`).not.toContain('fonts.googleapis');
      expect(src, `${f}: خطٌّ من CDN`).not.toContain('fonts.gstatic');
      for (const m of src.matchAll(/https?:\/\/[^\s'")]+/g)) {
        const url = m[0];
        const allowed =
          url.includes('scripts.sil.org') ||
          url.includes('www.w3.org') ||
          url.startsWith('http://localhost:8000');
        expect(allowed, `${f}: عنوانٌ غيرُ مسموح — ${url}`).toBe(true);
      }
    }
  });

  it('and every path it does use is relative', () => {
    for (const m of read('fonts.css').matchAll(/url\(([^)]+)\)/g)) {
      expect(m[1].replace(/['"]/g, '').startsWith('./'), m[1]).toBe(true);
    }
  });
});

/**
 * RTL IS THE DEFAULT, SO THERE IS NO SECOND STYLESHEET.
 *
 * A package that writes `margin-left` needs a mirrored copy for the other
 * direction, and the mirrored copy is always the one that goes stale. The
 * logical properties mean one rule serves both, and the demo's direction
 * switch is how that gets noticed when it is wrong.
 */
describe('direction is a property, not a copy', () => {
  const PHYSICAL = /(?<![\w-])(margin|padding|border|inset)-(left|right)\s*:|(?<![\w-])(left|right)\s*:/g;

  it('writes no physical left or right', () => {
    for (const f of AUTHORED_CSS) {
      const bad = [...read(f).matchAll(PHYSICAL)].map((m) => m[0].trim());
      expect(bad, `${f}: خصائصُ اتّجاهٍ فيزيائيّة: ${bad.join(', ')}`).toEqual([]);
    }
  });

  it('and the 360px rule is structural, not a media query patch', () => {
    // The one line that stops a long table pushing the page sideways.
    const shell = read('shell.css');
    expect(shell).toMatch(/min-inline-size: 0;/);
    expect(shell).toMatch(/overflow-x: hidden;/);
  });
});

/**
 * CONTRAST, MEASURED — not asserted in a comment.
 *
 * 4.5:1 is the readable-text bar and 3:1 the one for a control's boundary.
 * A package that shipped a palette failing these would be handing the
 * studio an accessibility problem it did not write and cannot see.
 */
describe('contrast across the three palettes', () => {
  const srgb = (c: number) => (c / 255 <= 0.04045 ? c / 255 / 12.92 : (((c / 255) + 0.055) / 1.055) ** 2.4);
  const lum = (hex: string) => {
    const h = hex.replace('#', '');
    const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h;
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
    return 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b);
  };
  const ratio = (a: string, b: string) => {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  };

  const tokens = JSON.parse(read('tokens.json'));
  const resolve = (theme: Record<string, string>, name: string): string => {
    const v = theme[name];
    const ref = v?.match(/^var\(--zk-([a-z0-9-]+)\)$/);
    return ref ? resolve(theme, ref[1]) : v;
  };

  const PAIRS: [string, string, number][] = [
    ['color-text', 'color-surface-page', 4.5],
    ['color-text', 'color-surface-card', 4.5],
    ['color-text-heading', 'color-surface-card', 4.5],
    ['color-text-muted', 'color-surface-card', 4.5],
    ['color-brand-on', 'color-brand', 4.5],
    ['color-border-input', 'color-surface-card', 3],
  ];

  for (const [name, theme] of Object.entries(tokens.themes as Record<string, { tokens: Record<string, string> }>)) {
    for (const [fg, bg, min] of PAIRS) {
      it(`${name}: ${fg} on ${bg} clears ${min}:1`, () => {
        const got = ratio(resolve(theme.tokens, fg), resolve(theme.tokens, bg));
        expect(Math.round(got * 100) / 100, `${name} ${fg}/${bg}`).toBeGreaterThanOrEqual(min);
      });
    }
  }
});

describe('the shippable folder', () => {
  const dist = join(PKG, 'dist');

  it('builds, and holds every file the brief names', () => {
    execFileSync(process.execPath, [join(PKG, 'scripts', 'build-dist.mjs')], { cwd: process.cwd(), stdio: 'pipe' });
    for (const f of [
      'tokens.css', 'tokens.json', 'fonts.css', 'icons.svg', 'icons.json',
      'components.css', 'components.js', 'shell.css', 'shell.js',
      'zaki-ui.all.css', 'zaki-ui.all.js', 'demo.html', 'VERSION',
      'README.md', 'CHANGELOG.md', 'LICENSES.md', 'DECISIONS.md',
    ]) {
      expect(existsSync(join(dist, f)), f).toBe(true);
    }
    const fonts = readdirSync(join(dist, 'fonts')).filter((f) => f.endsWith('.woff2'));
    expect(fonts.length, 'أربعةُ أوزانٍ × مقطعان').toBe(8);
  });

  /**
   * THE DEMO OPENS WITH NO SERVER — which is why the sprite is inlined and
   * the script is not a module. Both are easy to undo by accident.
   */
  it('and its demo needs no server', () => {
    const demo = readFileSync(join(dist, 'demo.html'), 'utf8');
    expect(demo, 'السبرايت لم يُضمَّن').toContain('<symbol id="zk-check"');
    // The tag, not the sentence in the page that explains why there is
    // no such tag.
    expect(demo, 'سكربتٌ نمطيٌّ لا يعمل فوق file://').not.toMatch(/<script[^>]*type="module"/);
    expect(demo).toContain('src="zaki-ui.all.js"');
  });

  it('and the one bundle carries both scripts with no import left in it', () => {
    const all = readFileSync(join(dist, 'zaki-ui.all.js'), 'utf8');
    expect(all).not.toMatch(/^import\s/m);
    expect(all).not.toMatch(/^export\s/m);
    expect(all).toContain('global.zk =');
    for (const fn of ['openModal', 'toast', 'tabs', 'dropdown', 'probe']) expect(all).toContain(fn);
  });

  /**
   * AND THE README POINTS AT NOTHING THAT IS NOT IN THE BOX.
   *
   * The usage page is the first file anyone opens and the only one whose
   * links nobody re-checks. One row of its table already named a file that
   * is deliberately NOT shipped — a document about the operations app, not
   * about the package — and a reader following it would have found an
   * empty folder and concluded the archive was incomplete.
   */
  it('and its readme names no file the folder lacks', () => {
    const readme = readFileSync(join(dist, 'README.md'), 'utf8');
    const named = new Set(
      [...readme.matchAll(/`([A-Za-z][\w.-]*\.(?:css|js|json|md|html|svg))`/g)].map((m) => m[1]),
    );
    // `VERSION` has no extension, and the bare names below are prose, not
    // files: the check is for the ones that LOOK like a path.
    const missing = [...named].filter((f) => !existsSync(join(dist, f)));
    expect(missing, `الدليلُ يشير إلى ملفّاتٍ غيرِ مشحونة: ${missing.join(', ')}`).toEqual([]);
    expect(named.size, 'الدليلُ لا يسمّي شيئاً — هل فُرِّغ؟').toBeGreaterThan(8);
  });

  it('and the zip holds the same files', () => {
    execFileSync('python', [join(PKG, 'scripts', 'pack.py')], { cwd: process.cwd(), stdio: 'pipe' });
    const version = read('VERSION').trim();
    const zip = join(dist, `zaki-ui-${version}.zip`);
    expect(existsSync(zip), zip).toBe(true);
    expect(statSync(zip).size).toBeGreaterThan(100_000);
    // The listing, read out of the archive's own central directory.
    const names = readFileSync(zip).toString('latin1');
    for (const f of ['zaki-ui/demo.html', 'zaki-ui/zaki-ui.all.css', 'zaki-ui/tokens.css', 'zaki-ui/icons.svg']) {
      expect(names.includes(f), f).toBe(true);
    }
  });
});
