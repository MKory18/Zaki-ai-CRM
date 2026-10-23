import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AUTO_THEME, SYSTEM_THEMES, themeByKey, type SystemTheme } from './system-themes';
import {
  DECOR_LEVELS,
  EMPTY_FAMILIES,
  EMPTY_FAMILY_ATTR,
  PHOTOGRAPHIC,
  decorCss,
  photographsOf,
} from './theme-decoration';
import { repoFile, stripComments } from './guard-source';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * TWO THEMES WEAR PHOTOGRAPHS — AND NOT A WORD OF THE PRODUCT DEPENDS ON THEM.
 *
 * The rule «shape only, never colour» was broken on purpose, once, for «ساحل
 * النيون» (the owner, 21/10: «ثيم جي تي ايه بصور حقيقية … بالأماكن التلاتة
 * بس»), and a second time for «ليل», which the owner approved on 23/10/2026
 * so that the real pictures made for it are seen. What the rule protected is
 * protected here instead, for both, and these claims are where:
 *
 *   • the list of themes that may wear a picture is CLOSED, and has two names;
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

/*
 * THE CLOSED LIST, WRITTEN OUT ON PURPOSE.
 *
 * «ساحل النيون» since 21/10. «ليل» since 23/10/2026 — the owner approved opening
 * the list to it so its real photographs show (phase 3b, «الصور الحقيقية»).
 * A third name is a decision and not an edit: the first claim below fails
 * until somebody writes it into this line, knowing what it means.
 */
const KEYS = ['neon-coast', 'layl'] as const;

// The claims first written for «ساحل النيون» read these, exactly as they did.
const KEY = 'neon-coast';
const theme: SystemTheme = themeByKey(KEY);
const photos = PHOTOGRAPHIC[KEY];
const css = (level: 'off' | 'light' | 'full' = 'light') => decorCss(theme, level, KEY);

// …and these are the same questions, asked of either theme.
const cssOf = (key: string, level: 'off' | 'light' | 'full' = 'light') => decorCss(themeByKey(key), level, key);
/** Every file a theme's CSS may ask for: its pictures, and its own mask when it has no strip. */
const ownedBy = (key: string): string[] => [
  ...photographsOf(key),
  ...(PHOTOGRAPHIC[key].strip ? [] : [`${key}.webp`]),
];

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
const tokenOf = (key: string, name: string): Rgb => hex(themeByKey(key).vars[name]);

