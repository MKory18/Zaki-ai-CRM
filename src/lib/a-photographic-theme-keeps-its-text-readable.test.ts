import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AUTO_THEME, SYSTEM_THEMES, themeByKey, type SystemTheme } from './system-themes';
import { DECOR_LEVELS, PHOTOGRAPHIC, decorCss, photographsOf } from './theme-decoration';
import { repoFile, stripComments } from './guard-source';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * ONE THEME WEARS PHOTOGRAPHS — AND NOT A WORD OF THE PRODUCT DEPENDS ON THEM.
 *
 * The rule «shape only, never colour» was broken on purpose, once, for «ساحل
 * النيون» (the owner, 21/10: «ثيم جي تي ايه بصور حقيقية … بالأماكن التلاتة
 * بس»). What the rule protected is protected here instead, and these claims
 * are where:
 *
 *   • the list of themes that may wear a picture is CLOSED, and has one name;
 *   • a picture is painted by the three decoration layers and by nothing else,
 *     so never behind a figure, a table or a form;
 *   • EVERY WORD STAYS READABLE WHATEVER THE PICTURE IS. Like the door's own
 *     banner (brand-stage.test.ts), the numbers are held against the worst
 *     picture there could be — pure white — because a picture can be replaced
 *     by anybody and a number nudged by anybody reading it as taste;
 *   • the pictures themselves are the size, the shape and the kind the CSS
 *     expects, and a browser is asked for one door picture, not both.
 * ═══════════════════════════════════════════════════════════════════════
 */

const DECOR_DIR = join(process.cwd(), 'public', 'brand', 'decor');
const KEY = 'neon-coast';
const theme: SystemTheme = themeByKey(KEY);
const photos = PHOTOGRAPHIC[KEY];
const css = (level: 'off' | 'light' | 'full' = 'light') => decorCss(theme, level, KEY);

// ───────────────────────── contrast, the way the browser composites it ─────────────────────────

