import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_THEME, SYSTEM_THEMES, SYS_VARS, sanitizeTheme, themeByKey } from './system-themes';

/**
 * THREE LOOKS, ONE MEANING PER COLOUR.
 *
 * People here work at speed and read colour before they read words. A theme
 * that made red mean something else in the dark palette would make somebody
 * miss a late shipment at four in the afternoon because they switched theme
 * at lunch. So the surfaces move and the meanings do not, and that is what
 * is actually tested below — not that the palettes are pretty.
 */

const css = () => readFileSync(join(process.cwd(), 'src', 'app', '(system)', 'system.css'), 'utf8');

/** Very rough hue of a hex, 0–360. Enough to tell red from green. */
function hue(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return 0;
  const d = max - min;
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

/** Relative luminance, for contrast. */
function luminance(hex: string): number {
  const channel = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const r = channel(parseInt(hex.slice(1, 3), 16));
  const g = channel(parseInt(hex.slice(3, 5), 16));
  const b = channel(parseInt(hex.slice(5, 7), 16));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

describe('the palettes', () => {
  it('there are three, and the default is one of them', () => {
    expect(SYSTEM_THEMES).toHaveLength(3);
    expect(themeByKey(DEFAULT_THEME).key).toBe(DEFAULT_THEME);
  });

  it('every theme defines every variable — a missing one renders invisible text', () => {
    for (const theme of SYSTEM_THEMES) {
      for (const name of SYS_VARS) {
        expect(theme.vars[name], `${theme.key}: --sys-${name}`).toMatch(/^#[0-9a-f]{6}$/i);
      }
    }
  });

  it('and defines nothing extra, so a stray variable cannot hide unused', () => {
    for (const theme of SYSTEM_THEMES) {
      expect(Object.keys(theme.vars).sort()).toEqual([...SYS_VARS].sort());
    }
  });
});

describe('a colour means the same thing in all three', () => {
  it('destructive is red everywhere — late, or money lost', () => {
    for (const theme of SYSTEM_THEMES) {
      const h = hue(theme.vars.destructive);
      expect(h < 25 || h > 335, `${theme.key}: ${theme.vars.destructive}`).toBe(true);
    }
  });

  it('success is green everywhere — collected', () => {
    for (const theme of SYSTEM_THEMES) {
      const h = hue(theme.vars.success);
      expect(h, `${theme.key}: ${theme.vars.success}`).toBeGreaterThan(90);
      expect(h, `${theme.key}: ${theme.vars.success}`).toBeLessThan(175);
    }
  });

  it('warning is amber everywhere — needs attention', () => {
    for (const theme of SYSTEM_THEMES) {
      const h = hue(theme.vars.warning);
      expect(h, `${theme.key}: ${theme.vars.warning}`).toBeGreaterThan(20);
      expect(h, `${theme.key}: ${theme.vars.warning}`).toBeLessThan(60);
    }
  });

  it('and none of the four semantic colours is reused for another', () => {
    for (const theme of SYSTEM_THEMES) {
      const four = [theme.vars.primary, theme.vars.destructive, theme.vars.success, theme.vars.warning];
      expect(new Set(four).size, theme.key).toBe(4);
    }
  });
});

describe('legible in the theme it lives in', () => {
  const READABLE = 4.5;
  const LARGE = 3;

  it('body text on the page, and on a card', () => {
    for (const theme of SYSTEM_THEMES) {
      expect(contrast(theme.vars.foreground, theme.vars.background), `${theme.key} page`).toBeGreaterThan(READABLE);
      expect(contrast(theme.vars.foreground, theme.vars.card), `${theme.key} card`).toBeGreaterThan(READABLE);
    }
  });

  it('a heading on a card', () => {
    for (const theme of SYSTEM_THEMES) {
      expect(contrast(theme.vars.heading, theme.vars.card), theme.key).toBeGreaterThan(READABLE);
    }
  });

  it('the label on the action button', () => {
    for (const theme of SYSTEM_THEMES) {
      expect(
        contrast(theme.vars['primary-foreground'], theme.vars.primary),
        `${theme.key}: the button's own text`
      ).toBeGreaterThan(LARGE);
    }
  });

  it('and each semantic colour against the surface it is drawn on', () => {
    for (const theme of SYSTEM_THEMES) {
      expect(contrast(theme.vars.destructive, theme.vars['destructive-soft']), theme.key).toBeGreaterThan(LARGE);
      expect(contrast(theme.vars.success, theme.vars['success-soft']), theme.key).toBeGreaterThan(LARGE);
      expect(contrast(theme.vars.warning, theme.vars['warning-soft']), theme.key).toBeGreaterThan(LARGE);
    }
  });
});

describe('the stylesheet matches the palettes', () => {
  // The CSS is generated from these objects so the first paint is already
  // the right theme. Two copies of a palette is one palette that goes stale.
  it('every theme has a block, and every value in it is the one here', () => {
    const text = css();
    for (const theme of SYSTEM_THEMES) {
      expect(text, `no block for ${theme.key}`).toContain(`[data-sys-theme='${theme.key}']`);
      for (const name of SYS_VARS) {
        expect(text, `${theme.key}: --sys-${name}`).toContain(`--sys-${name}: ${theme.vars[name]};`);
      }
    }
  });

  it('and :root is the default, so a page with no attribute still has colours', () => {
    expect(css()).toMatch(/:root,\s*\n\[data-sys-theme='day'\]/);
  });
});

describe('what it refuses', () => {
  it('a key this build does not know becomes the default, never nothing', () => {
    expect(sanitizeTheme('midnight')).toBe(DEFAULT_THEME);
    expect(sanitizeTheme(null)).toBe(DEFAULT_THEME);
    expect(sanitizeTheme(42)).toBe(DEFAULT_THEME);
  });
});

/**
 * The point of all of it: a screen that hardcodes a colour does not change
 * when the theme does, so a dark theme with a hundred white cards in it is
 * not a dark theme. This is the guard that stops the next one being added.
 */
describe('no new hardcoded colour in a system screen', () => {
  const ROOTS = ['src/components/screens', 'src/components/ui', 'src/components/shell', 'src/components/settings'];
  /**
   * Files that legitimately hold a colour that is not the system's:
   *   a STORE's own look, a PRINTED page (a waybill must not change colour
   *   with a theme), or somebody else's BRAND — Telegram blue, WhatsApp
   *   green, a channel's own colour. A brand colour turned into the
   *   system's info colour stops looking like the brand, which is the one
   *   job it has.
   */
  const ALLOWED = /landingpageeditor|storetheme|storedesign|label|telegram|whatsapp|channelsscreen|trackingpixels/i;

  function walk(dir: string): string[] {
    const out: string[] = [];
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) out.push(...walk(p));
      else if (p.endsWith('.tsx') && !p.includes('.test.')) out.push(p);
    }
    return out;
  }

  it('no hex, and no Tailwind palette colour', () => {
    const offenders: string[] = [];
    for (const root of ROOTS) {
      for (const file of walk(join(process.cwd(), root))) {
        if (ALLOWED.test(file)) continue;
        const src = readFileSync(file, 'utf8');
        const hex = src.match(/#[0-9a-fA-F]{6}\b/g) ?? [];
        const palette =
          src.match(
            /\b(?:bg|text|border)-(?:white|slate|gray|rose|emerald|amber)-?(?:[0-9]{2,3})?\b/g
          ) ?? [];
        if (hex.length || palette.length) {
          offenders.push(`${file.split(/[\\/]/).slice(-2).join('/')}: ${[...hex, ...palette].slice(0, 4).join(' ')}`);
        }
      }
    }
    expect(offenders, `ألوان مثبَّتة لا تتبع المظهر:\n${offenders.join('\n')}`).toEqual([]);
  });
});

/**
 * A RECOMMENDATION IS NOT A LOSS.
 *
 * The assistant screen drew three boxes — observations, risks and
 * recommendations — and coloured all three with the destructive variable.
 * Red means "late, or money lost" everywhere else in this system, so a
 * screen that paints a recommendation red is teaching people to stop
 * reading red as urgent.
 */
describe('a semantic colour keeps its meaning on every screen', () => {
  it('the assistant does not paint its recommendations as losses', () => {
    const src = readFileSync(join(process.cwd(), 'src/components/screens/AssistantScreen.tsx'), 'utf8');
    const i = src.indexOf('<CheckCircle2');
    expect(i, 'the recommendations box is gone').toBeGreaterThan(0);
    const box = src.slice(src.lastIndexOf('<div className="bg-[var(--sys-', i), i);
    expect(box.length, 'could not find the box markup').toBeGreaterThan(20);
    expect(box).not.toContain('sys-destructive');
  });

  it('and still paints its risks as risks', () => {
    const src = readFileSync(join(process.cwd(), 'src/components/screens/AssistantScreen.tsx'), 'utf8');
    const i = src.indexOf('<ShieldAlert');
    const box = src.slice(src.lastIndexOf('<div className="bg-[var(--sys-', i), i);
    expect(box.length, 'could not find the box markup').toBeGreaterThan(20);
    expect(box).toContain('sys-destructive');
  });
});
