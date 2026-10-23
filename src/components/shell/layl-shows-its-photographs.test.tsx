// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import React from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * «ليل» SHOWS ITS PHOTOGRAPHS — IN THE THREE PLACES, AND ONLY UNDER «ليل».
 *
 * The owner opened the list of photographic themes to «ليل» on 23/10/2026.
 * The claims in a-photographic-theme-keeps-its-text-readable.test.ts read the
 * CSS as text; these read what a person would actually be shown: the real
 * components are rendered, and the real CSS is asked which picture lands on
 * each layer they draw — by the browser’s own selector matching (jsdom’s
 * `matches`) and the cascade’s own tie-break (specificity, then order).
 *
 *   • «ليل» is on the list, and the guard that closes the list names both;
 *   • the door, every family of empty list, and the header of the menu show
 *     «ليل»’s pictures under «ليل» — and not one of them under any other theme;
 *   • a picture is a background of an aria-hidden layer: no picture element,
 *     so no alternative text to forget, and every picture element the places
 *     do draw says nothing (alt="");
 *   • and a picture never lands in a box that shows a number.
 *
 * The neighbours of the shell that fetch, poll or register things are stubbed
 * to nothing: what is under test is the main element, the empty list inside
 * it, and the attribute between them.
 * ═══════════════════════════════════════════════════════════════════════
 */

const nav = vi.hoisted(() => ({ path: '/customers' }));
vi.mock('next/navigation', () => ({
  usePathname: () => nav.path,
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {}, prefetch: () => {} }),
  useSearchParams: () => new URLSearchParams(),
}));
const { pass } = vi.hoisted(() => ({ pass: ({ children }: { children?: unknown }) => children }));
vi.mock('@/components/shell/Sidebar', () => ({ Sidebar: () => null }));
vi.mock('@/components/shell/Header', () => ({ Header: () => null }));
vi.mock('@/components/shell/NotificationsProvider', () => ({ NotificationsProvider: pass }));
vi.mock('@/components/shell/NotificationCards', () => ({ NotificationCards: () => null }));
vi.mock('@/components/shell/MobileNav', () => ({ MobileNav: () => null }));
vi.mock('@/components/shell/OfflineWatch', () => ({ OfflineWatch: () => null }));
vi.mock('@/components/shell/Watermark', () => ({ Watermark: () => null }));
vi.mock('@/components/shell/IdleGuard', () => ({ IdleGuard: () => null }));
vi.mock('@/components/shell/CommandPalette', () => ({
  CommandPalette: () => null,
  useCommandPalette: () => ({ open: false, setOpen: () => {} }),
}));
vi.mock('@/components/shell/BulkBar', () => ({ BulkProvider: pass }));
vi.mock('@/components/shell/HubTabs', () => ({ HubTabs: () => null }));
vi.mock('@/components/shell/ScreenGuide', () => ({ ScreenGuideProvider: pass }));
vi.mock('@/components/shell/FirstRunTour', () => ({ FirstRunTour: () => null }));
vi.mock('@/context/StoreCurrency', () => ({ StoreCurrencyProvider: pass }));

import { Shell } from './Shell';
import { BrandStage } from './BrandStage';
import { ThemeDecor } from './ThemeDecor';
import { EmptyState } from '@/components/ui/EmptyState';
import { ALL_ROUTES } from '@/lib/route-registry';
import { AUTO_THEME, SYSTEM_THEMES, themeByKey } from '@/lib/system-themes';
import {
  DECOR_CLASS,
  EMPTY_FAMILIES,
  EMPTY_FAMILY_ATTR,
  EMPTY_FAMILY_OF_PATH,
  PHOTOGRAPHIC,
  decorCss,
  emptyFamilyOf,
  photographsOf,
  type EmptyFamily,
} from '@/lib/theme-decoration';

afterEach(() => {
  cleanup();
  nav.path = '/customers';
});

// ───────────────────── which picture the CSS puts on an element, the way a browser decides ─────────────────────

type Rule = { sel: string; body: string; media: string | null; order: number };

