import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * CONTRAST, MEASURED, IN EVERY THEME.
 *
 * «Contrast: 4.5:1 for every text pair in all four themes.» The palette
 * is one file, so the answer is arithmetic — and arithmetic nobody has
 * run is the same as a rule nobody has.
 *
 * THERE ARE THREE THEMES, NOT FOUR. `ops`, `day` and `calm` carry
 * colours; `auto` carries none — it follows the operating system and
 * resolves to one of the other two. Four is the count of choices in the
 * picker, not of palettes.
 *
 * Every text pair passes today. This is here so that stays true: a colour
 * is changed for how it looks on one screen, and nothing else in a
 * codebase objects.
 */

const css = readFileSync(join(process.cwd(), 'src/app/(system)/system.css'), 'utf8');

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
export function contrast(a: string, b: string): number {
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
  const all = themes();

  it('found the palettes — a sweep over nothing proves nothing', () => {
    expect([...all.keys()].sort()).toEqual(['calm', 'day', 'ops']);
    for (const vars of all.values()) expect(vars.size).toBeGreaterThan(30);
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
 * AND THE ONE THAT DOES NOT PASS, MEASURED AND WAITING ON A DECISION.
 *
 * WCAG 1.4.11 asks 3:1 for the BOUNDARY OF A CONTROL. Every field in the
 * product draws its edge with `--sys-border` on `--sys-card`:
 *
 *   ops   1.48 : 1
 *   day   1.25 : 1
 *   calm  1.29 : 1
 *
 * At 1.25 the field has no visible edge at all for a reader with reduced
 * contrast sensitivity — the box is found by the cursor, not by the eye.
 *
 * The fix is known and already agreed ELSEWHERE: the zaki-ui package was
 * asked for «--zk-color-border-input بتباين ≥3:1» and points it at the
 * faintest text colour, which is the only existing colour that clears 3:1
 * in all three palettes. Here that colour is `--sys-muted` (5.16 / 5.05 /
 * 5.13).
 *
 * NOT APPLIED. It darkens the edge of every field on every screen, and
 * this audit is told not to redesign. The numbers are written down so the
 * decision is a decision and not an oversight — and this test fails if
 * somebody applies it without removing the note.
 */
describe('the control boundary that is below 3:1', () => {
  const expected: Record<string, number> = { ops: 1.48, day: 1.25, calm: 1.29 };

  for (const [theme, vars] of themes()) {
    it(`${theme}: --sys-border on --sys-card is still ${expected[theme]}:1`, () => {
      const border = resolve(vars, 'border')!;
      const card = resolve(vars, 'card')!;
      expect(contrast(border, card), `${theme}: تغيّر الرقم — راجِع القرار المعلَّق`).toBe(
        expected[theme]
      );
    });
  }

  it('and the colour that would fix it still clears 3:1 in all three', () => {
    for (const [theme, vars] of themes()) {
      const muted = resolve(vars, 'muted')!;
      const card = resolve(vars, 'card')!;
      expect(contrast(muted, card), `${theme}: --sys-muted`).toBeGreaterThanOrEqual(3);
    }
  });
});
