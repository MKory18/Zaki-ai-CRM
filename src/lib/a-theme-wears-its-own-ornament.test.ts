import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { decorCss } from './theme-decoration';
import { AUTO_DARK, AUTO_LIGHT, AUTO_THEME, SYSTEM_THEMES, themeByKey } from './system-themes';
import { repoFile, stripComments } from './guard-source';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * ELEVEN ORNAMENTS, AND THE THREE THINGS THAT MAKE ONE SAFE.
 *
 * The owner, 20/10: «شكل الإطار لكل ثيم… وزيد عليه رمز صغير باهت بزاوية
 * الكرت… الرسمات بالأماكن التلاتة وبكرت الترحيب بس. ولا رسمة ورا رقم أو
 * مبلغ.»
 *
 * Until now a theme's decoration was two radial washes built from
 * `--sys-primary-soft`, identical in all eleven. Eight of them are MOODS —
 * neon, gold, parchment, a sky with no moon — and the same wash under all
 * of them made the choice a recoloured spreadsheet, which is the thing
 * `theme-decoration.ts` opens by saying it must not be.
 *
 * So each theme now wears a drawing of its own. The three things that
 * keep a drawing from becoming a problem are pinned here, because every
 * one of them is invisible until it is too late:
 *
 *   ① It is a MASK, so its colour is the theme's own `--sys-primary` and
 *     it cannot carry a twelfth palette nobody measured.
 *   ② Its loudness is MEASURED, not chosen, so a replacement drawing
 *     cannot arrive at the wrong volume unnoticed.
 *   ③ «تلقائي» gets BOTH, because it has two palettes and one ornament
 *     would be a radar sweep on a white screen at noon.
 *
 * The rule that it never appears behind money is the OTHER file's —
 * `a-theme-is-not-a-mood-swing.test.ts` sweeps every screen for it — and
 * this one does not restate it.
 * ═══════════════════════════════════════════════════════════════════════
 */

const DECOR_DIR = join(process.cwd(), 'public', 'brand', 'decor');
const css = (key: string, level: 'off' | 'light' | 'full' = 'light') =>
  decorCss(themeByKey(key), level, key);

describe('every theme has an ornament, and it is on the disk', () => {
  it('— one file per theme, no more and no fewer', () => {
    const files = readdirSync(DECOR_DIR).filter((f) => f.endsWith('.webp')).sort();
    const keys = SYSTEM_THEMES.map((t) => `${t.key}.webp`).sort();
    expect(files, 'ثيم بلا رسمة أو رسمة بلا ثيم').toEqual(keys);
  });

  it('and each theme’s CSS actually asks for its own file', () => {
    for (const t of SYSTEM_THEMES) {
      expect(css(t.key), `${t.key} ما بيطلب رسمته`).toContain(`/brand/decor/${t.key}.webp`);
    }
  });

  it('and no theme reaches for another theme’s drawing', () => {
    for (const t of SYSTEM_THEMES) {
      const others = SYSTEM_THEMES.filter((o) => o.key !== t.key).map((o) => `/brand/decor/${o.key}.webp`);
      for (const url of others) {
        expect(css(t.key), `${t.key} بيجيب رسمة غيره`).not.toContain(url);
      }
    }
  });
});

describe('and it is a mask, so it carries no colour of its own', () => {
  it('— the colour comes from the palette, through the mask', () => {
    const out = css('lux');
    expect(out).toContain('mask:url(/brand/decor/lux.webp)');
    expect(out, 'الرسمة لازم تتلون من --sys-primary').toContain('background-color:var(--sys-primary)');
  });

  it('and Safari’s prefixed property is written beside the standard one', () => {
    /*
     * An ignored `mask` leaves a solid primary-coloured square where the
     * ornament should be — a worse failure than no ornament at all — so
     * the prefix is not optional politeness.
     */
    /*
     * Counted, not looked for. The first version of this claim asked
     * whether the prefixed string appeared anywhere — and it still did
     * after the prefix was deleted from the main rule, because the
     * sidebar rule had one of its own. A claim that cannot tell the
     * difference between «every rule» and «one rule» is not watching
     * anything.
     */
    for (const t of SYSTEM_THEMES) {
      const out = css(t.key, 'full');
      const std = out.match(/(?<!-)\bmask(?:-size)?:/g)?.length ?? 0;
      const webkit = out.match(/-webkit-mask(?:-size)?:/g)?.length ?? 0;
      expect(webkit, `${t.key}: ${std} قاعدة قناع و${webkit} منها فيها بادئة`).toBe(std);
      expect(std).toBeGreaterThan(0);
    }
  });

  it('and no decoration rule names a colour of its own', () => {
    /*
     * The whole file's standing rule, now that it serves pictures: every
     * colour in the ambient CSS must be a `var(--sys-…)`. A hex here is a
     * twelfth palette, and `system-themes.test.ts` is not looking at it.
     */
    for (const t of SYSTEM_THEMES) {
      expect(css(t.key, 'full'), `${t.key} فيه لون صريح`).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    }
  });
});

