import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { repoFile, stripComments } from './guard-source';
import { SYSTEM_THEMES, themeByKey } from './system-themes';
import {
  HEADING_FACE,
  HEADING_FACE_FILE,
  HEADING_FACE_THEMES,
  HEADING_TAGS,
  headingFontCss,
} from './theme-heading-font';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * THE TWO ISLAMIC THEMES WEAR A FACE OF THEIR OWN ON TITLES — AND ON TITLES ONLY.
 *
 * The owner, 21/10: «الشكل خرافي مستوحى من الإسلامي». The letters on an
 * Islamic screen still said IBM Plex, a face drawn for columns of numbers.
 * Reem Kufi now draws `h1`–`h3` under the two Islamic themes, and these
 * claims hold the four things that make that a theme and not a mood swing:
 *
 *   • only those two themes, and only titles — never a figure, a cell, a
 *     field or a paragraph (the owner's own line: nothing is read through it);
 *   • written by the frame for the one theme rendered, so it costs the
 *     first-load stylesheet nothing;
 *   • from a file in this repository that the door can reach before sign-in,
 *     that the CSP lets the page load, and that cannot be swapped for another
 *     without somebody changing a number in this file;
 *   • with the system's own faces behind it, so a letter the subset lacks is
 *     drawn in Plex rather than as a box.
 * ═══════════════════════════════════════════════════════════════════════
 */

// `next/font/local` only runs inside Next's compiler. The frame is rendered here with plain family
// names; the claims below are about what it writes beside them.
vi.mock('@/app/(system)/fonts', () => ({
  arabic: { style: { fontFamily: 'PlexAr' } },
  arabicLatin: { style: { fontFamily: 'PlexLat' } },
  publicSans: { style: { fontFamily: 'PubSans' } },
  systemFontVars: 'font-vars',
}));

import { SystemFrame } from '@/app/(system)/SystemFrame';

const ISLAMIC = SYSTEM_THEMES.filter((t) => t.key.startsWith('islamic-')).map((t) => t.key);
const OTHERS = SYSTEM_THEMES.filter((t) => !t.key.startsWith('islamic-')).map((t) => t.key);

/** What the frame writes into its `<style>` tag, for one theme and one decoration level. */
function styleOf(theme: string | undefined, decor?: string): string {
  const html = renderToStaticMarkup(
    <SystemFrame theme={theme} decor={decor}>
      <h1>x</h1>
    </SystemFrame>
  );
  return /<style>([\s\S]*?)<\/style>/.exec(html)?.[1] ?? '';
}

describe('the face is the two Islamic themes’ and nobody else’s', () => {
  it('— exactly two themes ask for it, and they are the two Islamic ones', () => {
    expect(ISLAMIC, 'سمّيتَ ثيماً إسلامياً ثالثاً: قرّر هل يلبس الخطّ').toEqual(['islamic-epic', 'islamic-calm']);
    expect([...HEADING_FACE_THEMES].sort()).toEqual([...ISLAMIC].sort());
  });

  it.each(ISLAMIC)('— %s gets the rule', (key) => {
    expect(headingFontCss(themeByKey(key))).not.toBe('');
  });

  it.each(OTHERS)('— %s gets nothing: not a byte of it', (key) => {
    // A Kufic face under a neon grid or a sea chart is a costume. Nine themes keep Plex exactly as before.
    expect(headingFontCss(themeByKey(key))).toBe('');
  });

  it('— تلقائي keeps Plex too: it resolves to the dark and the light defaults, neither of them Islamic', () => {
    expect(headingFontCss(themeByKey('auto'))).toBe('');
    expect(styleOf('auto')).not.toContain(HEADING_FACE);
  });

  it('— and the rule of one theme never names the other’s attribute', () => {
    const epic = headingFontCss(themeByKey('islamic-epic'));
    const calm = headingFontCss(themeByKey('islamic-calm'));
    expect(epic).toContain("[data-sys-theme='islamic-epic']");
    expect(epic).not.toContain('islamic-calm');
    expect(calm).toContain("[data-sys-theme='islamic-calm']");
    expect(calm).not.toContain('islamic-epic');
  });
});

describe('it is for titles, and titles only', () => {
  const css = headingFontCss(themeByKey('islamic-epic'));
  const selector = /\[data-sys-theme='islamic-epic'\] :is\(([^)]*)\)\{/.exec(css)?.[1];

  it('— h1, h2 and h3, which is what a title is on these screens', () => {
    expect(selector, 'ما لقيت قائمة العناوين').toBeDefined();
    expect(selector!.split(',')).toEqual(['h1', 'h2', 'h3']);
    expect([...HEADING_TAGS]).toEqual(['h1', 'h2', 'h3']);
  });

  it('— and that is the ONLY rule that uses it: nothing for a figure, a cell, a field or a paragraph', () => {
    // The @font-face declares the family; one more rule uses it. Its selector is exactly the title list under the
    // theme's own attribute — an exact string, so a `td`, a `body` or a `*` added to it cannot slip past a word search.
    const rule = css.replace(/@font-face\{[^}]*\}/, '');
    expect(rule.slice(0, rule.indexOf('{'))).toBe("[data-sys-theme='islamic-epic'] :is(h1,h2,h3)");
    expect(rule.match(/\{/g)).toHaveLength(1);
  });

  it('— and it changes the face and nothing else: not the size, the weight or the spacing', () => {
    // Arabic joins its letters; spacing them apart severs the joins (system.css forces it off for that reason),
    // and a size or weight in the theme would be a second typographic scale nobody measured.
    const rule = css.replace(/@font-face\{[^}]*\}/, '');
    const declarations = rule.slice(rule.indexOf('{') + 1, rule.lastIndexOf('}')).split(';').filter(Boolean);
    expect(declarations).toHaveLength(1);
    expect(declarations[0].startsWith('font-family:')).toBe(true);
  });

  it('— and what a title falls back to is the system’s own faces, in the system’s own order', () => {
    const system = /font-family:\s*(var\(--font-arabic\)[^;]*);/.exec(repoFile('src/app/(system)/system.css'))?.[1] ?? '';
    const vars = (s: string) => [...s.matchAll(/var\((--[\w-]+)\)/g)].map((m) => m[1]);
    expect(vars(system), 'ما لقيت سلسلة الخطّ الأساسية بالورقة').toHaveLength(3);
    const stack = /font-family:'Reem Kufi',([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(vars(stack), 'ترتيب الخطوط الاحتياطية تغيّر عن الورقة').toEqual(vars(system));
    expect(stack.endsWith('sans-serif')).toBe(true);
  });
});

describe('it is one file from this repository, declared the way the system’s other faces are', () => {
  const css = headingFontCss(themeByKey('islamic-calm'));
  const face = /@font-face\{([^}]*)\}/.exec(css)?.[1] ?? '';

  it('— a variable file, 400 to 700, swapped in, from /fonts/', () => {
    expect(face).toContain(`font-family:'${HEADING_FACE}'`);
    expect(face).toContain('font-weight:400 700');
    expect(face, 'font-display ليس swap').toContain('font-display:swap');
    expect(face).toContain(`src:url(${HEADING_FACE_FILE}) format('woff2')`);
    expect(HEADING_FACE_FILE.startsWith('/fonts/')).toBe(true);
  });

  it('— from nowhere on the network: the page asks nobody for a font', () => {
    for (const key of ISLAMIC) {
      expect(headingFontCss(themeByKey(key)), key).not.toMatch(/https?:|\/\//);
    }
    expect(stripComments(repoFile('src/lib/theme-heading-font.ts'))).not.toMatch(/googleapis|gstatic|next\/font\/google/);
  });

  const file = join(process.cwd(), 'public', HEADING_FACE_FILE);

  it('— the file is there, and it is a WOFF2 of TrueType outlines', () => {
    expect(existsSync(file), `الملفّ غير موجود: ${HEADING_FACE_FILE}`).toBe(true);
    const head = readFileSync(file).subarray(0, 8);
    expect(head.subarray(0, 4).toString('latin1')).toBe('wOF2');
    expect(head.readUInt32BE(4)).toBe(0x00010000);
  });

  it('— a subset, not the family: between 10 and 40 KB (the whole font is 127 KB)', () => {
    const bytes = statSync(file).size;
    expect(bytes).toBeGreaterThan(10_000);
    expect(bytes).toBeLessThan(40_000);
  });

  it('— and it is the file somebody checked: Arabic joining, Western digits, every title character', () => {
    // A subset that drops `init`, `medi`, `fina` or `rlig` draws every word as a row of unjoined letters and
    // nothing here would crash. So the bytes are pinned: a new subset is a new file name (the service worker
    // keeps /fonts/ for good) and a new number here, after the checks in theme-heading-font.ts.
    const sha = createHash('sha256').update(readFileSync(file)).digest('hex');
    expect(sha).toBe('3f0c9bfeafb362bbba0ac955e9ddfa00c40870d108f94f167c1d365b9c546f0e');
  });

  it('— the licence travels with it, byte for byte from the upstream blob, naming what it covers', () => {
    const licence = readFileSync(join(process.cwd(), 'public/fonts/reem-kufi-OFL.txt'), 'utf8');
    expect(licence).toContain('SIL OPEN FONT LICENSE Version 1.1');
    expect(licence).toContain('The Reem Kufi Project Authors');
    // The reserved name is Josefin Sans; this file keeps «Reem Kufi» and must never take the reserved one.
    expect(licence).toContain('Reserved Font Name "Josefin Sans"');
    expect(headingFontCss(themeByKey('islamic-epic'))).not.toContain('Josefin');
  });

  it('— the door can fetch it before anybody signs in, and the CSP lets the page load it', () => {
    const proxy = stripComments(repoFile('src/proxy.ts'));
    const publicPaths = /PUBLIC_PATHS\s*=\s*\[([^\]]*)\]/.exec(proxy)?.[1] ?? '';
    expect(publicPaths, '/fonts ليس عاماً: الباب يُحوَّل إلى /login بدل أن يجد الخطّ').toContain("'/fonts'");
    const config = repoFile('next.config.ts');
    const fontSrc = [...config.matchAll(/font-src ([^"]*)"/g)].map((m) => m[1]);
    expect(fontSrc.length).toBeGreaterThan(0);
    for (const src of fontSrc) expect(src, 'CSP لا تسمح بخطّ من نفس الموقع').toContain("'self'");
  });
});

describe('the frame writes it, beside the palette, for the theme rendered', () => {
  it.each(ISLAMIC)('— %s: the document carries the face and the rule for its own attribute', (key) => {
    const style = styleOf(key);
    expect(style).toContain(`font-family:'${HEADING_FACE}'`);
    expect(style).toContain(`[data-sys-theme='${key}'] :is(h1,h2,h3)`);
    // beside the palette, in the same tag: the first paint is already right, no script and no second request
    expect(style).toContain(`[data-sys-theme='${key}']{color-scheme:`);
  });

  it.each(OTHERS)('— %s: the document carries no trace of it', (key) => {
    expect(styleOf(key)).not.toContain(HEADING_FACE);
  });

  it('— and nobody who sent nothing, or a typo, is given it', () => {
    expect(styleOf(undefined)).not.toContain(HEADING_FACE);
    expect(styleOf('islamic-typo')).not.toContain(HEADING_FACE);
  });

  it.each(['off', 'light', 'full'])('— at the «%s» decoration level: it is typography, not decoration', (level) => {
    // Somebody who turned the ornaments off still chose an Islamic theme; the ornaments are the ambient
    // touch and this is the theme's own lettering.
    expect(styleOf('islamic-epic', level)).toContain(`font-family:'${HEADING_FACE}'`);
  });

  it('— and the attribute the rule names is the attribute the frame renders', () => {
    const html = renderToStaticMarkup(
      <SystemFrame theme="islamic-calm">
        <h1>x</h1>
      </SystemFrame>
    );
    expect(html).toContain('data-sys-theme="islamic-calm"');
  });

  it('— it is not in the stylesheet everybody downloads: system.css names no Reem Kufi and no /fonts/', () => {
    const sheet = repoFile('src/app/(system)/system.css');
    expect(sheet).not.toContain('Reem Kufi');
    expect(sheet).not.toContain('reem-kufi');
    // and it is not a fourth `next/font` family either: that would put an @font-face in the sheet for everybody
    const fonts = stripComments(repoFile('src/app/(system)/fonts.ts'));
    expect(fonts).not.toMatch(/reem|kufi/i);
  });

  it('— the frame’s source puts it in the same <style> as the palette and the shape', () => {
    const frame = stripComments(repoFile('src/app/(system)/SystemFrame.tsx'));
    expect(frame).toContain('headingFontCss(chosen)');
    expect(frame).toMatch(/\$\{palette\}\$\{shape\}\$\{headings\}\$\{ambient\}/);
  });
});