/** The rules of a stylesheet, with the media query each sits in. `@keyframes` say nothing about pictures. */
function rulesOf(css: string, media: string | null = null, out: Rule[] = []): Rule[] {
  let i = 0;
  while (i < css.length) {
    const open = css.indexOf('{', i);
    if (open < 0) break;
    const head = css.slice(i, open).trim();
    if (head.startsWith('@')) {
      let depth = 1;
      let j = open + 1;
      while (depth && j < css.length) {
        if (css[j] === '{') depth++;
        else if (css[j] === '}') depth--;
        j++;
      }
      if (head.startsWith('@media')) rulesOf(css.slice(open + 1, j - 1), head, out);
      i = j;
    } else {
      const close = css.indexOf('}', open);
      out.push({ sel: head, body: css.slice(open + 1, close), media, order: out.length });
      i = close + 1;
    }
  }
  return out;
}

/** A dark screen, wide or tall, with motion allowed: the only media this file asks about is the orientation. */
type Screen = 'wide' | 'tall';
const applies = (media: string | null, screen: Screen) =>
  media === null || (media.includes('orientation:portrait') && screen === 'tall');

/** Classes and attributes weigh the same; the pseudo-element is the box, not the weight. */
const weight = (sel: string) =>
  (sel.match(/\.[\w-]+/g) ?? []).length + (sel.match(/\[[^\]]+\]/g) ?? []).length;

type Box = '' | '::after' | '::before';
type Painted = { picture: string | null; mask: string | null };
const BOXES: Box[] = ['', '::after', '::before'];

/**
 * What each box of `el` is painted with: the winning `background`/`background-image` and the winning `mask`,
 * by specificity and then by order — and the file each names, if any.
 */
function paintOf(el: Element, rules: Rule[], screen: Screen): Record<Box, Painted> {
  const win: Record<string, { w: number; o: number; v: string }> = {};
  for (const r of rules) {
    if (!applies(r.media, screen)) continue;
    const box = (/::(after|before)$/.exec(r.sel)?.[0] ?? '') as Box;
    const sel = r.sel.replace(/::(after|before)$/, '');
    if (!el.matches(sel)) continue;
    for (const decl of r.body.split(';')) {
      const at = decl.indexOf(':');
      const prop = decl.slice(0, at).trim();
      const value = decl.slice(at + 1);
      const group = prop === 'background' || prop === 'background-image' ? 'bg' : prop === 'mask' || prop === '-webkit-mask' ? 'mask' : null;
      if (!group) continue;
      const key = `${box}|${group}`;
      const w = weight(sel);
      const cur = win[key];
      if (!cur || w > cur.w || (w === cur.w && r.order > cur.o)) win[key] = { w, o: r.order, v: value };
    }
  }
  const file = (v?: string) => (v ? /url\(\/brand\/decor\/([\w.-]+\.webp)\)/.exec(v)?.[1] ?? null : null);
  return Object.fromEntries(
    BOXES.map((b) => [b, { picture: file(win[`${b}|bg`]?.v), mask: file(win[`${b}|mask`]?.v) }])
  ) as Record<Box, Painted>;
}

/** Every theme a person can choose, with «تلقائي» as the raw key it is passed as. */
const EVERY_THEME = [...SYSTEM_THEMES.map((t) => t.key), AUTO_THEME];
const cssFor = (key: string) => rulesOf(decorCss(themeByKey(key), 'full', key));
const LAYL = PHOTOGRAPHIC.layl;
const laylPictures = new Set(photographsOf('layl'));

/** One real screen per family, straight from the route registry — and «/customers», which no family names. */
const SCREEN_OF: Record<EmptyFamily, string> = Object.fromEntries(
  EMPTY_FAMILIES.map((f) => [f, f === 'search' ? '/customers' : ALL_ROUTES.find((r) => emptyFamilyOf(r.path) === f)?.path ?? ''])
) as Record<EmptyFamily, string>;

const layer = (root: ParentNode, place: 'door' | 'empty' | 'sidebar') => {
  const el = root.querySelector(`.${DECOR_CLASS}-${place}`);
  expect(el, `ما في طبقة ${place}`).not.toBeNull();
  return el!;
};