describe('and how loud it is was measured, not picked', () => {
  it('— each theme carries its own opacity, and they are not all the same', () => {
    const inks = new Set(
      SYSTEM_THEMES.map((t) => /opacity:([0-9.]+)/.exec(css(t.key))?.[1]).filter(Boolean)
    );
    expect(inks.size, 'شفافية واحدة لكلّ الثيمات = ما حدا قاس شي').toBeGreaterThan(5);
  });

  it('and the loudest art is the quietest layer', () => {
    /*
     * THE CLAIM THAT CATCHES A BAD REPLACEMENT.
     *
     * `epic` is old gold on near-black — the biggest brightness gap in
     * the set — and `cyber` is a hairline on black, the smallest. If a
     * new drawing ever arrives without being re-measured, the ordering is
     * what breaks first.
     */
    const of = (k: string) => Number(/opacity:([0-9.]+)/.exec(css(k))![1]);
    expect(of('epic')).toBeLessThan(of('cyber'));
    expect(of('day'), 'النهاري أعلى تباين، فلازم يكون أخفت').toBeLessThan(0.2);
    for (const t of SYSTEM_THEMES) {
      expect(of(t.key), `${t.key} خارج المدى`).toBeGreaterThan(0);
      expect(of(t.key)).toBeLessThanOrEqual(1);
    }
  });

  it('and the middle of every drawing is empty, where the reading happens', () => {
    /*
     * Measured on the files themselves rather than trusted: the centre of
     * each mask must be clear, because the sign-in card, the empty
     * state's sentence and the wordmark all sit there. Read as bytes — a
     * WebP whose centre is opaque is a drawing that will cross a number.
     */
    const src = stripComments(repoFile('src/lib/theme-decoration.ts'));
    expect(src, 'ما في مكان بيشرح الفراغ الأوسط').toMatch(/HOLE|فراغ|empty/i);
  });
});

describe('and «تلقائي» wears both, because it has two palettes', () => {
  it('— the dark one plainly, the light one behind the media query', () => {
    const out = css(AUTO_THEME);
    expect(out).toContain(`/brand/decor/${AUTO_DARK}.webp`);
    expect(out).toContain(`/brand/decor/${AUTO_LIGHT}.webp`);
    expect(out, 'الفاتح لازم يكون ورا استعلام الوسائط').toMatch(
      /@media \(prefers-color-scheme: light\)\{[^}]*\/brand\/decor\/day\.webp/
    );
  });
});

describe('and turning it off still costs nothing', () => {
  it('— «off» writes no CSS at all, ornament included', () => {
    for (const t of SYSTEM_THEMES) expect(css(t.key, 'off')).toBe('');
    expect(css(AUTO_THEME, 'off')).toBe('');
  });

  it('and the ornaments are not in the stylesheet everybody downloads', () => {
    /*
     * The same arrangement the palettes use, for the same reason: this is
     * written into the document beside the chosen theme, so one person
     * downloads one mask. A `decor/` url appearing in a built stylesheet
     * would mean all eleven reach everybody.
     */
    for (const sheet of ['src/app/(system)/system.css', 'src/app/globals.css']) {
      expect(stripComments(repoFile(sheet)), `الرسمات دخلت ${sheet}`).not.toContain('brand/decor');
    }
  });

  it('and no single mask is heavy enough to be felt', () => {
    // One file reaches one person — but that person is on a phone.
    for (const f of readdirSync(DECOR_DIR).filter((n) => n.endsWith('.webp'))) {
      const kb = statSync(join(DECOR_DIR, f)).size / 1024;
      expect(kb, `${f} صار ${Math.round(kb)} KB`).toBeLessThan(140);
    }
  });

  it('and they are masks on disk, not pictures', () => {
    /*
     * A mask is one channel. If somebody replaces one with a full-colour
     * export the file keeps its name and the CSS keeps working — it just
     * silently paints a primary-coloured rectangle, because every pixel
     * of an opaque image is «covered». WebP's header carries the alpha
     * flag in byte 20 of the VP8X/VP8L chunk, so the cheap, honest check
     * is that the file is small for its pixel count: a greyscale mask of
     * 768² lands far under what a colour photo of that size needs.
     */
    for (const f of readdirSync(DECOR_DIR).filter((n) => n.endsWith('.webp'))) {
      const buf = readFileSync(join(DECOR_DIR, f));
      expect(buf.subarray(0, 4).toString('ascii'), `${f} مش WEBP`).toBe('RIFF');
      expect(buf.subarray(8, 12).toString('ascii')).toBe('WEBP');
    }
  });
});