type Rgb = { r: number; g: number; b: number };
const hex = (h: string): Rgb => ({
  r: parseInt(h.slice(1, 3), 16),
  g: parseInt(h.slice(3, 5), 16),
  b: parseInt(h.slice(5, 7), 16),
});
const WHITE: Rgb = { r: 255, g: 255, b: 255 };
const lum = ({ r, g, b }: Rgb) => {
  const f = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
/** `fg` laid over `bg` at opacity `a` — what `color-mix(fg a%, transparent)` over an opaque picture is. */
const over = (fg: Rgb, bg: Rgb, a: number): Rgb => ({
  r: fg.r * a + bg.r * (1 - a),
  g: fg.g * a + bg.g * (1 - a),
  b: fg.b * a + bg.b * (1 - a),
});
const ratio = (a: Rgb, b: Rgb) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const token = (name: string): Rgb => hex(theme.vars[name]);

describe('the list of themes that wear pictures is closed, and has one name', () => {
  it('— «ساحل النيون», and only it', () => {
    expect(Object.keys(PHOTOGRAPHIC), 'ثيم ثانٍ بصور: قرّر ذلك بتعديل هذه الدعوى قصداً').toEqual([KEY]);
    expect(SYSTEM_THEMES.some((t) => t.key === KEY)).toBe(true);
    expect(theme.dark, 'الستارة محسوبة على أرضيّة داكنة').toBe(true);
  });

  it('— every other theme, and تلقائي, writes nothing of it', () => {
    for (const t of SYSTEM_THEMES.filter((x) => x.key !== KEY)) {
      const out = decorCss(t, 'full', t.key);
      expect(out, `${t.key}: أثر لصورة`).not.toContain(KEY);
      expect(out, `${t.key}: أثر للّوحة`).not.toContain('zk-door-column');
      expect(out, `${t.key}: أثر للتكبير`).not.toContain('zk-decor-zoom');
    }
    const auto = decorCss(themeByKey(AUTO_THEME), 'full', AUTO_THEME);
    expect(auto).not.toContain(KEY);
    expect(auto).not.toContain('zk-door-column');
  });
});

describe('a picture is painted by the three decoration layers and by nothing else', () => {
  /** Every top-level rule that names a picture, with the selector it is written for. */
  function pictureRules(out: string): string[] {
    const flat = out.replace(/@media[^{]*\{(.*?\})\}/g, '$1'); // look inside the @media blocks too
    return [...flat.matchAll(/([^{}]+)\{([^{}]*\/brand\/decor\/[^{}]*)\}/g)].map((m) => m[1].trim());
  }

  it('— the door, an empty list and the header of the menu', () => {
    const selectors = new Set(pictureRules(css('full')));
    expect([...selectors].sort()).toEqual(['.zk-decor-door', '.zk-decor-empty', '.zk-decor-sidebar']);
  });

  it('— and the layer is the same `zk-decor` that is aria-hidden and catches no click', () => {
    expect(css()).toContain('.zk-decor{position:absolute;inset:0;pointer-events:none;z-index:0;');
    expect(stripComments(repoFile('src/components/shell/ThemeDecor.tsx'))).toContain('aria-hidden');
    expect(stripComments(repoFile('src/components/shell/ThemeDecor.tsx'))).toContain('DECOR_CLASS');
  });

  it('— and the layers are drawn by the three files they always were: the sweep for a fourth is not touched', () => {
    // a-theme-is-not-a-mood-swing.test.ts holds the closed list of three files and the sweep for figures; it is
    // deliberately NOT edited for this theme. This only says that the pictures did not add a caller.
    const callers = ['BrandStage', 'Sidebar', 'EmptyState'].map((n) =>
      [`src/components/shell/${n}.tsx`, `src/components/ui/${n}.tsx`].find((f) => {
        try {
          return /<ThemeDecor\b/.test(readFileSync(join(process.cwd(), f), 'utf8'));
        } catch {
          return false;
        }
      })
    );
    expect(callers.every(Boolean)).toBe(true);
  });

  it('— and it asks for the three files it owns, and for no other theme’s', () => {
    const asked = [...css('full').matchAll(/\/brand\/decor\/([\w.-]+\.webp)/g)].map((m) => m[1]);
    expect([...new Set(asked)].sort()).toEqual(photographsOf(KEY).sort());
  });

  it('— and it names no colour of its own: the veil is the theme’s own tokens', () => {
    for (const level of DECOR_LEVELS) {
      const out = decorCss(theme, level, KEY);
      expect(out, level).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(out, level).not.toMatch(/\brgba?\(/);
    }
    const mixes = [...css().matchAll(/color-mix\(in srgb,var\(--sys-([\w-]+)\)/g)].map((m) => m[1]);
    expect(new Set(mixes), 'خلط بلونٍ ليس من الثيم').toEqual(new Set(['background', 'sidebar']));
  });
});

describe('every word stays readable, whatever the picture is', () => {
  /*
   * ONE NUMBER PER PLACE, AND THE WORST PICTURE THERE COULD BE.
   *
   * Pure white is laid under each place through the very number the CSS uses,
   * and the dimmest text that can sit there is asked to clear 4.5:1 — the
   * same bar as every other pair in the product (palette-contrast.test.ts).
   * Replace a photograph with a pale one, or thin a number, and it fails
   * here, which is the only place it can be caught before somebody squints.
   */
  const dimmest = ['heading', 'muted-foreground', 'primary'] as const;

  it('— the door: the panel of the page’s own colour, under the wordmark, the tagline and the line under the card', () => {
    const backdrop = over(token('background'), WHITE, photos.panel);
    for (const name of dimmest) {
      const r = ratio(token(name), backdrop);
      expect(r, `الباب: ${name} فوق أسطع صورة = ${r.toFixed(2)}`).toBeGreaterThan(4.5);
    }
  });

  it('— an empty list: the picture at its opacity, over every surface a list can stand on', () => {
    for (const surface of ['background', 'card', 'surface']) {
      const backdrop = over(WHITE, token(surface), photos.empty);
      for (const name of dimmest) {
        const r = ratio(token(name), backdrop);
        expect(r, `القائمة الفاضية على ${surface}: ${name} = ${r.toFixed(2)}`).toBeGreaterThan(4.5);
      }
    }
  });

  it('— the header of the menu: the sidebar’s own colour where the wordmark is', () => {
    const backdrop = over(token('sidebar'), WHITE, photos.header[0]);
    // the wordmark, the «AI» in the accent, and the line of Latin small print under it
    for (const name of ['sidebar-foreground', 'primary', 'muted-foreground']) {
      const r = ratio(token(name), backdrop);
      expect(r, `رأس القائمة: ${name} = ${r.toFixed(2)}`).toBeGreaterThan(4.5);
    }
  });

  it('— and the check can fail: with no panel and no veil the same white picture is unreadable', () => {
    // A guard nobody has seen fail is not a guard.
    expect(ratio(token('muted-foreground'), over(token('background'), WHITE, 0))).toBeLessThan(2);
    expect(ratio(token('sidebar-foreground'), over(token('sidebar'), WHITE, 0))).toBeLessThan(2);
    expect(ratio(token('muted-foreground'), over(WHITE, token('card'), 0.5))).toBeLessThan(4.5);
  });

  it('— and the numbers in the CSS are the numbers that were checked', () => {
    const out = css();
    expect(out).toContain(`.zk-door-column{background:color-mix(in srgb,var(--sys-background) ${Math.round(photos.panel * 100)}%,transparent)`);
    expect(out).toContain(`opacity:${photos.empty}`);
    expect(out).toContain(`color-mix(in srgb,var(--sys-sidebar) ${Math.round(photos.header[0] * 100)}%,transparent) 0%`);
  });

  it('— and the door’s text column carries the marker the panel is written for, once', () => {
    const stage = stripComments(repoFile('src/components/shell/BrandStage.tsx'));
    expect(stage.match(/zk-door-column/g)).toHaveLength(1);
    expect(stage, 'العمود لازم يبقى موضَّعاً فوق الطبقة').toMatch(/className="relative w-full max-w-lg[^"]*zk-door-column/);
  });
});

describe('a browser is asked for one door picture, never both', () => {
  const rules = (out: string) => [...out.matchAll(/([^{}@]+)\{([^{}]*\/brand\/decor\/[^{}]*)\}/g)].map((m) => ({ sel: m[1].trim(), body: m[2] }));

  it('— the wide one by default, the portrait one when the window is taller than it is wide', () => {
    const out = css();
    expect(out).toContain('@media (orientation:portrait){.zk-decor-door{');
    expect(out).toContain('@media (orientation:portrait){.zk-decor-empty{');
    for (const place of ['.zk-decor-door', '.zk-decor-empty']) {
      const mine = rules(out).filter((r) => r.sel === place);
      expect(mine, place).toHaveLength(2);
      const [plain, portrait] = mine;
      expect(plain.body, `${place}: الافتراضي`).toContain(photos.door);
      expect(portrait.body, `${place}: العمودي`).toContain(photos.doorTall);
    }
  });

  it('— and no single rule names both, so no phone downloads the wide one as well', () => {
    for (const r of rules(css('full'))) {
      const both = r.body.includes(photos.door) && r.body.includes(photos.doorTall);
      expect(both, r.sel).toBe(false);
    }
  });
});

describe('and it moves only where moving cannot uncover an edge', () => {
  it('— «light» is still, «off» is nothing', () => {
    expect(css('light')).not.toContain('@keyframes');
    expect(css('light')).not.toContain('animation');
    expect(css('off')).toBe('');
  });

  it('— «full» zooms the door from its centre and does not drift anything', () => {
    const out = css('full');
    expect(out).toContain('@keyframes zk-decor-zoom{to{transform:scale(1.06)}}');
    expect(out).toContain('.zk-decor-door.zk-decor-full{animation:zk-decor-zoom');
    // A drift would show a seam of page along one edge of a photograph.
    expect(out, 'انجراف الطبقة').not.toContain('zk-decor-drift');
    expect(out).not.toMatch(/\.zk-decor-(empty|sidebar)\.zk-decor-full\{animation/);
  });

  it('— and reduced motion removes it while a hidden tab pauses it', () => {
    const out = css('full');
    expect(out).toMatch(/prefers-reduced-motion: reduce\)\{[^}]*animation:none/);
    expect(out).toContain('[data-decor-hidden] .zk-decor-door.zk-decor-full{animation-play-state:paused}');
  });
});

describe('and the CSS is written for the browsers that have it, and harmless in the ones that do not', () => {
  it('— Safari’s prefixes sit beside the standard properties, counted rule by rule', () => {
    const out = css();
    expect((out.match(/(?<!-)\bmask:/g) ?? []).length).toBe((out.match(/-webkit-mask:/g) ?? []).length);
    expect((out.match(/(?<!-)\bbackdrop-filter:/g) ?? []).length).toBe((out.match(/-webkit-backdrop-filter:/g) ?? []).length);
    expect((out.match(/-webkit-mask:/g) ?? []).length).toBeGreaterThan(0);
  });

  it('— the door’s own circuit wave is taken out from under the picture', () => {
    expect(css()).toContain('.zk-door-banner{display:none}');
  });

  it('— and the veil is a declaration a browser without color-mix() drops WHOLE, leaving the plain wash', () => {
    // The picture and its veil are one `background:` — never a picture in one declaration and its veil in another.
    for (const m of css().matchAll(/\.zk-decor-(door|sidebar)\{([^{}]*)\}/g)) {
      if (!m[2].includes('/brand/decor/')) continue; // the base wash of the sidebar is a different rule
      expect(m[2], m[1]).toMatch(/^background:linear-gradient\(.*color-mix\(.*\),url\(\/brand\/decor\/[\w.-]+\.webp\)/);
    }
  });
});

describe('and the three pictures are the size, the shape and the kind the CSS expects', () => {
  const file = (name: string) => join(DECOR_DIR, name);

  it('— real WebP files, opaque, each under 120 KB', () => {
    for (const name of photographsOf(KEY)) {
      const buf = readFileSync(file(name));
      expect(buf.subarray(0, 4).toString('ascii'), `${name} مش WEBP`).toBe('RIFF');
      expect(buf.subarray(8, 12).toString('ascii')).toBe('WEBP');
      const kind = buf.subarray(12, 16).toString('ascii');
      // lossy and opaque: a mask (alpha channel) swapped in for a picture would still load and paint a rectangle
      if (kind === 'VP8X') expect(buf[20] & 0x10, `${name} فيه قناة شفافية`).toBe(0);
      else expect(kind, name).toBe('VP8 ');
      expect(statSync(file(name)).size / 1024, `${name} ثقيل`).toBeLessThan(120);
    }
  });

  it('— the door pictures are 16:9 and 9:16 and the strip is 5:1, at the sizes they were made for', async () => {
    const sharp = (await import('sharp')).default;
    const dims = async (name: string) => {
      const m = await sharp(file(name)).metadata();
      return { w: m.width!, h: m.height! };
    };
    const wide = await dims(photos.door);
    const tall = await dims(photos.doorTall);
    const strip = await dims(photos.strip);
    expect(wide.w / wide.h).toBeCloseTo(16 / 9, 1);
    expect(tall.w / tall.h).toBeCloseTo(9 / 16, 1);
    expect(strip.w / strip.h).toBeCloseTo(5, 3);
    // big enough for a desktop door under a veil, small enough for a phone
    expect(wide.w).toBeGreaterThanOrEqual(1280);
    expect(tall.h).toBeGreaterThanOrEqual(1280);
    expect(strip.w).toBeGreaterThanOrEqual(600);
  });

  it('— and nothing was painted in: the pictures are mostly dark, as the veil and the palette assume', async () => {
    // Not a taste check — a sanity check that the file is the night picture and not a pale replacement that the
    // numbers above would then be fighting. The brightest HALF of the picture may be lit; the median may not.
    const sharp = (await import('sharp')).default;
    for (const name of photographsOf(KEY)) {
      const { data, info } = await sharp(file(name)).resize(160, 90, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true });
      const ls: number[] = [];
      for (let i = 0; i < data.length; i += info.channels) ls.push(lum({ r: data[i], g: data[i + 1], b: data[i + 2] }));
      ls.sort((a, b) => a - b);
      expect(ls[Math.floor(ls.length / 2)], `${name}: الوسيط ساطع`).toBeLessThan(0.2);
    }
  });
});