function shellAt(path: string, children: React.ReactNode) {
  nav.path = path;
  return render(
    <Shell groups={[]} userName="س" userRole="SUPER_ADMIN" viewer={{ name: 'س', id: '1' }} context={{} as never}>
      {children}
    </Shell>
  );
}

const anEmptyList = <EmptyState title="لا شيء هنا بعد" why="حين يصل أوّل واحد يظهر هنا." />;

// ─────────────────────────────────────────────── the claims ───────────────────────────────────────────────

describe('«ليل» is on the closed list, and the guard that closes it names both themes', () => {
  it('— PHOTOGRAPHIC has «ليل» beside «ساحل النيون», and nothing else', () => {
    expect(Object.keys(PHOTOGRAPHIC)).toEqual(['neon-coast', 'layl']);
  });

  it('— and the closed-list claim spells both names out, and asserts the list equals them', () => {
    const guard = readFileSync(join(process.cwd(), 'src/lib/a-photographic-theme-keeps-its-text-readable.test.ts'), 'utf8');
    expect(guard).toMatch(/const KEYS = \['neon-coast', 'layl'\] as const;/);
    expect(guard).toContain('expect(Object.keys(PHOTOGRAPHIC), ');
    expect(guard).toContain(').toEqual([...KEYS]);');
    // and the reason is written beside it: the owner, and the day
    expect(guard).toMatch(/«ليل» since 23\/10\/2026/);
  });

  it('— every family in the table is a real screen, and every family has one', () => {
    for (const [prefix] of EMPTY_FAMILY_OF_PATH) {
      expect(ALL_ROUTES.some((r) => r.path === prefix || r.path.startsWith(`${prefix}/`)), prefix).toBe(true);
    }
    for (const f of EMPTY_FAMILIES) expect(SCREEN_OF[f], f).not.toBe('');
    expect(new Set(EMPTY_FAMILIES)).toEqual(new Set(Object.keys(LAYL.emptyArt!)));
  });
});

describe('each place shows «ليل»’s picture under «ليل» — and none of them under any other theme', () => {
  it('— the door: the courtyard gate on a wide screen, the road on a tall one', () => {
    const { container } = render(
      <BrandStage caption="ادخل">
        <form aria-label="الدخول" />
      </BrandStage>
    );
    const door = layer(container, 'door');
    // Named here, not read back from the table: a table that pointed the door at the wrong file would agree with itself.
    expect(paintOf(door, cssFor('layl'), 'wide')[''].picture).toBe('layl.door.webp');
    expect(paintOf(door, cssFor('layl'), 'tall')[''].picture).toBe('layl.door-tall.webp');
    for (const key of EVERY_THEME.filter((k) => k !== 'layl')) {
      for (const screen of ['wide', 'tall'] as const) {
        const painted = paintOf(door, cssFor(key), screen);
        for (const b of BOXES) {
          expect(laylPictures.has(painted[b].picture ?? ''), `${key} ${screen} ${b}`).toBe(false);
          expect(laylPictures.has(painted[b].mask ?? ''), `${key} ${screen} ${b}`).toBe(false);
        }
      }
    }
  });

  it.each(EMPTY_FAMILIES.map((f) => [f]))('— an empty list on a «%s» screen wears that family’s picture, through the shell', (family) => {
    const path = SCREEN_OF[family as EmptyFamily];
    const { container } = shellAt(path, anEmptyList);
    const main = container.querySelector('main')!;
    expect(main.getAttribute(EMPTY_FAMILY_ATTR), path).toBe(family);
    const empty = layer(main, 'empty');
    for (const screen of ['wide', 'tall'] as const) {
      // the family's own picture carries the family's name — an oracle the table cannot rewrite
      expect(paintOf(empty, cssFor('layl'), screen)[''].picture, `${path} ${screen}`).toBe(`layl.empty.${family}.webp`);
    }
    for (const key of EVERY_THEME.filter((k) => k !== 'layl')) {
      const painted = paintOf(empty, cssFor(key), 'wide');
      for (const b of BOXES) {
        expect(laylPictures.has(painted[b].picture ?? ''), `${key} ${path} ${b}`).toBe(false);
      }
    }
  });

  it('— the header of the menu: no photograph, the theme’s own octagram corner as before', () => {
    const { container } = render(
      <div>
        <ThemeDecor place="sidebar" />
      </div>
    );
    const header = layer(container, 'sidebar');
    const painted = paintOf(header, cssFor('layl'), 'wide');
    expect(painted[''].picture, 'صورة في رأس القائمة').toBeNull();
    expect(painted['::after'].mask).toBe('layl.webp');
    for (const key of EVERY_THEME.filter((k) => k !== 'layl')) {
      const other = paintOf(header, cssFor(key), 'wide');
      for (const b of BOXES) expect(laylPictures.has(other[b].picture ?? ''), `${key} ${b}`).toBe(false);
    }
  });
});