describe('the list of themes that wear pictures is closed, and has two names', () => {
  it('— «ساحل النيون» and «ليل», and only they', () => {
    expect(Object.keys(PHOTOGRAPHIC), 'ثيم ثالث بصور: قرّر ذلك بتعديل هذه الدعوى قصداً').toEqual([...KEYS]);
    for (const key of KEYS) {
      expect(SYSTEM_THEMES.some((t) => t.key === key), key).toBe(true);
      expect(themeByKey(key).dark, `${key}: الستارة محسوبة على أرضيّة داكنة`).toBe(true);
    }
  });

  it('— every other theme, and تلقائي, writes nothing of it', () => {
    const everyPicture = KEYS.flatMap((k) => photographsOf(k));
    for (const t of SYSTEM_THEMES.filter((x) => !(KEYS as readonly string[]).includes(x.key))) {
      const out = decorCss(t, 'full', t.key);
      expect(out, `${t.key}: أثر لصورة`).not.toContain(KEY);
      for (const file of everyPicture) expect(out, `${t.key}: ${file}`).not.toContain(file);
      expect(out, `${t.key}: أثر للّوحة`).not.toContain('zk-door-column');
      expect(out, `${t.key}: أثر للتكبير`).not.toContain('zk-decor-zoom');
      expect(out, `${t.key}: قاعدة عائلة`).not.toContain(EMPTY_FAMILY_ATTR);
    }
    const auto = decorCss(themeByKey(AUTO_THEME), 'full', AUTO_THEME);
    expect(auto).not.toContain(KEY);
    for (const file of everyPicture) expect(auto, file).not.toContain(file);
    expect(auto).not.toContain('zk-door-column');
  });

  it('— and neither of the two reaches for the other one’s pictures', () => {
    for (const key of KEYS) {
      const out = cssOf(key, 'full');
      for (const other of KEYS.filter((k) => k !== key)) {
        for (const file of photographsOf(other)) expect(out, `${key} يطلب ${file}`).not.toContain(file);
      }
    }
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

  it('— and for «ليل» the same three, an empty list’s family being only a question asked of its ancestor', () => {
    // `[data-empty-family=x] .zk-decor-empty` is still the empty list's own layer; `::after` on the header is
    // the theme's own mask, drawn by the same layer. Strip both and nothing but the three places is left.
    const places = new Set(
      pictureRules(cssOf('layl', 'full')).map((s) =>
        s.replace(new RegExp(`^\\[${EMPTY_FAMILY_ATTR}=[\\w-]+\\] `), '').replace(/::after$/, '')
      )
    );
    expect([...places].sort()).toEqual(['.zk-decor-door', '.zk-decor-empty', '.zk-decor-sidebar']);
  });

  it('— and the layer is the same `zk-decor` that is aria-hidden and catches no click', () => {
    for (const key of KEYS) {
      expect(cssOf(key), key).toContain('.zk-decor{position:absolute;inset:0;pointer-events:none;z-index:0;');
    }
    expect(stripComments(repoFile('src/components/shell/ThemeDecor.tsx'))).toContain('aria-hidden');
    expect(stripComments(repoFile('src/components/shell/ThemeDecor.tsx'))).toContain('DECOR_CLASS');
  });

  it('— and the layers are drawn by the three files they always were: the sweep for a fourth is not touched', () => {
    // a-theme-is-not-a-mood-swing.test.ts holds the closed list of three files and the sweep for figures; it is
    // deliberately NOT edited for these themes. This only says that the pictures did not add a caller.
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

  it('— and it asks for the files it owns, and for no other theme’s', () => {
    const asked = [...css('full').matchAll(/\/brand\/decor\/([\w.-]+\.webp)/g)].map((m) => m[1]);
    expect([...new Set(asked)].sort()).toEqual(photographsOf(KEY).sort());
    for (const key of KEYS) {
      const mine = [...cssOf(key, 'full').matchAll(/\/brand\/decor\/([\w.-]+\.webp)/g)].map((m) => m[1]);
      expect([...new Set(mine)].sort(), key).toEqual(ownedBy(key).sort());
    }
  });

  it('— and it names no colour of its own: the veil is the theme’s own tokens', () => {
    for (const key of KEYS) {
      for (const level of DECOR_LEVELS) {
        const out = decorCss(themeByKey(key), level, key);
        expect(out, `${key} ${level}`).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
        expect(out, `${key} ${level}`).not.toMatch(/\brgba?\(/);
      }
    }
    const mixes = [...css().matchAll(/color-mix\(in srgb,var\(--sys-([\w-]+)\)/g)].map((m) => m[1]);
    expect(new Set(mixes), 'خلط بلونٍ ليس من الثيم').toEqual(new Set(['background', 'sidebar']));
    // «ليل» has no strip, so it never mixes the sidebar’s colour: only the page’s own.
    const laylMixes = [...cssOf('layl').matchAll(/color-mix\(in srgb,var\(--sys-([\w-]+)\)/g)].map((m) => m[1]);
    expect(new Set(laylMixes), 'ليل: خلط بلونٍ ليس من الثيم').toEqual(new Set(['background']));
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
    for (const key of KEYS) {
      const backdrop = over(tokenOf(key, 'background'), WHITE, PHOTOGRAPHIC[key].panel);
      for (const name of dimmest) {
        const r = ratio(tokenOf(key, name), backdrop);
        expect(r, `${key} — الباب: ${name} فوق أسطع صورة = ${r.toFixed(2)}`).toBeGreaterThan(4.5);
      }
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

  it('— an empty list under «ليل»: the picture’s share of the pool of the page’s own background', () => {
    // The pool is laid by the layer itself, so whatever surface the list stands on, the words in the middle
    // are read against `--sys-background` with the picture's share of white in it.
    const layl = PHOTOGRAPHIC.layl;
    const pool = over(WHITE, tokenOf('layl', 'background'), layl.empty);
    for (const name of dimmest) {
      const r = ratio(tokenOf('layl', name), pool);
      expect(r, `ليل — القائمة الفاضية: ${name} فوق البركة = ${r.toFixed(2)}`).toBeGreaterThan(5);
    }
  });

  it('— and «ليل» needs the pool: the same white picture straight onto its lightest surface fails', () => {
    // A guard nobody has seen fail is not a guard — and this is the reason the pool exists at all.
    const straight = over(WHITE, tokenOf('layl', 'surface'), PHOTOGRAPHIC.layl.empty);
    expect(ratio(tokenOf('layl', 'primary'), straight)).toBeLessThan(4.5);
    expect(ratio(tokenOf('layl', 'muted-foreground'), straight)).toBeLessThan(4.5);
  });

  it('— the header of the menu: the sidebar’s own colour where the wordmark is', () => {
    const backdrop = over(token('sidebar'), WHITE, photos.header![0]);
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
    // …and «ليل»’s door at neon-coast’s panel would not have been enough for its primary.
    expect(ratio(tokenOf('layl', 'primary'), over(tokenOf('layl', 'background'), WHITE, 0.8))).toBeLessThan(4.5);
  });

  it('— and the numbers in the CSS are the numbers that were checked', () => {
    const out = css();
    expect(out).toContain(`.zk-door-column{background:color-mix(in srgb,var(--sys-background) ${Math.round(photos.panel * 100)}%,transparent)`);
    expect(out).toContain(`opacity:${photos.empty}`);
    expect(out).toContain(`color-mix(in srgb,var(--sys-sidebar) ${Math.round(photos.header![0] * 100)}%,transparent) 0%`);
    const layl = PHOTOGRAPHIC.layl;
    const lout = cssOf('layl');
    expect(lout).toContain(
      `.zk-door-column{background:color-mix(in srgb,var(--sys-background) ${Math.round(layl.panel * 100)}%,transparent)`
    );
    // the veil over the picture is the rest of the pool: (1 − share) of the page's own background, then the pool itself
    const veil = `color-mix(in srgb,var(--sys-background) ${Math.round((1 - layl.empty) * 100)}%,transparent)`;
    expect(lout).toContain(`.zk-decor-empty{background:linear-gradient(${veil},${veil}),url(/brand/decor/`);
    expect(lout).toMatch(/\.zk-decor-empty\{background:[^{}]*center\/cover no-repeat var\(--sys-background\);/);
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

  it('— «ليل» too, at the door; and an empty list there asks for its own family’s picture, one per rule', () => {
    const layl = PHOTOGRAPHIC.layl;
    const out = cssOf('layl');
    expect(out).toContain('@media (orientation:portrait){.zk-decor-door{');
    const door = rules(out).filter((r) => r.sel === '.zk-decor-door');
    expect(door).toHaveLength(2);
    expect(door[0].body).toContain(layl.door);
    expect(door[1].body).toContain(layl.doorTall);
    const empty = rules(out).filter((r) => r.sel.endsWith('.zk-decor-empty'));
    expect(empty, 'قاعدة لكل عائلة').toHaveLength(EMPTY_FAMILIES.length);
    for (const r of empty) {
      const named = [...r.body.matchAll(/\/brand\/decor\/([\w.-]+\.webp)/g)].map((m) => m[1]);
      expect(named, r.sel).toHaveLength(1);
      expect(named[0], r.sel).not.toBe(layl.door);
      expect(named[0], r.sel).not.toBe(layl.doorTall);
    }
  });

  it('— and no single rule names both, so no phone downloads the wide one as well', () => {
    for (const key of KEYS) {
      const p = PHOTOGRAPHIC[key];
      for (const r of rules(cssOf(key, 'full'))) {
        const both = r.body.includes(p.door) && r.body.includes(p.doorTall);
        expect(both, `${key} ${r.sel}`).toBe(false);
      }
    }
  });
});

describe('and it moves only where moving cannot uncover an edge', () => {
  it('— «light» is still, «off» is nothing', () => {
    for (const key of KEYS) {
      expect(cssOf(key, 'light'), key).not.toContain('@keyframes');
      expect(cssOf(key, 'light'), key).not.toContain('animation');
      expect(cssOf(key, 'off'), key).toBe('');
    }
  });

  it('— «full» zooms the door from its centre and does not drift anything', () => {
    for (const key of KEYS) {
      const out = cssOf(key, 'full');
      expect(out, key).toContain('@keyframes zk-decor-zoom{to{transform:scale(1.06)}}');
      expect(out, key).toContain('.zk-decor-door.zk-decor-full{animation:zk-decor-zoom');
      // A drift would show a seam of page along one edge of a photograph.
      expect(out, `${key}: انجراف الطبقة`).not.toContain('zk-decor-drift');
      expect(out, key).not.toMatch(/\.zk-decor-(empty|sidebar)\.zk-decor-full\{animation/);
      expect(out, `${key}: الزاوية تدور`).not.toMatch(/\.zk-decor-sidebar[^{]*::after\{[^}]*animation/);
    }
  });

  it('— and reduced motion removes it while a hidden tab pauses it', () => {
    for (const key of KEYS) {
      const out = cssOf(key, 'full');
      expect(out, key).toMatch(/prefers-reduced-motion: reduce\)\{[^}]*animation:none/);
      expect(out, key).toContain('[data-decor-hidden] .zk-decor-door.zk-decor-full{animation-play-state:paused}');
    }
  });
});

describe('and the CSS is written for the browsers that have it, and harmless in the ones that do not', () => {
  it('— Safari’s prefixes sit beside the standard properties, counted rule by rule', () => {
    for (const key of KEYS) {
      const out = cssOf(key);
      expect((out.match(/(?<!-)\bmask:/g) ?? []).length, key).toBe((out.match(/-webkit-mask:/g) ?? []).length);
      expect((out.match(/(?<!-)\bbackdrop-filter:/g) ?? []).length, key).toBe((out.match(/-webkit-backdrop-filter:/g) ?? []).length);
      expect((out.match(/-webkit-mask:/g) ?? []).length, key).toBeGreaterThan(0);
    }
  });

  it('— the door’s own circuit wave is taken out from under the picture', () => {
    for (const key of KEYS) expect(cssOf(key), key).toContain('.zk-door-banner{display:none}');
  });

  it('— and the veil is a declaration a browser without color-mix() drops WHOLE, leaving the plain wash', () => {
    // The picture and its veil are one `background:` — never a picture in one declaration and its veil in another.
    for (const key of KEYS) {
      for (const m of cssOf(key).matchAll(/\.zk-decor-(door|sidebar)\{([^{}]*)\}/g)) {
        if (!m[2].includes('/brand/decor/')) continue; // the base wash of the sidebar is a different rule
        expect(m[2], `${key} ${m[1]}`).toMatch(/^background:linear-gradient\(.*color-mix\(.*\),url\(\/brand\/decor\/[\w.-]+\.webp\)/);
      }
    }
    // «ليل»’s empty lists: the veil, the picture and the pool in one declaration, every family alike.
    for (const m of cssOf('layl').matchAll(/([^{}]*\.zk-decor-empty)\{([^{}]*)\}/g)) {
      expect(m[2], m[1]).toMatch(/^background(-image)?:linear-gradient\(color-mix\(.*\),color-mix\(.*\)\),url\(\/brand\/decor\/[\w.-]+\.webp\)/);
    }
  });
});

describe('and the pictures are the size, the shape and the kind the CSS expects', () => {
  const file = (name: string) => join(DECOR_DIR, name);

  it('— real WebP files, opaque, each under 120 KB', () => {
    for (const name of KEYS.flatMap((k) => photographsOf(k))) {
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
    for (const key of KEYS) {
      const p = PHOTOGRAPHIC[key];
      const wide = await dims(p.door);
      const tall = await dims(p.doorTall);
      expect(wide.w / wide.h, key).toBeCloseTo(16 / 9, 1);
      expect(tall.w / tall.h, key).toBeCloseTo(9 / 16, 1);
      // big enough for a desktop door under a veil, small enough for a phone
      expect(wide.w, key).toBeGreaterThanOrEqual(1280);
      expect(tall.h, key).toBeGreaterThanOrEqual(1280);
    }
    const strip = await dims(photos.strip!);
    expect(strip.w / strip.h).toBeCloseTo(5, 3);
    expect(strip.w).toBeGreaterThanOrEqual(600);
  });

  it('— and an empty list’s picture is no bigger than the box it fills: 1200 pixels on its long side at most', async () => {
    const sharp = (await import('sharp')).default;
    for (const name of Object.values(PHOTOGRAPHIC.layl.emptyArt!)) {
      const m = await sharp(file(name)).metadata();
      expect(Math.max(m.width!, m.height!), name).toBeLessThanOrEqual(1200);
      expect(Math.max(m.width!, m.height!), name).toBeGreaterThanOrEqual(600);
    }
  });

  it('— and nothing was painted in: the pictures are mostly dark, as the veil and the palette assume', async () => {
    // Not a taste check — a sanity check that the file is the night picture and not a pale replacement that the
    // numbers above would then be fighting. The brightest HALF of the picture may be lit; the median may not.
    const sharp = (await import('sharp')).default;
    for (const name of KEYS.flatMap((k) => photographsOf(k))) {
      const { data, info } = await sharp(file(name)).resize(160, 90, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true });
      const ls: number[] = [];
      for (let i = 0; i < data.length; i += info.channels) ls.push(lum({ r: data[i], g: data[i + 1], b: data[i + 2] }));
      ls.sort((a, b) => a - b);
      expect(ls[Math.floor(ls.length / 2)], `${name}: الوسيط ساطع`).toBeLessThan(0.2);
    }
  });
});
