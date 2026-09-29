import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * CONTRAST, MEASURED, IN EVERY THEME.
 *
 * «Contrast: 4.5:1 for every text pair in all four themes.» The palette
 * is one file, so the answer is arithmetic — and arithmetic nobody has
 * run is the same as a rule nobody has.
 *
 * THERE ARE THREE THEMES, NOT FOUR. `ops`, `day` and `calm` carry
 * colours; `auto` carries none of its own — it follows the operating
 * system and resolves to one of the other two. Four is the count of
 * choices in the picker, not of palettes.
 *
 * Every text pair passes. This is here so that stays true: a colour gets
 * changed for how it looks on one screen, and nothing else in a codebase
 * objects.
 */

const root = process.cwd();
const css = readFileSync(join(root, 'src/app/(system)/system.css'), 'utf8');

function themes(): Map<string, Map<string, string>> {
  const out = new Map<string, Map<string, string>>();
  const re = /(?:^|\n)(?::root,\s*)?\[data-sys-theme='([a-z]+)'\]\s*\{([\s\S]*?)\n\}/g;
  for (const m of css.matchAll(re)) {
    const vars = new Map<string, string>();
    for (const v of m[2].matchAll(/--sys-([a-z0-9-]+)\s*:\s*([^;]+);/g)) vars.set(v[1], v[2].trim());
    if (vars.size > 0) out.set(m[1], vars);
  }
  return out;
}

const srgb = (c: number) => (c / 255 <= 0.04045 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4);
function lum(hex: string): number {
  const h = hex.replace('#', '').trim();
  const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
  return 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b);
}
function contrast(a: string, b: string): number {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return Math.round(((x + 0.05) / (y + 0.05)) * 100) / 100;
}

function resolve(vars: Map<string, string>, name: string, depth = 0): string | null {
  const v = vars.get(name);
  if (!v || depth > 6) return null;
  const ref = v.match(/^var\(--sys-([a-z0-9-]+)\)$/);
  if (ref) return resolve(vars, ref[1], depth + 1);
  return /^#[0-9a-fA-F]{3,8}$/.test(v) ? v : null;
}

/** Text, and what it sits on. */
const TEXT_PAIRS: [string, string][] = [
  ['foreground', 'background'],
  ['foreground', 'card'],
  ['foreground', 'surface'],
  ['heading', 'card'],
  ['muted-foreground', 'card'],
  ['muted-foreground', 'surface'],
  ['muted', 'card'],
  ['primary', 'card'],
  ['destructive', 'card'],
  ['success', 'card'],
  ['warning', 'card'],
  ['primary-foreground', 'primary'],
];

describe('every text pair clears 4.5:1, in every theme', () => {
  it('found the palettes — a sweep over nothing proves nothing', () => {
    expect([...themes().keys()].sort()).toEqual(['calm', 'day', 'ops']);
    for (const vars of themes().values()) expect(vars.size).toBeGreaterThan(30);
  });

  for (const [theme, vars] of themes()) {
    for (const [fg, bg] of TEXT_PAIRS) {
      it(`${theme}: ${fg} on ${bg}`, () => {
        const a = resolve(vars, fg);
        const b = resolve(vars, bg);
        expect(a, `${theme}: --sys-${fg} غيرُ معرَّف`).toBeTruthy();
        expect(b, `${theme}: --sys-${bg} غيرُ معرَّف`).toBeTruthy();
        expect(contrast(a!, b!), `${theme} ${fg}/${bg}`).toBeGreaterThanOrEqual(4.5);
      });
    }
  }
});

/**
 * AND THE BOUNDARY OF A CONTROL — 3:1, WHICH THE DIVIDER IS NOT.
 *
 * WCAG 1.4.11 asks 3:1 for the edge of something a person OPERATES. Every
 * field in the product drew its edge with `--sys-border`, and measured on
 * this palette that is 1.48 in ops, 1.25 in day and 1.29 in calm — at
 * 1.25 the box is found with the cursor rather than with the eye.
 *
 * Fixed with the owner's word, the same way the zaki-ui package was: a
 * token of its own pointing at the faintest TEXT colour, which is the only
 * colour already in these palettes that clears 3:1 in all three. Nothing
 * new was invented, so nothing new can drift.
 *
 * `--sys-border` IS DELIBERATELY LEFT WHERE IT WAS. It divides two
 * paragraphs, and a divider that clears 3:1 pulls the eye to the furniture
 * instead of the content. The rule is about controls.
 */
describe('the boundary of a control clears 3:1', () => {
  for (const [theme, vars] of themes()) {
    it(`${theme}: --sys-border-input on --sys-card`, () => {
      const input = resolve(vars, 'border-input');
      const card = resolve(vars, 'card');
      expect(input, `${theme}: --sys-border-input غيرُ معرَّف`).toBeTruthy();
      expect(contrast(input!, card!), `${theme} border-input/card`).toBeGreaterThanOrEqual(3);
    });

    it(`${theme}: and the divider stays below it, on purpose`, () => {
      // Not an oversight. If this ever passes 3, somebody changed the
      // decision without changing the paragraph above it.
      const border = resolve(vars, 'border')!;
      const card = resolve(vars, 'card')!;
      expect(contrast(border, card), `${theme}: صار الفاصلُ بقوّة حدِّ أداة`).toBeLessThan(3);
    });
  }
});

/**
 * AND EVERY FIELD USES IT — not only the three that come from `ui/Input`.
 *
 * A hundred and thirty-three fields drew their own edge, so changing the
 * shared component alone would have left most of the product faint and the
 * rest edged, which is worse than either.
 *
 * A checkbox, a radio, a range and a colour well are drawn by the user
 * agent (`accent-color`, and `color-scheme` per theme); their box is not
 * this border, and giving them one would draw a second edge around it.
 */
describe('no field draws its edge with the divider', () => {
  const NATIVE = /type="(?:checkbox|radio|range|color)"/;

  function tsxFiles(): string[] {
    const out: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (p.endsWith('.tsx') && !p.includes('.test.')) out.push(relative(root, p).split('\\').join('/'));
      }
    };
    walk(join(root, 'src', 'components'));
    walk(join(root, 'src', 'app'));
    return out;
  }

  const files = tsxFiles();
  const offenders: string[] = [];
  for (const file of files) {
    // Arrows masked so `=>` inside an attribute is not read as the tag's
    // end — a lesson three guards in this repo have already paid for.
    const src = readFileSync(join(root, file), 'utf8').replace(/=>/g, '=\u0001');
    for (const m of src.matchAll(/<(?:input|select|textarea)\b[^>]*>/g)) {
      const tag = m[0];
      if (NATIVE.test(tag)) continue;
      if (/border-\[var\(--sys-border\)\]/.test(tag)) {
        offenders.push(`${file}: ${tag.replace(/\u0001/g, '>').slice(0, 60)}…`);
      }
    }
  }

  it('found fields to check — a sweep over nothing proves nothing', () => {
    expect(files.length).toBeGreaterThan(80);
  });

  it('and every one of them uses the control token', () => {
    expect(
      offenders,
      `حقولٌ ترسم حدَّها بلون الفاصل (١٫٢٥:١):\n${offenders.join('\n')}`
    ).toEqual([]);
  });
});