describe('a picture is a background of a layer that says nothing', () => {
  it('— no picture element carries a photograph, and every picture element drawn here has alt=""', () => {
    const door = render(
      <BrandStage caption="ادخل">
        <span>Zaki</span>
      </BrandStage>
    );
    const shell = shellAt(SCREEN_OF.tracking, anEmptyList);
    const header = render(<ThemeDecor place="sidebar" />);
    for (const { container } of [door, shell, header]) {
      for (const img of container.querySelectorAll('img')) {
        expect(img.getAttribute('alt'), img.outerHTML).toBe('');
        expect(img.getAttribute('src') ?? '', img.outerHTML).not.toContain('/brand/decor/');
      }
      for (const el of container.querySelectorAll(`.${DECOR_CLASS}`)) {
        expect(el.getAttribute('aria-hidden'), 'الطبقة لازم تكون صامتة').toBe('true');
        expect(el.querySelector('img'), 'عنصر صورة داخل الطبقة').toBeNull();
        expect(el.textContent, 'كلام داخل الطبقة').toBe('');
      }
    }
  });
});

describe('and a picture never lands in a box that shows a number', () => {
  const figures = (
    <table>
      <tbody>
        <tr>
          <td>المجموع</td>
          <td>1,250.00</td>
        </tr>
      </tbody>
    </table>
  );
  const DIGITS = /[0-9\u0660-\u0669\u06F0-\u06F9]/;

  it('— a screen of figures draws no layer at all', () => {
    const { container } = shellAt(SCREEN_OF.finance, figures);
    expect(container.querySelector('main')!.querySelectorAll(`.${DECOR_CLASS}`)).toHaveLength(0);
  });

  it('— and beside figures, the empty list’s layer stays inside the empty list, which shows none', () => {
    const { container } = shellAt(
      SCREEN_OF.finance,
      <>
        {figures}
        {anEmptyList}
      </>
    );
    const layers = [...container.querySelector('main')!.querySelectorAll(`.${DECOR_CLASS}`)];
    expect(layers).toHaveLength(1);
    for (const el of layers) {
      const box = el.parentElement!;
      expect(box.textContent ?? '', 'رقم في الصندوق الذي تحته صورة').not.toMatch(DIGITS);
      expect(box.querySelector('table'), 'جدول في صندوق الصورة').toBeNull();
      expect(el.closest('table'), 'صورة داخل جدول').toBeNull();
      // and the picture it would show there is the money office, under «ليل» — in the empty list, not the table
      expect(paintOf(el, cssFor('layl'), 'wide')[''].picture).toBe('layl.empty.finance.webp');
    }
  });

  it('— and the sweep that holds this for every screen in the product is still standing', () => {
    // a-theme-is-not-a-mood-swing.test.ts reads every component that draws a layer and fails if it also renders a
    // figure, a table or rows; this file does not restate it, it only refuses to let it disappear.
    const sweep = readFileSync(join(process.cwd(), 'src/lib/a-theme-is-not-a-mood-swing.test.ts'), 'utf8');
    expect(sweep).toContain("'components/ui/EmptyState.tsx',");
    expect(sweep).toContain('<Money\\b|totalAmount|codAmount|quantity|availableStock|<Rows\\b|<table');
  });
});
