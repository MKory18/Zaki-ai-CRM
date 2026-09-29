import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { repoFile } from './guard-source';

/**
 * THE PACKAGE'S TOKENS ARE THE PRODUCT'S TOKENS, OR THEY ARE A SECOND
 * OPINION ABOUT WHAT COLOUR THIS SHOP IS.
 *
 * `zaki-ui` exists so the ads studio and operations can look like one
 * product. The moment the package's copy of a colour can drift from the
 * one operations renders, it stops doing that — and the drift is invisible
 * until somebody puts two screens side by side.
 *
 * So the files are GENERATED from `src/app/(system)/system.css`, and this
 * re-runs the generator and fails if either file on disk differs from what
 * it produces. Editing a palette in the product and forgetting the package
 * is then a failing test rather than a slow divergence.
 */

const PKG = join(process.cwd(), 'packages', 'zaki-ui');

function regenerate(): { css: string; json: string } {
  const before = { css: readFileSync(join(PKG, 'tokens.css'), 'utf8'), json: readFileSync(join(PKG, 'tokens.json'), 'utf8') };
  execFileSync(process.execPath, [join(PKG, 'scripts', 'build-tokens.mjs')], { cwd: process.cwd(), stdio: 'pipe' });
  const after = { css: readFileSync(join(PKG, 'tokens.css'), 'utf8'), json: readFileSync(join(PKG, 'tokens.json'), 'utf8') };
  // The generator is idempotent, so this leaves the tree as it found it.
  expect(before.css).toBe(after.css);
  expect(before.json).toBe(after.json);
  return after;
}

describe('tokens.css and tokens.json are generated, not maintained', () => {
  it('re-running the generator changes neither file', () => {
    const { css, json } = regenerate();
    expect(css.length).toBeGreaterThan(1000);
    expect(json.length).toBeGreaterThan(1000);
  });

  it('and the two carry the same names and the same values', () => {
    const css = readFileSync(join(PKG, 'tokens.css'), 'utf8');
    const data = JSON.parse(readFileSync(join(PKG, 'tokens.json'), 'utf8'));

    const inCss = new Map<string, string>();
    for (const m of css.matchAll(/^\s*--zk-([a-z0-9-]+)\s*:\s*([^;]+);/gm)) {
      // A name may appear once per theme; the parity check is per (name, value).
      inCss.set(`${m[1]}=${m[2].trim()}`, m[1]);
    }

    const expectPair = (name: string, value: string) => {
      expect(inCss.has(`${name}=${value}`), `${name}: ${value} في json وليس في css`).toBe(true);
    };
    for (const [name, value] of Object.entries(data.scale as Record<string, string>)) expectPair(name, value);
    for (const theme of Object.values(data.themes as Record<string, { tokens: Record<string, string> }>)) {
      for (const [name, value] of Object.entries(theme.tokens)) expectPair(name, value);
    }
  });
});

describe('what the package promises about itself', () => {
  const data = () => JSON.parse(readFileSync(join(PKG, 'tokens.json'), 'utf8'));

  it('is dark by default AND dark by name', () => {
    const d = data();
    expect(d.defaultTheme).toBe('dark');
    // `:root` alone makes dark the thing you get when you say nothing, and
    // leaves no way to say it. A light page that wants one dark panel, or a
    // studio that stores the choice as a word, needs the name too.
    expect(d.themes.dark.selector).toBe(':root, [data-theme="dark"]');
    expect(d.themes.light.selector).toBe('[data-theme="light"]');
  });

  it('names the layer ladder after what uses it, and keeps the product’s numbers', () => {
    const d = data();
    // Renumbering «neatly» would be a redesign of stacking order — the one
    // thing nobody notices until something vanishes behind something else.
    expect(d.scale['z-modal']).toBe('50');
    expect(d.scale['z-toast']).toBe('60');
    expect(d.scale['z-palette']).toBe('70');
    expect(Number(d.scale['z-toast'])).toBeGreaterThan(Number(d.scale['z-modal']));
  });

  it('carries the 44px tap target and the focus ring the product draws', () => {
    const d = data();
    expect(d.scale['tap-min']).toBe('2.75rem');
    expect(d.scale['focus-width']).toBe('2px');
    expect(d.scale['focus-offset']).toBe('2px');
  });

  it('and explains the two names that read backwards', () => {
    const g = data().glossary;
    for (const k of ['color-text-faint', 'color-border-strong', 'color-text-muted', 'color-border']) {
      expect(g[k], k).toBeTruthy();
      expect(g[k].length).toBeGreaterThan(30);
    }
  });

  /**
   * THE PACKAGE NEVER SPEAKS THE PRODUCT'S TOKEN NAMES.
   *
   * `--sys-sidebar-scrollbar` is declared in the product as
   * `var(--sys-scrollbar)`, and copying that value across verbatim carried
   * a reference to a name the STUDIO has never heard of: it resolves to
   * nothing there, and the scrollbar loses its colour again — silently, and
   * only on the machine nobody is testing on.
   *
   * Asserted over the whole file rather than over the tokens I know about,
   * because the next token to point at another one will be written by
   * somebody who has not read this.
   */
  it('references no --sys- name anywhere — the studio has never heard of them', () => {
    const css = readFileSync(join(PKG, 'tokens.css'), 'utf8');
    const json = readFileSync(join(PKG, 'tokens.json'), 'utf8');
    expect(css, 'tokens.css يشير إلى رمزٍ من المنتج').not.toContain('--sys-');
    expect(json, 'tokens.json يشير إلى رمزٍ من المنتج').not.toContain('--sys-');
  });

  /**
   * AND THE ONE BORDER A PERSON HAS TO FIND IS ACTUALLY VISIBLE.
   *
   * WCAG 1.4.11 asks 3:1 of a control's boundary. Measured against the
   * surface an input sits on, the product's `border-strong` is 2.74:1 dark,
   * 1.87:1 light and 1.89:1 calm — so a fourth grey was NOT invented;
   * `border-input` points at `text-faint`, the only colour already present
   * that clears 3:1 in all three.
   */
  it('gives an input a border that meets 3:1, without inventing a colour', () => {
    const d = data();
    for (const [name, theme] of Object.entries(d.themes as Record<string, { tokens: Record<string, string> }>)) {
      expect(theme.tokens['color-border-input'], name).toBe('var(--zk-color-text-faint)');
    }
    const c = d.contrast['color-border-input'];
    expect(c.passes).toBe(true);
    for (const t of ['dark', 'light', 'calm']) expect(c[t], t).toBeGreaterThanOrEqual(3);
    // And the decorative borders are recorded as NOT passing, with why —
    // an unmeasured claim of accessibility is worse than none.
    expect(d.contrast['color-border-strong'].passes).toBe(false);
    expect(d.contrast['color-border-strong'].why.length).toBeGreaterThan(10);
  });

  it('and the sidebar scrollbar now has a colour in every theme', () => {
    const d = data();
    for (const theme of Object.values(d.themes) as { tokens: Record<string, string> }[]) {
      expect(theme.tokens['color-scrollbar-sidebar']).toBeTruthy();
      expect(theme.tokens['color-scrollbar-sidebar-hover']).toBeTruthy();
    }
  });

  /**
   * EVERY COLOUR IS THE PRODUCT'S. Not «the same shade» — the same string,
   * read out of the stylesheet operations renders.
   */
  it('carries the product’s own values, character for character', () => {
    const system = repoFile('src/app/(system)/system.css');
    const d = data();
    let checked = 0;
    for (const [name, value] of Object.entries(d.themes.dark.tokens as Record<string, string>)) {
      if (!name.startsWith('color-')) continue;
      // A token whose value points at another token carries no colour of
      // its own — it is checked by «no --sys- anywhere» and by the
      // reference being one of ours. Only literals are compared here.
      if (value.startsWith('var(')) {
        expect(value, name).toMatch(/^var\(--zk-[a-z0-9-]+\)$/);
        continue;
      }
      expect(system, `${name} ليست قيمةً موجودةً في المنتج`).toContain(value);
      checked++;
    }
    // And the check is not vacuous: most of them ARE literals.
    expect(checked).toBeGreaterThan(20);
  });

  it('invents no colour the product does not have', () => {
    const d = data();
    // The brief asks for an «info» state. There is none in the product, and
    // a colour picked here would be a redesign wearing a token's name.
    expect(Object.keys(d.themes.dark.tokens)).not.toContain('color-info');
    expect(d.notPresentInTheProduct.join(' ')).toContain('color-info');
  });

  /**
   * THE SPACING SCALE WAS COUNTED, NOT CHOSEN — and the count travels with
   * it, so the next reader can check the claim instead of trusting it.
   */
  it('shows where the spacing scale came from', () => {
    const d = data();
    const steps = d.spacingDerivedFrom.steps as { px: number; uses: number }[];
    expect(steps.length).toBeGreaterThan(8);
    expect(steps.every((s) => typeof s.uses === 'number' && s.uses >= 0)).toBe(true);
    // The two commonest steps in the product are 8px and 12px, in that order.
    const byUse = [...steps].sort((a, b) => b.uses - a.uses);
    expect(byUse[0].px).toBe(8);
    expect(byUse[1].px).toBe(12);
    // Named by pixels: --zk-space-8 is eight pixels, not the eighth step.
    expect(d.scale['space-8']).toBe('0.5rem');
    expect(d.scale['space-12']).toBe('0.75rem');
  });

  it('and nothing below 12px in the type scale', () => {
    const d = data();
    const sizes = Object.keys(d.scale).filter((k) => /^text-\d+$/.test(k)).map((k) => Number(k.slice(5)));
    expect(Math.min(...sizes)).toBe(12);
  });
});
